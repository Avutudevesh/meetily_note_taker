use chrono::{DateTime, Duration, Utc};
use reqwest::Client;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct CalendarEvent {
    pub id: String,
    pub summary: Option<String>,
    pub start: EventTime,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EventTime {
    #[serde(rename = "dateTime")]
    pub date_time: Option<String>,
    pub date: Option<String>,
}

#[derive(Deserialize)]
struct EventsResponse {
    items: Option<Vec<CalendarEvent>>,
}

pub async fn get_upcoming_events(
    access_token: &str,
    now: DateTime<Utc>,
    look_ahead_minutes: u32,
) -> Result<Vec<CalendarEvent>, String> {
    let client = Client::new();

    let time_min = now.to_rfc3339();
    let time_max = (now + Duration::minutes(look_ahead_minutes as i64)).to_rfc3339();

    let response = client
        .get("https://www.googleapis.com/calendar/v3/calendars/primary/events")
        .bearer_auth(access_token)
        .query(&[
            ("timeMin", time_min.as_str()),
            ("timeMax", time_max.as_str()),
            ("singleEvents", "true"),
            ("orderBy", "startTime"),
        ])
        .send()
        .await
        .map_err(|e| format!("Calendar API request failed: {}", e))?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Calendar API error: {}", text));
    }

    let events_response: EventsResponse = response.json().await.map_err(|e| e.to_string())?;

    Ok(events_response.items.unwrap_or_default())
}
