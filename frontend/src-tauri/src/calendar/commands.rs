use std::sync::Arc;
use tauri::{AppHandle, Runtime};

use super::{auth, poller, repository, state::CalendarState};
use crate::state::AppState;

#[derive(serde::Serialize)]
pub struct CalendarStatus {
    pub connected: bool,
    pub account_email: Option<String>,
}

#[tauri::command]
pub async fn calendar_save_credentials(
    state: tauri::State<'_, AppState>,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    let pool = state.db_manager.pool();
    repository::save_credentials(pool, &client_id, &client_secret).await
}

#[tauri::command]
pub async fn calendar_connect<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    cal_state: tauri::State<'_, Arc<CalendarState>>,
) -> Result<String, String> {
    let pool = state.db_manager.pool();

    let creds = repository::get_credentials(pool)
        .await?
        .ok_or_else(|| "No credentials saved. Save your Client ID and Secret first.".to_string())?;

    let port = auth::find_free_port()?;
    let auth_url = auth::build_auth_url(&creds.client_id, port);

    auth::open_browser(&auth_url);

    // Wait for OAuth callback on the redirect server (blocking I/O)
    let code = tokio::task::spawn_blocking(move || auth::wait_for_callback(port))
        .await
        .map_err(|e| format!("Callback thread error: {}", e))??;

    let token_response =
        auth::exchange_code(&creds.client_id, &creds.client_secret, &code, port).await?;

    let expires_at = chrono::Utc::now().timestamp() + token_response.expires_in.unwrap_or(3600);
    let email = auth::fetch_user_email(&token_response.access_token).await;

    let tokens = repository::CalendarTokens {
        access_token: token_response.access_token,
        refresh_token: token_response.refresh_token,
        expires_at,
        account_email: email.clone(),
    };

    repository::save_tokens(pool, &tokens).await?;

    // Start background poller
    let cal_arc = cal_state.inner().clone();
    poller::spawn_poller(app, cal_arc);

    Ok(email.unwrap_or_else(|| "Connected".to_string()))
}

#[tauri::command]
pub async fn calendar_disconnect<R: Runtime>(
    _app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    cal_state: tauri::State<'_, Arc<CalendarState>>,
) -> Result<(), String> {
    // Stop the poller
    {
        let mut lock = cal_state.poller_shutdown.lock().unwrap();
        if let Some(tx) = lock.take() {
            let _ = tx.send(());
        }
    }

    // Clear dedup set so next connect starts fresh
    {
        let mut notified = cal_state.notified_event_ids.write().await;
        notified.clear();
    }

    let pool = state.db_manager.pool();
    repository::delete_tokens(pool).await
}

#[tauri::command]
pub async fn calendar_get_status<R: Runtime>(
    _app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
) -> Result<CalendarStatus, String> {
    let pool = state.db_manager.pool();
    let tokens = repository::get_tokens(pool).await?;

    Ok(CalendarStatus {
        connected: tokens.is_some(),
        account_email: tokens.and_then(|t| t.account_email),
    })
}

#[tauri::command]
pub async fn calendar_set_reminder_minutes<R: Runtime>(
    _app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    minutes: u32,
) -> Result<(), String> {
    let pool = state.db_manager.pool();
    repository::set_reminder_minutes(pool, minutes).await
}

#[tauri::command]
pub async fn calendar_get_reminder_minutes<R: Runtime>(
    _app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
) -> Result<u32, String> {
    let pool = state.db_manager.pool();
    repository::get_reminder_minutes(pool).await
}
