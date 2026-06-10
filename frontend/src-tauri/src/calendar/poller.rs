use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::sync::oneshot;

use super::{auth, client, repository, state::CalendarState};
use crate::state::AppState;

#[derive(serde::Serialize, Clone)]
pub struct MeetingReminderPayload {
    pub id: String,
    pub summary: String,
    pub minutes_until: i64,
}

pub fn spawn_poller<R: Runtime>(app: AppHandle<R>, cal_state: Arc<CalendarState>) {
    let (tx, rx) = oneshot::channel::<()>();

    // Stop any existing poller
    {
        let mut lock = cal_state.poller_shutdown.lock().unwrap();
        if let Some(old_tx) = lock.take() {
            let _ = old_tx.send(());
        }
        *lock = Some(tx);
    }

    let app_clone = app.clone();
    let state_clone = cal_state.clone();

    tauri::async_runtime::spawn(async move {
        poll_loop(app_clone, state_clone, rx).await;
    });

    log::info!("[Calendar] Poller started");
}

async fn poll_loop<R: Runtime>(
    app: AppHandle<R>,
    cal_state: Arc<CalendarState>,
    mut shutdown_rx: oneshot::Receiver<()>,
) {
    // Run an initial tick immediately
    if let Err(e) = tick(&app, &cal_state).await {
        log::warn!("[Calendar] Initial poll error: {}", e);
    }

    loop {
        tokio::select! {
            _ = &mut shutdown_rx => {
                log::info!("[Calendar] Poller received shutdown signal");
                break;
            }
            _ = tokio::time::sleep(tokio::time::Duration::from_secs(60)) => {}
        }

        if let Err(e) = tick(&app, &cal_state).await {
            log::warn!("[Calendar] Poll tick error: {}", e);
        }
    }

    log::info!("[Calendar] Poller stopped");
}

async fn tick<R: Runtime>(app: &AppHandle<R>, cal_state: &CalendarState) -> Result<(), String> {
    let app_state = match app.try_state::<AppState>() {
        Some(s) => s,
        None => return Ok(()), // DB not initialized yet
    };
    let pool = app_state.db_manager.pool();

    let creds = repository::get_credentials(pool).await?;
    let creds = match creds {
        Some(c) => c,
        None => return Ok(()), // Not configured
    };

    let mut tokens = match repository::get_tokens(pool).await? {
        Some(t) => t,
        None => return Ok(()), // Not connected
    };

    // Refresh token if expiring within 2 minutes
    let now_ts = chrono::Utc::now().timestamp();
    if tokens.expires_at < now_ts + 120 {
        if let Some(ref rt) = tokens.refresh_token.clone() {
            match auth::refresh_access_token(&creds.client_id, &creds.client_secret, rt).await {
                Ok((new_access, new_expires)) => {
                    tokens.access_token = new_access;
                    tokens.expires_at = new_expires;
                    if let Err(e) = repository::save_tokens(pool, &tokens).await {
                        log::warn!("[Calendar] Failed to persist refreshed tokens: {}", e);
                    }
                }
                Err(e) => {
                    log::warn!("[Calendar] Token refresh failed: {}", e);
                    return Ok(());
                }
            }
        } else {
            log::warn!("[Calendar] Token expired with no refresh token");
            return Ok(());
        }
    }

    let reminder_minutes = repository::get_reminder_minutes(pool).await.unwrap_or(2);

    let now = chrono::Utc::now();
    let events = match client::get_upcoming_events(&tokens.access_token, now, reminder_minutes).await {
        Ok(e) => e,
        Err(e) => {
            log::warn!("[Calendar] Failed to fetch events: {}", e);
            return Ok(());
        }
    };

    let mut notified = cal_state.notified_event_ids.write().await;
    for event in events {
        if notified.contains(&event.id) {
            continue;
        }

        let summary = event.summary.clone().unwrap_or_else(|| "Meeting".to_string());

        let minutes_until = event
            .start
            .date_time
            .as_ref()
            .and_then(|dt| chrono::DateTime::parse_from_rfc3339(dt).ok())
            .map(|dt| dt.signed_duration_since(now).num_minutes())
            .unwrap_or(0);

        log::info!("[Calendar] Emitting reminder for '{}' ({} min)", summary, minutes_until);
        notified.insert(event.id.clone());

        let payload = MeetingReminderPayload {
            id: event.id,
            summary,
            minutes_until,
        };

        if let Err(e) = app.emit("calendar-meeting-reminder", payload) {
            log::warn!("[Calendar] Failed to emit reminder: {}", e);
        }
    }

    Ok(())
}
