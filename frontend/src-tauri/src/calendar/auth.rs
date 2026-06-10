use reqwest::Client;
use serde::Deserialize;
use std::io::{Read, Write};
use std::net::TcpListener;

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v2/userinfo";
const SCOPE: &str = "https://www.googleapis.com/auth/calendar.readonly";

#[derive(Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<i64>,
}

#[derive(Deserialize)]
struct UserInfo {
    email: Option<String>,
}

fn url_encode(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

pub fn find_free_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    Ok(port)
}

pub fn build_auth_url(client_id: &str, port: u16) -> String {
    let redirect_uri = format!("http://localhost:{}/callback", port);
    format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
        AUTH_URL,
        url_encode(client_id),
        url_encode(&redirect_uri),
        url_encode(SCOPE)
    )
}

pub fn open_browser(url: &str) {
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(url).spawn();

    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("cmd").args(["/c", "start", url]).spawn();

    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open").arg(url).spawn();
}

pub fn wait_for_callback(port: u16) -> Result<String, String> {
    let listener = TcpListener::bind(format!("127.0.0.1:{}", port))
        .map_err(|e| format!("Failed to bind callback server on port {}: {}", port, e))?;

    let (mut stream, _) = listener.accept().map_err(|e| e.to_string())?;

    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
    let request = String::from_utf8_lossy(&buf[..n]).to_string();

    // Extract code from first line: "GET /callback?code=XXX&... HTTP/1.1"
    let code = request
        .lines()
        .next()
        .and_then(|line| {
            let path = line.split_whitespace().nth(1)?;
            let query = path.split('?').nth(1)?;
            for param in query.split('&') {
                let mut parts = param.splitn(2, '=');
                if parts.next() == Some("code") {
                    return parts.next().map(|v| v.to_string());
                }
            }
            None
        })
        .ok_or_else(|| "No authorization code found in callback".to_string())?;

    let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n\
        <html><body style=\"font-family:sans-serif;padding:40px\">\
        <h2>Authentication successful</h2>\
        <p>You can close this window and return to the app.</p>\
        </body></html>";
    let _ = stream.write_all(response.as_bytes());

    Ok(code)
}

pub async fn exchange_code(
    client_id: &str,
    client_secret: &str,
    code: &str,
    port: u16,
) -> Result<TokenResponse, String> {
    let client = Client::new();
    let redirect_uri = format!("http://localhost:{}/callback", port);

    let params = [
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("code", code),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect_uri.as_str()),
    ];

    let response = client
        .post(TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token exchange request failed: {}", e))?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed: {}", text));
    }

    response.json::<TokenResponse>().await.map_err(|e| e.to_string())
}

pub async fn refresh_access_token(
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> Result<(String, i64), String> {
    let client = Client::new();

    let params = [
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];

    let response = client
        .post(TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token refresh request failed: {}", e))?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Token refresh failed: {}", text));
    }

    let token: TokenResponse = response.json().await.map_err(|e| e.to_string())?;
    let expires_at = chrono::Utc::now().timestamp() + token.expires_in.unwrap_or(3600);

    Ok((token.access_token, expires_at))
}

pub async fn fetch_user_email(access_token: &str) -> Option<String> {
    let client = Client::new();
    let response = client
        .get(USERINFO_URL)
        .bearer_auth(access_token)
        .send()
        .await
        .ok()?;

    let info: UserInfo = response.json().await.ok()?;
    info.email
}
