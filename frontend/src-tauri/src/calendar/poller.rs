use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::sync::oneshot;

use super::{client, repository, state::CalendarState};
use crate::state::AppState;

#[derive(serde::Serialize, Clone)]
pub struct MeetingReminderPayload {
    pub id: String,
    pub summary: String,
    pub minutes_until: i64,
}

pub fn spawn_poller<R: Runtime>(app: AppHandle<R>, cal_state: Arc<CalendarState>) {
    let (tx, rx) = oneshot::channel::<()>();

    // Stop any existing poller before starting a new one
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
    // Initial tick immediately on start
    if let Err(e) = tick(&app, &cal_state).await {
        log::warn!("[Calendar] Initial poll error: {}", e);
    }

    loop {
        tokio::select! {
            _ = &mut shutdown_rx => {
                log::info!("[Calendar] Poller shutting down");
                break;
            }
            _ = tokio::time::sleep(tokio::time::Duration::from_secs(60)) => {}
        }

        if let Err(e) = tick(&app, &cal_state).await {
            log::warn!("[Calendar] Poll tick error: {}", e);
        }
    }
}

async fn tick<R: Runtime>(app: &AppHandle<R>, cal_state: &CalendarState) -> Result<(), String> {
    let app_state = match app.try_state::<AppState>() {
        Some(s) => s,
        None => return Ok(()),
    };
    let pool = app_state.db_manager.pool();

    let ics_url = match repository::get_ics_url(pool).await? {
        Some(u) => u,
        None => return Ok(()),
    };

    let reminder_minutes = repository::get_reminder_minutes(pool).await.unwrap_or(2);
    let now = chrono::Utc::now();
    let window_end = now + chrono::Duration::minutes(reminder_minutes as i64);

    let events = match client::fetch_events_from_ics(&ics_url).await {
        Ok(e) => e,
        Err(e) => {
            log::warn!("[Calendar] ICS fetch failed: {}", e);
            return Ok(());
        }
    };

    let mut notified = cal_state.notified_event_ids.write().await;
    for event in events {
        // Only events starting within [now, now + reminder_minutes]
        if event.start < now || event.start > window_end {
            continue;
        }
        if notified.contains(&event.uid) {
            continue;
        }

        let minutes_until = (event.start - now).num_minutes();
        log::info!(
            "[Calendar] Emitting reminder: '{}' starts in {} min",
            event.summary,
            minutes_until
        );

        notified.insert(event.uid.clone());

        let payload = MeetingReminderPayload {
            id: event.uid,
            summary: event.summary,
            minutes_until,
        };

        if let Err(e) = app.emit("calendar-meeting-reminder", payload) {
            log::warn!("[Calendar] Failed to emit reminder: {}", e);
        }
    }

    Ok(())
}
