use chrono::{DateTime, NaiveDate, NaiveDateTime, Utc};
use reqwest::Client;

#[derive(Debug, Clone)]
pub struct CalendarEvent {
    pub uid: String,
    pub summary: String,
    pub start: DateTime<Utc>,
}

pub async fn fetch_events_from_ics(ics_url: &str) -> Result<Vec<CalendarEvent>, String> {
    // Convert webcal:// to https://
    let url = ics_url.replacen("webcal://", "https://", 1);

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch ICS: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("ICS fetch returned status {}", response.status()));
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read ICS body: {}", e))?;

    Ok(parse_ics(&body))
}

fn unfold_ics(content: &str) -> String {
    // ICS long lines are folded with CRLF + space/tab — unfold them
    content
        .replace("\r\n ", "")
        .replace("\r\n\t", "")
        .replace("\n ", "")
        .replace("\n\t", "")
}

fn unescape_ics(s: &str) -> String {
    s.replace("\\n", "\n")
        .replace("\\N", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
}

fn parse_dtstart(property_with_params: &str, value: &str) -> Option<DateTime<Utc>> {
    let tzid = property_with_params
        .split(';')
        .find(|p| p.starts_with("TZID="))
        .and_then(|p| p.strip_prefix("TZID="));

    // All-day event: VALUE=DATE
    if value.len() == 8 && value.chars().all(|c| c.is_ascii_digit()) {
        let naive = NaiveDate::parse_from_str(value, "%Y%m%d").ok()?;
        return Some(naive.and_hms_opt(0, 0, 0)?.and_utc());
    }

    // UTC datetime (ends with Z)
    if let Some(bare) = value.strip_suffix('Z') {
        let naive = NaiveDateTime::parse_from_str(bare, "%Y%m%dT%H%M%S").ok()?;
        return Some(naive.and_utc());
    }

    // Local datetime with optional TZID
    let naive = NaiveDateTime::parse_from_str(value, "%Y%m%dT%H%M%S").ok()?;

    if let Some(tz_str) = tzid {
        if let Ok(tz) = tz_str.parse::<chrono_tz::Tz>() {
            use chrono::TimeZone;
            return tz
                .from_local_datetime(&naive)
                .single()
                .map(|dt| dt.with_timezone(&Utc));
        }
    }

    // Fallback: treat as UTC
    Some(naive.and_utc())
}

fn parse_ics(content: &str) -> Vec<CalendarEvent> {
    let unfolded = unfold_ics(content);
    let mut events = Vec::new();

    let mut in_event = false;
    let mut uid = String::new();
    let mut summary = String::new();
    let mut dtstart: Option<DateTime<Utc>> = None;

    for line in unfolded.lines() {
        if line == "BEGIN:VEVENT" {
            in_event = true;
            uid.clear();
            summary.clear();
            dtstart = None;
            continue;
        }

        if line == "END:VEVENT" {
            in_event = false;
            if !uid.is_empty() {
                if let Some(start) = dtstart {
                    events.push(CalendarEvent {
                        uid: uid.clone(),
                        summary: if summary.is_empty() {
                            "Meeting".to_string()
                        } else {
                            summary.clone()
                        },
                        start,
                    });
                }
            }
            continue;
        }

        if !in_event {
            continue;
        }

        // Split property name (with params) from value at first ':'
        let (prop, value) = match line.find(':') {
            Some(pos) => (&line[..pos], &line[pos + 1..]),
            None => continue,
        };

        let prop_name = prop.split(';').next().unwrap_or(prop);

        match prop_name {
            "UID" => uid = value.to_string(),
            "SUMMARY" => summary = unescape_ics(value),
            "DTSTART" => dtstart = parse_dtstart(prop, value),
            _ => {}
        }
    }

    events
}
