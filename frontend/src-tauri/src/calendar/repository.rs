use sqlx::SqlitePool;

pub async fn save_ics_url(pool: &SqlitePool, url: &str) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO calendar_settings (id, ics_url, reminder_minutes)
         VALUES ('singleton', ?, 2)
         ON CONFLICT(id) DO UPDATE SET ics_url = excluded.ics_url"
    )
    .bind(url)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_ics_url(pool: &SqlitePool) -> Result<Option<String>, String> {
    let row = sqlx::query_as::<_, (Option<String>,)>(
        "SELECT ics_url FROM calendar_settings WHERE id = 'singleton'"
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.and_then(|(url,)| url))
}

pub async fn get_reminder_minutes(pool: &SqlitePool) -> Result<u32, String> {
    let row = sqlx::query_as::<_, (i64,)>(
        "SELECT reminder_minutes FROM calendar_settings WHERE id = 'singleton'"
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.map(|(v,)| v as u32).unwrap_or(2))
}

pub async fn set_reminder_minutes(pool: &SqlitePool, minutes: u32) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO calendar_settings (id, reminder_minutes)
         VALUES ('singleton', ?)
         ON CONFLICT(id) DO UPDATE SET reminder_minutes = excluded.reminder_minutes"
    )
    .bind(minutes as i64)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}
