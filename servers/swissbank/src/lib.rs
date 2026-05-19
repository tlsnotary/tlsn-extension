use std::{
    net::SocketAddr,
    sync::{Arc, RwLock},
};

use axum::{
    extract::{ConnectInfo, Form},
    http::Request,
    middleware::{self, Next},
    response::{Html, IntoResponse, Redirect},
    routing::{get, post},
    Json, Router,
};
use axum_extra::extract::cookie::{Cookie, CookieJar};
use dioxus::prelude::*;
use lazy_static::lazy_static;
use tower_http::trace::TraceLayer;

use hyper::StatusCode;
use tokio::net::TcpListener;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use axum::extract::FromRequest;
use hyper::header;

use tracing::info;

pub const DEFAULT_FIXTURE_PORT: u16 = 3000;
const AUTH_TOKEN: &str = "random_auth_token";
const SESSION_COOKIE: &str = "bank_session";
const HARDCODED_USERS: [(&str, &str); 2] = [
    ("tkstanczak", "TLSNotary is my favorite project"),
    ("admin", "admin"),
];
const DASHBOARD_CSS: &str = include_str!("dashboard.css");
const HTMX_JS: &str = include_str!("htmx.min.js");

fn get_local_ip() -> String {
    if let Ok(ip) = local_ip_address::local_ip() {
        if !ip.is_loopback() {
            return ip.to_string();
        }
    }
    "localhost".to_string()
}

lazy_static! {
    static ref GLOBAL_LOGS: Arc<RwLock<Vec<LogEntry>>> = Arc::new(RwLock::new(Vec::new()));
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: DateTime<Utc>,
    pub message: String,
}

// Helper function to add logs to global storage
fn add_to_global_log(message: String) {
    let entry = LogEntry {
        timestamp: Utc::now(),
        message,
    };

    let mut logs = GLOBAL_LOGS.write().unwrap();
    logs.push(entry);

    // Keep only the last 15 entries to avoid unbounded memory growth
    if logs.len() > 15 {
        let len = logs.len();
        logs.drain(0..len - 15);
    }
}

fn app() -> Router {
    Router::new()
        .route("/", get(home_handler))
        .route("/login", get(login_page_handler))
        .route("/login", post(login_handler))
        .route("/account", get(account_page_handler))
        .route("/dashboard", get(dashboard_handler))
        .route("/balances", get(balances_route))
        .route("/logs", get(logs_endpoint))
        .route("/logs-html", get(logs_html_endpoint))
        .layer(middleware::from_fn(access_log_middleware))
        .layer(TraceLayer::new_for_http())
}

async fn logs_html_endpoint() -> Html<String> {
    let logs = GLOBAL_LOGS.read().unwrap();

    let html = if logs.is_empty() {
        String::from(
            r#"<tr><td colspan="2" style="text-align: center; font-style: italic;">Waiting for access attempts...</td></tr>"#,
        )
    } else {
        logs.iter()
            .rev()
            .map(|entry| {
                let time_str = entry.timestamp.format("%H:%M:%S").to_string();
                let status_class = if entry.message.contains("✅") {
                    "status-authorized"
                } else if entry.message.contains("❌") {
                    "status-unauthorized"
                } else {
                    ""
                };
                format!(
                    r#"<tr><td>{}</td><td class="{}">{}</td></tr>"#,
                    time_str, status_class, entry.message
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    Html(html)
}

/// Start the HTTP server
pub async fn serve() -> anyhow::Result<()> {
    let addr = std::env::var("ADDR").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = std::env::var("PORT")
        .map(|port| port.parse().unwrap())
        .unwrap_or_else(|_| DEFAULT_FIXTURE_PORT);

    let listener = TcpListener::bind((addr.as_str(), port)).await?;
    info!("Starting HTTP server on {}:{}", addr, port);

    let app = app();

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}

async fn access_log_middleware(
    req: Request<axum::body::Body>,
    next: Next,
) -> axum::response::Response {
    // Only log requests to /balances
    if req.uri().path() == "/balances" {
        // Try to get the real client IP from X-Forwarded-For header first (set by reverse proxy)
        let ip = req
            .headers()
            .get("x-forwarded-for")
            .and_then(|value| value.to_str().ok())
            .and_then(|forwarded| forwarded.split(',').next()) // Take the first IP if multiple
            .map(|ip| ip.trim().to_string())
            .or_else(|| {
                // Fallback to X-Real-IP header
                req.headers()
                    .get("x-real-ip")
                    .and_then(|value| value.to_str().ok())
                    .map(|ip| ip.to_string())
            })
            .unwrap_or_else(|| {
                // Final fallback to the direct connection IP
                req.extensions()
                    .get::<ConnectInfo<SocketAddr>>()
                    .map(|ConnectInfo(addr)| addr.ip().to_string())
                    .unwrap_or_else(|| "<unknown>".to_string())
            });

        // Check authorization header
        let is_authorized = req
            .headers()
            .get("authorization")
            .and_then(|value| value.to_str().ok())
            .map(|auth_token| {
                let token = auth_token.trim_start_matches("Bearer ");
                token == AUTH_TOKEN
            })
            .unwrap_or(false);

        let message = if is_authorized {
            format!("✅ Authorized access to /balances from {}", ip)
        } else {
            format!("❌ Unauthorized access attempt to /balances from {}", ip)
        };

        // Log to console and to our global in-memory log
        info!("{}", message);
        add_to_global_log(message);
    }

    next.run(req).await
}

struct AuthenticatedUser;

#[derive(Debug, Deserialize)]
struct LoginForm {
    username: String,
    password: String,
}

impl<S> FromRequest<S> for AuthenticatedUser
where
    S: Send + Sync,
{
    type Rejection = (StatusCode, &'static str);

    async fn from_request(
        req: axum::extract::Request,
        _state: &S,
    ) -> Result<Self, Self::Rejection> {
        // First check for session cookie
        let cookies = CookieJar::from_headers(req.headers());
        if let Some(session_cookie) = cookies.get(SESSION_COOKIE) {
            if session_cookie.value() == AUTH_TOKEN {
                return Ok(AuthenticatedUser);
            }
        }

        // Fallback to Bearer token for API access
        let auth_header = req
            .headers()
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok());

        if let Some(auth_token) = auth_header {
            let token = auth_token.trim_start_matches("Bearer ");
            if token == AUTH_TOKEN {
                return Ok(AuthenticatedUser);
            }
        }

        Err((StatusCode::UNAUTHORIZED, "Invalid or missing token"))
    }
}

async fn balances_route(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    _: AuthenticatedUser,
) -> Result<Json<Value>, StatusCode> {
    info!("Balances accessed from: {}", addr);
    get_bank_data()
}

async fn account_page_handler(jar: CookieJar) -> impl IntoResponse {
    // Check if the user is authenticated
    let is_authenticated = jar.get(SESSION_COOKIE)
        .map(|cookie| cookie.value() == AUTH_TOKEN)
        .unwrap_or(false);

    if is_authenticated {
        // User is authenticated, show the balances page
        let mut vdom = VirtualDom::new(BalancesPage);
        vdom.rebuild_in_place();
        let html = dioxus_ssr::render(&vdom);
        Html(html).into_response()
    } else {
        // User is not authenticated, show login required page
        let mut vdom = VirtualDom::new(LoginRequiredPage);
        vdom.rebuild_in_place();
        let html = dioxus_ssr::render(&vdom);
        Html(html).into_response()
    }
}

fn get_bank_data() -> Result<Json<Value>, StatusCode> {
    Ok(Json(
        serde_json::from_str(include_str!("data/swissbankdata.json")).map_err(|e| {
            eprintln!("Failed to parse JSON data: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?,
    ))
}

async fn logs_endpoint() -> Json<Vec<LogEntry>> {
    let logs = GLOBAL_LOGS.read().unwrap();
    Json(logs.clone())
}

async fn login_page_handler(jar: CookieJar) -> impl IntoResponse {
    // Check if already logged in
    if let Some(cookie) = jar.get(SESSION_COOKIE) {
        if cookie.value() == AUTH_TOKEN {
            return Redirect::to("/account").into_response();
        }
    }

    let mut vdom = VirtualDom::new_with_props(LoginPage, LoginPageProps { error: None });
    vdom.rebuild_in_place();
    let html = dioxus_ssr::render(&vdom);
    Html(html).into_response()
}

async fn login_handler(jar: CookieJar, Form(form): Form<LoginForm>) -> impl IntoResponse {
    if HARDCODED_USERS.contains(&(form.username.as_str(), form.password.as_str())) {
        // Set session cookie
        let cookie = Cookie::build((SESSION_COOKIE, AUTH_TOKEN))
            .path("/")
            .http_only(true)
            .build();

        let jar = jar.add(cookie);

        info!("Successful login for user: {}", form.username);
        add_to_global_log(format!(
            "✅ User '{}' logged in successfully",
            form.username
        ));

        (jar, Redirect::to("/account")).into_response()
    } else {
        info!("Failed login attempt for user: {}", form.username);
        add_to_global_log(format!(
            "❌ Failed login attempt for user '{}'",
            form.username
        ));

        // Return to login with error
        let mut vdom = VirtualDom::new_with_props(
            LoginPage,
            LoginPageProps {
                error: Some("Invalid username or password"),
            },
        );
        vdom.rebuild_in_place();
        let html = dioxus_ssr::render(&vdom);
        (jar, Html(html)).into_response()
    }
}

async fn home_handler() -> Html<String> {
    let mut vdom = VirtualDom::new(HomePage);
    vdom.rebuild_in_place();
    let html = dioxus_ssr::render(&vdom);
    Html(html)
}

async fn dashboard_handler() -> Html<String> {
    let local_ip = get_local_ip();
    let port = std::env::var("PORT").unwrap_or_else(|_| DEFAULT_FIXTURE_PORT.to_string());
    let host = format!("{}:{}", local_ip, port);

    let mut vdom = VirtualDom::new_with_props(App, AppProps { host });
    vdom.rebuild_in_place();
    let app_html = dioxus_ssr::render(&vdom);
    Html(app_html)
}

#[derive(Props, Clone, PartialEq)]
pub struct AppProps {
    host: String,
}

fn redact_json(json_str: &str) -> String {
    json_str
        .chars()
        .map(|c| match c {
            '0'..='9' => '█',
            '_' => '█',
            'a'..='z' | 'A'..='Z' => '█',
            _ => c,
        })
        .collect()
}

#[component]
pub fn HomePage() -> Element {
    rsx! {
        head {
            meta { charset: "utf-8" }
            meta { name: "viewport", content: "width=device-width, initial-scale=1" }
            title { "Swiss Bank Demo" }
            style { dangerous_inner_html: DASHBOARD_CSS }
        }
        body { class: "home-body",
            div { class: "home-container",
                h1 { "TLSNotary Swiss Bank Demo" }
                div { class: "description",
                    p { "This is a demonstration of TLSNotary technology using a simulated Swiss bank scenario. The bank's reserves are protected behind an authentication token, demonstrating how TLSNotary can verify private API data without revealing credentials." }
                    p { "Use the dashboard to monitor access attempts in real-time and see how authenticated requests reveal the bank data." }
                }
                div { class: "links",
                    a { class: "link-item", href: "/login",
                        div { class: "link-title", "Login" }
                        div { class: "link-desc", "Login to access your bank account" }
                    }
                    a { class: "link-item", href: "/account",
                        div { class: "link-title", "Account" }
                        div { class: "link-desc", "View your account balances (requires login)" }
                    }
                    a { class: "link-item", href: "/dashboard",
                        div { class: "link-title", "Dashboard" }
                        div { class: "link-desc", "View the live access log and bank reserves" }
                    }
                    a { class: "link-item", href: "/balances",
                        div { class: "link-title", "Balances API" }
                        div { class: "link-desc", "Access bank balances JSON (requires authentication)" }
                    }
                    a { class: "link-item", href: "/logs",
                        div { class: "link-title", "Logs" }
                        div { class: "link-desc", "View access logs in JSON format" }
                    }
                }
            }
        }
    }
}

#[allow(non_snake_case)] // Dioxus component convention is PascalCase
pub fn App(_props: AppProps) -> Element {
    let data = get_bank_data().unwrap();
    let data_str = serde_json::to_string_pretty(&*data).unwrap();
    let redacted = redact_json(&data_str);

    let data_escaped = data_str
        .replace("\\", "\\\\")
        .replace("`", "\\`")
        .replace("$", "\\$");
    let redacted_escaped = redacted
        .replace("\\", "\\\\")
        .replace("`", "\\`")
        .replace("$", "\\$");

    rsx! {
        head {
            meta { charset: "utf-8" }
            meta { name: "viewport", content: "width=device-width, initial-scale=1" }
            title { "Swiss Bank Demo" }
            script { dangerous_inner_html: HTMX_JS }
            style { dangerous_inner_html: DASHBOARD_CSS }
        }
        body {
            div { class: "container",
                    div { class: "header",
                        h1 { "TLSNotary Swiss Bank Demo" }
                        p { "This demo server holds the EF's (fake) cash reserves." }
                        p { "Only the EF has the authentication token to access the data" }

                    }

                    div { class: "content-grid",
                        div { class: "section",
                            h2 { "Bank Reserves" }
                            pre {
                                code { id: "bank-data", "{redacted}" }
                            }
                            p { style: "font-size: 0.9em; font-style: italic; color: #666; margin-top: 10px;", "(Hold 'S' to reveal data)" }
                        }

                        div { class: "section",
                            h2 { "Live Access Log" }
                            table { class: "log-table",
                                thead {
                                    tr {
                                        th { style: "width: 120px;", "Time" }
                                        th { "Activity" }
                                    }
                                }
                                tbody {
                                    "hx-get": "/logs-html",
                                    "hx-trigger": "load, every 2s",
                                    "hx-swap": "innerHTML"
                                }
                            }
                        }
                    }
            }
            script { dangerous_inner_html: "
                (function() {{
                    const realData = `{data_escaped}`;
                    const redactedData = `{redacted_escaped}`;

                    document.addEventListener('keydown', function(event) {{
                        if (event.key === 's' || event.key === 'S' || event.key === 'a') {{
                            const codeElement = document.getElementById('bank-data');
                            if (codeElement) {{
                                codeElement.textContent = realData;
                            }}
                        }}
                    }});

                    document.addEventListener('keyup', function(event) {{
                        if (event.key === 's' || event.key === 'S' || event.key === 'a') {{
                            const codeElement = document.getElementById('bank-data');
                            if (codeElement) {{
                                codeElement.textContent = redactedData;
                            }}
                        }}
                    }});
                }})();
            " }
        }
    }
}

#[derive(Props, Clone, PartialEq)]
pub struct LoginPageProps {
    #[props(default = None)]
    error: Option<&'static str>,
}

#[component]
pub fn LoginPage(props: LoginPageProps) -> Element {
    let login_css = r##"
        .login-container {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .login-box {
            background: white;
            padding: 2.5rem;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            width: 100%;
            max-width: 400px;
        }
        .login-box h1 {
            color: #333;
            margin-bottom: 0.5rem;
            font-size: 2rem;
        }
        .login-box p {
            color: #666;
            margin-bottom: 2rem;
            font-size: 0.95rem;
        }
        .form-group {
            margin-bottom: 1.5rem;
        }
        .form-group label {
            display: block;
            margin-bottom: 0.5rem;
            color: #555;
            font-weight: 500;
        }
        .form-group input {
            width: 100%;
            padding: 0.75rem;
            border: 2px solid #e0e0e0;
            border-radius: 6px;
            font-size: 1rem;
            transition: border-color 0.3s;
            box-sizing: border-box;
        }
        .form-group input:focus {
            outline: none;
            border-color: #667eea;
        }
        .login-button {
            width: 100%;
            padding: 0.875rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .login-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
        }
        .login-button:active {
            transform: translateY(0);
        }
        .error-message {
            background: #fee;
            border: 1px solid #fcc;
            color: #c33;
            padding: 0.75rem;
            border-radius: 6px;
            margin-bottom: 1.5rem;
            font-size: 0.9rem;
        }
    "##;

    rsx! {
        head {
            meta { charset: "utf-8" }
            meta { name: "viewport", content: "width=device-width, initial-scale=1" }
            title { "Swiss Bank - Login" }
            style { dangerous_inner_html: DASHBOARD_CSS }
            style { dangerous_inner_html: login_css }
        }
        body {
            div { class: "login-container",
                div { class: "login-box",
                    h1 { "Swiss Bank" }
                    p { "Please login to access your account" }

                    if let Some(error) = props.error {
                        div { class: "error-message",
                            "{error}"
                        }
                    }

                    form { method: "post", action: "/login",
                        div { class: "form-group",
                            label { r#for: "username", "Username" }
                            input {
                                r#type: "text",
                                id: "username",
                                name: "username",
                                required: true,
                                autofocus: true
                            }
                        }
                        div { class: "form-group",
                            label { r#for: "password", "Password" }
                            input {
                                r#type: "password",
                                id: "password",
                                name: "password",
                                required: true
                            }
                        }
                        button { class: "login-button", r#type: "submit",
                            "Login"
                        }
                    }
                }
            }
        }
    }
}

#[component]
pub fn LoginRequiredPage() -> Element {
    let login_required_css = r##"
        .login-required-container {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 2rem;
        }
        .login-required-box {
            background: white;
            padding: 3rem;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            width: 100%;
            max-width: 500px;
            text-align: center;
        }
        .login-required-box h1 {
            color: #333;
            margin-bottom: 1rem;
            font-size: 2rem;
        }
        .login-required-box p {
            color: #666;
            margin-bottom: 2rem;
            font-size: 1.1rem;
            line-height: 1.5;
        }
        .login-button-large {
            display: inline-block;
            padding: 1rem 2rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-size: 1.1rem;
            font-weight: 600;
            transition: transform 0.2s, box-shadow 0.2s;
            margin-bottom: 1.5rem;
        }
        .login-button-large:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
        }
        .back-link {
            display: inline-block;
            color: #667eea;
            text-decoration: none;
            font-weight: 500;
            margin-top: 1rem;
        }
        .back-link:hover {
            text-decoration: underline;
        }
    "##;

    rsx! {
        head {
            meta { charset: "utf-8" }
            meta { name: "viewport", content: "width=device-width, initial-scale=1" }
            title { "Login Required - Swiss Bank" }
            style { dangerous_inner_html: DASHBOARD_CSS }
            style { dangerous_inner_html: login_required_css }
        }
        body {
            div { class: "login-required-container",
                div { class: "login-required-box",
                    h1 { "🔒 Authentication Required" }
                    p { "You need to log in to access your account balances and banking information." }
                    p { "Please log in with your credentials to continue." }
                    
                    a { class: "login-button-large", href: "/login",
                        "Go to Login Page"
                    }
                    
                    br {}
                    
                    a { class: "back-link", href: "/",
                        "← Back to Home"
                    }
                }
            }
        }
    }
}

#[component]
pub fn BalancesPage() -> Element {
    let balances_css = r##"
        .balances-container {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 2rem;
        }
        .balances-box {
            background: white;
            padding: 3rem;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            width: 100%;
            max-width: 600px;
        }
        .balances-box h1 {
            color: #333;
            margin-bottom: 0.5rem;
            font-size: 2rem;
        }
        .org-name {
            color: #667eea;
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 2px solid #e0e0e0;
        }
        .balance-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.25rem;
            margin-bottom: 1rem;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            border-radius: 8px;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .balance-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .currency {
            font-weight: 600;
            font-size: 1.2rem;
            color: #555;
        }
        .amount {
            font-size: 1.5rem;
            font-weight: 700;
            color: #667eea;
        }
        .logout-link {
            display: inline-block;
            margin-top: 2rem;
            color: #667eea;
            text-decoration: none;
            font-weight: 500;
            transition: color 0.2s;
        }
        .logout-link:hover {
            color: #764ba2;
            text-decoration: underline;
        }
    "##;

    rsx! {
        head {
            meta { charset: "utf-8" }
            meta { name: "viewport", content: "width=device-width, initial-scale=1" }
            title { "Account Balances - Swiss Bank" }
            style { dangerous_inner_html: DASHBOARD_CSS }
            style { dangerous_inner_html: balances_css }
        }
        body {
            div { class: "balances-container",
                div { class: "balances-box",
                    h1 { "Account Balances" }
                    div { class: "org-name", id: "org-name",
                        "Loading..."
                    }

                    div { id: "loading-message", style: "text-align: center; padding: 2rem; color: #667eea; font-size: 1.1rem;",
                        "Loading account balances..."
                    }

                    div { id: "accounts-container", style: "display: none;" }

                    div { id: "error-message", style: "display: none; color: #c33; background: #fee; border: 1px solid #fcc; padding: 1rem; border-radius: 6px; margin: 1rem 0; text-align: center;" }

                    a { class: "logout-link", href: "/",
                        "← Back to Home"
                    }
                }
            }

            script { dangerous_inner_html: include_str!("balances.js") }
        }
    }
}
