use std::sync::Arc;
use tauri::{AppHandle, Runtime};

use super::{client, poller, repository, state::CalendarState};
use crate::state::AppState;

#[derive(serde::Serialize)]
pub struct CalendarStatus {
    pub connected: bool,
    pub ics_url: Option<String>,
}

#[tauri::command]
pub async fn calendar_save_ics_url(
    state: tauri::State<'_, AppState>,
    cal_state: tauri::State<'_, Arc<CalendarState>>,
    app: AppHandle<tauri::Wry>,
    ics_url: String,
) -> Result<(), String> {
    let pool = state.db_manager.pool();
    repository::save_ics_url(pool, &ics_url).await?;

    // Restart poller with the new URL
    let cal_arc = cal_state.inner().clone();
    poller::spawn_poller(app, cal_arc);

    Ok(())
}

#[tauri::command]
pub async fn calendar_get_status(
    state: tauri::State<'_, AppState>,
) -> Result<CalendarStatus, String> {
    let pool = state.db_manager.pool();
    let ics_url = repository::get_ics_url(pool).await?;

    Ok(CalendarStatus {
        connected: ics_url.is_some(),
        ics_url,
    })
}

#[tauri::command]
pub async fn calendar_remove_ics_url(
    state: tauri::State<'_, AppState>,
    cal_state: tauri::State<'_, Arc<CalendarState>>,
) -> Result<(), String> {
    // Stop poller
    {
        let mut lock = cal_state.poller_shutdown.lock().unwrap();
        if let Some(tx) = lock.take() {
            let _ = tx.send(());
        }
    }
    {
        let mut notified = cal_state.notified_event_ids.write().await;
        notified.clear();
    }

    let pool = state.db_manager.pool();
    sqlx::query("UPDATE calendar_settings SET ics_url = NULL WHERE id = 'singleton'")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn calendar_test_ics_url(ics_url: String) -> Result<usize, String> {
    let events = client::fetch_events_from_ics(&ics_url).await?;
    Ok(events.len())
}

#[tauri::command]
pub async fn calendar_set_reminder_minutes(
    state: tauri::State<'_, AppState>,
    minutes: u32,
) -> Result<(), String> {
    let pool = state.db_manager.pool();
    repository::set_reminder_minutes(pool, minutes).await
}

#[tauri::command]
pub async fn calendar_get_reminder_minutes(
    state: tauri::State<'_, AppState>,
) -> Result<u32, String> {
    let pool = state.db_manager.pool();
    repository::get_reminder_minutes(pool).await
}
