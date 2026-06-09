/// Embedded default templates using compile-time inclusion
///
/// These templates are bundled into the binary and serve as fallbacks
/// when custom templates are not available.

/// Daily standup template for engineering/product teams
pub const DAILY_STANDUP: &str = include_str!("../../../templates/daily_standup.json");

/// Standard meeting notes template
pub const STANDARD_MEETING: &str = include_str!("../../../templates/standard_meeting.json");

/// Category progress/status update template
pub const CATEGORY_UPDATE: &str = include_str!("../../../templates/category_update.json");

/// Project engagement details template
pub const PROJECT_ENGAGEMENT_DETAILS: &str =
    include_str!("../../../templates/project_engagement_details.json");

/// Registry of all built-in templates
///
/// Maps template identifiers to their embedded JSON content
pub fn get_builtin_templates() -> Vec<(&'static str, &'static str)> {
    vec![
        ("daily_standup", DAILY_STANDUP),
        ("standard_meeting", STANDARD_MEETING),
        ("category_update", CATEGORY_UPDATE),
        ("project_engagement_details", PROJECT_ENGAGEMENT_DETAILS),
    ]
}

/// Get a built-in template by identifier
///
/// # Arguments
/// * `id` - Template identifier (e.g., "daily_standup", "standard_meeting")
///
/// # Returns
/// The template JSON content if found, None otherwise
pub fn get_builtin_template(id: &str) -> Option<&'static str> {
    match id {
        "daily_standup" => Some(DAILY_STANDUP),
        "standard_meeting" => Some(STANDARD_MEETING),
        "category_update" => Some(CATEGORY_UPDATE),
        "project_engagement_details" => Some(PROJECT_ENGAGEMENT_DETAILS),
        _ => None,
    }
}

/// List all built-in template identifiers
pub fn list_builtin_template_ids() -> Vec<&'static str> {
    vec![
        "category_update",
        "daily_standup",
        "project_engagement_details",
        "standard_meeting",
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_builtin_templates_valid_json() {
        for (id, content) in get_builtin_templates() {
            let result = serde_json::from_str::<serde_json::Value>(content);
            assert!(
                result.is_ok(),
                "Built-in template '{}' contains invalid JSON: {:?}",
                id,
                result.err()
            );
        }
    }

    #[test]
    fn test_get_builtin_template() {
        assert!(get_builtin_template("daily_standup").is_some());
        assert!(get_builtin_template("standard_meeting").is_some());
        assert!(get_builtin_template("nonexistent").is_none());
    }
}
