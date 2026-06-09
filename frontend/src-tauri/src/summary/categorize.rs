use crate::database::repositories::setting::SettingsRepository;
use crate::state::AppState;
use crate::summary::llm_client::{generate_summary, LLMProvider};
use crate::summary::processor::clean_llm_markdown_output;
use crate::summary::templates::get_template;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};
use tracing::{error, info, warn};

// ── Input types (from frontend) ──────────────────────────────────────────────

/// Transcript content for a single meeting, pre-formatted as "[MM:SS] text\n..."
#[derive(Debug, Deserialize)]
pub struct MeetingTranscriptInput {
    pub meeting_id: String,
    pub meeting_title: String,
    pub formatted_text: String,
}

/// A single excerpt that has been assigned to a category
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssignedExcerpt {
    pub meeting_title: String,
    pub timestamp: String,
    pub text: String,
}

/// A category together with all excerpts the AI assigned to it
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryAssignment {
    pub category: String,
    pub excerpts: Vec<AssignedExcerpt>,
}

// ── Output types (to frontend) ────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct CategorizeResponse {
    pub assignments: Vec<CategoryAssignment>,
}

#[derive(Debug, Serialize)]
pub struct CategorySummaryResult {
    pub category: String,
    pub template_used: String,
    pub markdown: String,
}

#[derive(Debug, Serialize)]
pub struct CategorySummariesResponse {
    pub results: Vec<CategorySummaryResult>,
}

// ── Provider setup helper ─────────────────────────────────────────────────────

struct ProviderConfig {
    provider: LLMProvider,
    api_key: String,
    ollama_endpoint: Option<String>,
    custom_openai_endpoint: Option<String>,
    custom_openai_api_key: Option<String>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
    top_p: Option<f32>,
    app_data_dir: Option<std::path::PathBuf>,
}

async fn resolve_provider_config<R: Runtime>(
    app: &AppHandle<R>,
    pool: &sqlx::SqlitePool,
    model_provider: &str,
) -> Result<ProviderConfig, String> {
    let provider = LLMProvider::from_str(model_provider)?;

    let api_key = if provider == LLMProvider::Ollama
        || provider == LLMProvider::BuiltInAI
        || provider == LLMProvider::CustomOpenAI
    {
        String::new()
    } else {
        match SettingsRepository::get_api_key(pool, model_provider).await {
            Ok(Some(key)) if !key.is_empty() => key,
            _ => {
                return Err(format!("API key not found for {}", model_provider));
            }
        }
    };

    let ollama_endpoint = if provider == LLMProvider::Ollama {
        match SettingsRepository::get_model_config(pool).await {
            Ok(Some(config)) => config.ollama_endpoint,
            _ => None,
        }
    } else {
        None
    };

    let (custom_openai_endpoint, custom_openai_api_key, max_tokens, temperature, top_p) =
        if provider == LLMProvider::CustomOpenAI {
            match SettingsRepository::get_custom_openai_config(pool).await {
                Ok(Some(config)) => (
                    Some(config.endpoint),
                    config.api_key,
                    config.max_tokens.map(|t| t as u32),
                    config.temperature,
                    config.top_p,
                ),
                _ => {
                    return Err(
                        "Custom OpenAI provider selected but no configuration found".to_string()
                    );
                }
            }
        } else {
            (None, None, None, None, None)
        };

    let final_api_key = if provider == LLMProvider::CustomOpenAI {
        custom_openai_api_key.clone().unwrap_or_default()
    } else {
        api_key
    };

    let app_data_dir = app.path().app_data_dir().ok();

    Ok(ProviderConfig {
        provider,
        api_key: final_api_key,
        ollama_endpoint,
        custom_openai_endpoint,
        custom_openai_api_key,
        max_tokens,
        temperature,
        top_p,
        app_data_dir,
    })
}

// ── JSON cleaning helper ──────────────────────────────────────────────────────

/// Strip markdown fences from a JSON response the LLM may have wrapped
fn extract_json_from_llm_output(raw: &str) -> &str {
    let trimmed = raw.trim();
    const JSON_PREFIXES: &[&str] = &["```json\n", "```\n"];
    for prefix in JSON_PREFIXES {
        if trimmed.starts_with(prefix) && trimmed.ends_with("```") {
            return trimmed[prefix.len()..trimmed.len() - 3].trim();
        }
    }
    trimmed
}

// ── Command 1: Categorise transcripts ────────────────────────────────────────

/// Classifies transcript content from multiple meetings into user-defined categories.
///
/// The frontend pre-formats transcripts per meeting as "[MM:SS] text\n..." and passes
/// them alongside the category list. The LLM returns JSON assigning excerpts to
/// categories, which the user can then review and adjust before generation.
#[tauri::command]
pub async fn api_categorize_transcripts<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    meeting_transcripts: Vec<MeetingTranscriptInput>,
    categories: Vec<String>,
    model: String,
    model_name: String,
) -> Result<CategorizeResponse, String> {
    info!(
        "api_categorize_transcripts called: {} meetings, {} categories, model: {}",
        meeting_transcripts.len(),
        categories.len(),
        model
    );

    if meeting_transcripts.is_empty() {
        return Err("No meetings selected".to_string());
    }
    if categories.is_empty() {
        return Err("No categories defined".to_string());
    }

    let pool = state.db_manager.pool();
    let config = resolve_provider_config(&app, pool, &model).await?;

    // Build the combined transcript block, grouped by meeting
    let combined = meeting_transcripts
        .iter()
        .map(|m| {
            format!(
                "=== Meeting: {} ===\n{}",
                m.meeting_title,
                m.formatted_text.trim()
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    let categories_list = categories
        .iter()
        .enumerate()
        .map(|(i, c)| format!("{}. {}", i + 1, c))
        .collect::<Vec<_>>()
        .join("\n");

    let system_prompt = format!(
        r#"You are analysing meeting transcripts from multiple meetings. Your task is to extract and assign relevant excerpts to the user-defined categories below.

Categories:
{categories_list}

Instructions:
- Read all the transcript content carefully.
- For each category, extract the most relevant passages or discussion points.
- Each excerpt should be a concise, self-contained quote or paraphrase from the transcript.
- Include the meeting title and the timestamp (e.g. "[MM:SS]") for each excerpt.
- A passage may appear under more than one category if it is relevant to both.
- If no content is found for a category, return an empty array for that category.
- Return ONLY valid JSON in the following format, with no additional text or markdown fences:

{{
  "CategoryName": [
    {{"meeting": "Meeting Title", "timestamp": "[MM:SS]", "text": "excerpt text"}},
    ...
  ],
  "AnotherCategory": [...]
}}

Use the exact category names as provided."#,
        categories_list = categories_list
    );

    let user_prompt = format!(
        "Here are the meeting transcripts to analyse:\n\n{combined}"
    );

    let client = reqwest::Client::new();
    let raw_response = generate_summary(
        &client,
        &config.provider,
        &model_name,
        &config.api_key,
        &system_prompt,
        &user_prompt,
        config.ollama_endpoint.as_deref(),
        config.custom_openai_endpoint.as_deref(),
        config.max_tokens,
        config.temperature,
        config.top_p,
        config.app_data_dir.as_ref(),
        None,
    )
    .await
    .map_err(|e| format!("LLM call failed: {}", e))?;

    let json_str = extract_json_from_llm_output(&raw_response);

    let parsed: serde_json::Value = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse categorisation response as JSON: {}. Raw: {}", e, &raw_response[..raw_response.len().min(500)]))?;

    let obj = parsed
        .as_object()
        .ok_or_else(|| "Expected a JSON object from the LLM".to_string())?;

    // Build assignments preserving the user's category order
    let mut assignments: Vec<CategoryAssignment> = categories
        .iter()
        .map(|cat| {
            let excerpts = obj
                .get(cat.as_str())
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|item| {
                            Some(AssignedExcerpt {
                                meeting_title: item
                                    .get("meeting")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                timestamp: item
                                    .get("timestamp")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                text: item
                                    .get("text")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();

            CategoryAssignment {
                category: cat.clone(),
                excerpts,
            }
        })
        .collect();

    // Also pick up any extra categories the LLM returned that weren't in the original list
    for (key, val) in obj {
        if !categories.contains(key) {
            if let Some(arr) = val.as_array() {
                let excerpts: Vec<AssignedExcerpt> = arr
                    .iter()
                    .filter_map(|item| {
                        Some(AssignedExcerpt {
                            meeting_title: item
                                .get("meeting")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            timestamp: item
                                .get("timestamp")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            text: item
                                .get("text")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                        })
                    })
                    .collect();
                if !excerpts.is_empty() {
                    assignments.push(CategoryAssignment {
                        category: key.clone(),
                        excerpts,
                    });
                }
            }
        }
    }

    info!(
        "Categorisation complete: {} categories with assignments",
        assignments.len()
    );

    Ok(CategorizeResponse { assignments })
}

// ── Command 2: Generate per-category summaries ────────────────────────────────

/// Generates a structured summary for each category using the most appropriate template.
///
/// For each category the LLM selects between `category_update` (ongoing work / status)
/// and `project_engagement_details` (project scoping / stakeholder context), then fills
/// the chosen template's sections with the category's assigned excerpts.
#[tauri::command]
pub async fn api_generate_category_summaries<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    assignments: Vec<CategoryAssignment>,
    model: String,
    model_name: String,
) -> Result<CategorySummariesResponse, String> {
    info!(
        "api_generate_category_summaries called: {} categories, model: {}",
        assignments.len(),
        model
    );

    if assignments.is_empty() {
        return Err("No category assignments provided".to_string());
    }

    let pool = state.db_manager.pool();
    let config = resolve_provider_config(&app, pool, &model).await?;

    // Pre-load both templates so we can include their structure in the prompt
    let update_template = get_template("category_update")
        .map_err(|e| format!("Failed to load category_update template: {}", e))?;
    let engagement_template = get_template("project_engagement_details")
        .map_err(|e| format!("Failed to load project_engagement_details template: {}", e))?;

    let client = reqwest::Client::new();
    let mut results: Vec<CategorySummaryResult> = Vec::new();

    for assignment in &assignments {
        if assignment.excerpts.is_empty() {
            info!("Skipping category '{}' — no excerpts", assignment.category);
            continue;
        }

        info!(
            "Generating summary for category '{}' ({} excerpts)",
            assignment.category,
            assignment.excerpts.len()
        );

        // Build the transcript block for this category
        let transcript_block = assignment
            .excerpts
            .iter()
            .map(|e| format!("[{}] {} — {}", e.meeting_title, e.timestamp, e.text))
            .collect::<Vec<_>>()
            .join("\n");

        let system_prompt = format!(
            r#"You are generating a structured summary for the category: "{category}".

You must choose the most appropriate template based on the content:
- Use `category_update` if the content is primarily about ongoing work, progress, status updates, blockers, or next steps.
- Use `project_engagement_details` if the content involves project scoping, goals, stakeholder alignment, deliverables, or high-level planning.

On the FIRST line of your response, output ONLY:
TEMPLATE: <id>

Where <id> is exactly `category_update` or `project_engagement_details`.

Then output the filled-in template in markdown, following these section instructions:

--- TEMPLATE: category_update ---
{update_instructions}

--- TEMPLATE: project_engagement_details ---
{engagement_instructions}

Rules:
- Use only information present in the provided excerpts.
- Do not infer or add information that is not mentioned.
- Complete every section of your chosen template.
- Use markdown formatting as described in each section."#,
            category = assignment.category,
            update_instructions = update_template.to_section_instructions(),
            engagement_instructions = engagement_template.to_section_instructions(),
        );

        let user_prompt = format!(
            "Category: {category}\n\nTranscript excerpts:\n{transcript_block}",
            category = assignment.category,
            transcript_block = transcript_block
        );

        let raw = match generate_summary(
            &client,
            &config.provider,
            &model_name,
            &config.api_key,
            &system_prompt,
            &user_prompt,
            config.ollama_endpoint.as_deref(),
            config.custom_openai_endpoint.as_deref(),
            config.max_tokens,
            config.temperature,
            config.top_p,
            config.app_data_dir.as_ref(),
            None,
        )
        .await
        {
            Ok(text) => text,
            Err(e) => {
                error!(
                    "LLM call failed for category '{}': {}",
                    assignment.category, e
                );
                // Return error result but continue processing other categories
                results.push(CategorySummaryResult {
                    category: assignment.category.clone(),
                    template_used: "unknown".to_string(),
                    markdown: format!("*Error generating summary: {}*", e),
                });
                continue;
            }
        };

        // Parse the TEMPLATE: <id> line then treat the rest as markdown
        let cleaned = clean_llm_markdown_output(&raw);
        let (template_used, markdown) = parse_template_and_markdown(&cleaned);

        info!(
            "Category '{}' summary generated using template '{}'",
            assignment.category, template_used
        );

        results.push(CategorySummaryResult {
            category: assignment.category.clone(),
            template_used,
            markdown,
        });
    }

    Ok(CategorySummariesResponse { results })
}

// ── Helper: parse TEMPLATE: line from LLM output ─────────────────────────────

fn parse_template_and_markdown(cleaned: &str) -> (String, String) {
    let mut lines = cleaned.lines();
    if let Some(first) = lines.next() {
        let first_trimmed = first.trim();
        if let Some(id) = first_trimmed
            .strip_prefix("TEMPLATE:")
            .map(|s| s.trim().to_string())
        {
            let rest = lines.collect::<Vec<_>>().join("\n").trim().to_string();
            return (id, rest);
        }
    }
    // If the LLM didn't follow the format, use the full output and mark template unknown
    warn!("LLM did not emit a TEMPLATE: line; defaulting to category_update");
    ("category_update".to_string(), cleaned.to_string())
}
