use sqlx::SqlitePool;

pub struct CalendarCredentials {
    pub client_id: String,
    pub client_secret: String,
}

pub struct CalendarTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: i64,
    pub account_email: Option<String>,
}

pub async fn save_credentials(pool: &SqlitePool, client_id: &str, client_secret: &str) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO google_calendar_credentials (id, client_id, client_secret)
         VALUES ('singleton', ?, ?)
         ON CONFLICT(id) DO UPDATE SET client_id = excluded.client_id, client_secret = excluded.client_secret"
    )
    .bind(client_id)
    .bind(client_secret)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_credentials(pool: &SqlitePool) -> Result<Option<CalendarCredentials>, String> {
    let row = sqlx::query_as::<_, (String, String)>(
        "SELECT client_id, client_secret FROM google_calendar_credentials WHERE id = 'singleton'"
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.map(|(client_id, client_secret)| CalendarCredentials { client_id, client_secret }))
}

pub async fn save_tokens(pool: &SqlitePool, tokens: &CalendarTokens) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO google_calendar_tokens (id, access_token, refresh_token, expires_at, account_email)
         VALUES ('singleton', ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            access_token = excluded.access_token,
            refresh_token = excluded.refresh_token,
            expires_at = excluded.expires_at,
            account_email = excluded.account_email"
    )
    .bind(&tokens.access_token)
    .bind(&tokens.refresh_token)
    .bind(tokens.expires_at)
    .bind(&tokens.account_email)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_tokens(pool: &SqlitePool) -> Result<Option<CalendarTokens>, String> {
    let row = sqlx::query_as::<_, (String, Option<String>, i64, Option<String>)>(
        "SELECT access_token, refresh_token, expires_at, account_email FROM google_calendar_tokens WHERE id = 'singleton'"
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.map(|(access_token, refresh_token, expires_at, account_email)| CalendarTokens {
        access_token,
        refresh_token,
        expires_at,
        account_email,
    }))
}

pub async fn delete_tokens(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query("DELETE FROM google_calendar_tokens WHERE id = 'singleton'")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
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
        "INSERT INTO calendar_settings (id, reminder_minutes) VALUES ('singleton', ?)
         ON CONFLICT(id) DO UPDATE SET reminder_minutes = excluded.reminder_minutes"
    )
    .bind(minutes as i64)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}
