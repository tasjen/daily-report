use base64::{engine::general_purpose::STANDARD, Engine};
use chromiumoxide::browser::{Browser, BrowserConfig};
use chromiumoxide::cdp::browser_protocol::network::{Headers, SetExtraHttpHeadersParams};
use chromiumoxide::Page;
use futures::StreamExt;
use serde::Serialize;
use tauri::Manager;
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;

#[derive(thiserror::Error, Debug)]
enum AppError {
    #[error("{0}")]
    Msg(String),
    #[error(transparent)]
    Cdp(#[from] chromiumoxide::error::CdpError),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Store(#[from] tauri_plugin_store::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        AppError::Msg(s)
    }
}

impl From<&str> for AppError {
    fn from(s: &str) -> Self {
        AppError::Msg(s.to_string())
    }
}

// Tauri command errors must be `Serialize`; serialize as the `Display` string.
impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

struct BrowserState {
    inner: Mutex<Option<(Browser, Page, tempfile::TempDir)>>,
    app: tauri::AppHandle,
    with_head: bool,
}

struct HeadedBrowserState(BrowserState);
struct HeadlessBrowserState(BrowserState);

impl std::ops::Deref for HeadedBrowserState {
    type Target = BrowserState;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::ops::Deref for HeadlessBrowserState {
    type Target = BrowserState;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl BrowserState {
    fn new(app: tauri::AppHandle, with_head: bool) -> Self {
        Self {
            inner: Mutex::new(None),
            app,
            with_head,
        }
    }

    async fn close(&self) {
        let mut guard = self.inner.lock().await;
        if let Some((mut browser, page, _temp_dir)) = guard.take() {
            // Try a graceful shutdown, but bound it: if the user already closed
            // the window the connection is gone, so `close`/`wait` can never
            // complete. Fall back to force-killing the lingering process.
            let graceful = async {
                let _ = page.close().await;
                let _ = browser.close().await;
                let _ = browser.wait().await;
            };
            if tokio::time::timeout(std::time::Duration::from_secs(3), graceful)
                .await
                .is_err()
            {
                let _ = browser.kill().await;
            }
        }
    }

    async fn get_page(&self) -> Result<Page, AppError> {
        let mut guard = self.inner.lock().await;
        if let Some((_, page, _)) = guard.as_ref() {
            if is_page_alive(page).await {
                return Ok(page.clone());
            }
        }
        // Either there is no cached browser, or the cached one can no longer be
        // driven (e.g. the user closed the window). Force-kill any lingering
        // process and drop it so a fresh instance is launched below. We use
        // `kill` rather than `close` + `wait`: once the connection is gone the
        // close command can't be delivered, so `wait` would block forever.
        if let Some((mut browser, _page, _temp_dir)) = guard.take() {
            let _ = browser.kill().await;
        }
        let temp_dir = tempfile::tempdir()?;
        let mut config = BrowserConfig::builder().user_data_dir(temp_dir.path());
        if self.with_head {
            config = config.with_head();
        }
        let (browser, mut handler) = Browser::launch(config.build()?).await?;
        tokio::spawn(async move { while handler.next().await.is_some() {} });
        let page = browser.new_page("about:blank").await?;

        page.enable_stealth_mode().await?;
        let token = STANDARD.encode("user:pass");
        page.execute(SetExtraHttpHeadersParams::new(Headers::new(
            serde_json::json!({ "Authorization": format!("Basic {}", token) }),
        )))
        .await?;
        page.goto("https://portal.example.com/team").await?;
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;

        let store = self.app.store("store.json")?;
        let phone = store
            .get("settings")
            .and_then(|v| v.get("phone").and_then(|p| p.as_str().map(String::from)))
            .ok_or("Phone number not configured")?;

        let input_el = page.find_element("input[type='text']").await?;
        input_el.click().await?;
        input_el.type_str(phone).await?;
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        input_el.press_key("Enter").await?;

        wait_for_url(&page, "/team/member.php", 5_000).await?;

        *guard = Some((browser, page.clone(), temp_dir));
        Ok(page)
    }
}

/// Probes whether the cached page can still be driven over CDP. Returns false if
/// the page target is closed, the connection is gone (the user closed the
/// window), or the round-trip times out — signalling the browser must be
/// relaunched. A process-level check (`Browser::try_wait`) is not enough: on
/// macOS the Chromium process keeps running after its last window is closed, so
/// we probe the page itself with a lightweight round-trip.
async fn is_page_alive(page: &Page) -> bool {
    matches!(
        tokio::time::timeout(std::time::Duration::from_secs(2), page.url()).await,
        Ok(Ok(_))
    )
}

async fn wait_for_url(page: &Page, expected: &str, timeout_ms: u64) -> Result<(), AppError> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(timeout_ms);
    let initial_url = page.url().await?;
    loop {
        if std::time::Instant::now() > deadline {
            return Err(format!("Timed out waiting for URL containing: {expected}").into());
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        let url = tokio::time::timeout(std::time::Duration::from_millis(2_000), page.url())
            .await
            .map_err(|_| "page.url() timed out")??;
        if url != initial_url && url.as_deref().is_some_and(|u| u.contains(expected)) {
            return Ok(());
        }
    }
}

#[derive(Serialize)]
struct SelectOption {
    label: String,
    value: String,
}

#[derive(Serialize)]
struct TaskParameters {
    dates: Vec<SelectOption>,
    leaves: Vec<SelectOption>,
    projects: Vec<SelectOption>,
}

async fn get_select_options(page: &Page, selector: &str) -> Result<Vec<SelectOption>, AppError> {
    let elements = page.find_elements(selector).await?;
    let mut options = Vec::with_capacity(elements.len());
    for el in &elements {
        if let Some(value) = el.attribute("value").await? {
            let label = el.inner_text().await?.unwrap_or_default();
            options.push(SelectOption { label, value });
        }
    }
    Ok(options)
}

#[tauri::command]
async fn close_headless_browser(state: tauri::State<'_, HeadlessBrowserState>) -> Result<(), AppError> {
    state.close().await;
    Ok(())
}

#[tauri::command]
async fn get_task_parameters(
    state: tauri::State<'_, HeadlessBrowserState>,
) -> Result<TaskParameters, AppError> {
    let page = state.get_page().await?;

    page.goto("https://portal.example.com/team/task.php")
        .await?;

    let date_options = get_select_options(&page, "select#task_date option").await?;
    let leave_options = get_select_options(&page, "select#task_leave option").await?;
    let project_options = get_select_options(&page, "select#task_project_id1 option").await?;

    page.goto("https://portal.example.com/team/member.php")
        .await?;

    Ok(TaskParameters {
        dates: date_options,
        leaves: leave_options,
        projects: project_options,
    })
}

#[tauri::command]
async fn submit_task(
    state: tauri::State<'_, HeadedBrowserState>,
    date: String,
    summary: String,
) -> Result<(), AppError> {
    let page = state.get_page().await?;
    page.goto("https://portal.example.com/team/task.php")
        .await?;
    page.evaluate(format!(
        "document.querySelector('select#task_date').value = '{date}'"
    ))
    .await?;

    let store = state.app.store("store.json")?;
    let default_project = store.get("settings").and_then(|v| {
        v.get("default_project")
            .and_then(|p| p.as_str().map(String::from))
    });
    if let Some(project) = default_project {
        page.evaluate(format!(
            "document.querySelector('select#task_project_id1').value = '{project}';"
        ))
        .await?;
    }

    let summary_text = serde_json::to_string(&summary)?;
    page.evaluate(format!(
        "document.querySelector('textarea#task_comment1').value = {summary_text};"
    ))
    .await?;

    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            app.manage(HeadlessBrowserState(BrowserState::new(
                app.handle().clone(),
                false,
            )));
            app.manage(HeadedBrowserState(BrowserState::new(
                app.handle().clone(),
                true,
            )));
            Ok(())
        })
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_task_parameters,
            close_headless_browser,
            submit_task
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                tauri::async_runtime::block_on(async {
                    app_handle.state::<HeadlessBrowserState>().close().await;
                    app_handle.state::<HeadedBrowserState>().close().await;
                });
            }
        });
}
