use base64::{engine::general_purpose::STANDARD, Engine};
use chromiumoxide::browser::{Browser, BrowserConfig};
use chromiumoxide::cdp::browser_protocol::network::{Headers, SetExtraHttpHeadersParams};
use chromiumoxide::Page;
use futures::StreamExt;
use serde::Serialize;
use tauri::Manager;
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;

// Portal-specific constants. Update these here if the LivingInsider admin site
// changes its URLs, HTTP-basic gate, or form markup.
const ADMIN_BASE: &str = "https://portal.example.com/team";
const BASIC_AUTH_CREDENTIAL: &str = "user:pass";
const LOGIN_INPUT_SELECTOR: &str = "input[type='text']";
const TASK_DATE_SELECT: &str = "select#task_date";
const TASK_LEAVE_SELECT: &str = "select#task_leave";
const TASK_PROJECT_SELECT_1: &str = "select#task_project_id1";
const TASK_COMMENT_TEXTAREA_1: &str = "textarea#task_comment1";

// Prefix for the per-browser Chromium user-data dirs created in the temp dir.
// Distinctive so `sweep_stale_user_data_dirs` can reclaim leftovers without
// touching other programs' `tempfile` dirs.
const USER_DATA_DIR_PREFIX: &str = "daily-report-";

#[derive(thiserror::Error, Debug)]
enum AppError {
    #[error("{0}")]
    Msg(String),
    // `CdpError` is large; box it so `Result<_, AppError>` stays small.
    #[error(transparent)]
    Cdp(Box<chromiumoxide::error::CdpError>),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Store(#[from] tauri_plugin_store::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

// Manual `From` (rather than `#[from]`) so `?` boxes the error at the call site
// and the variant can stay boxed.
impl From<chromiumoxide::error::CdpError> for AppError {
    fn from(e: chromiumoxide::error::CdpError) -> Self {
        AppError::Cdp(Box::new(e))
    }
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

/// Lets a `BrowserState` newtype deref to the inner state, so both wrappers
/// share `get_page`/`close` without duplicating the boilerplate.
macro_rules! impl_browser_state_deref {
    ($wrapper:ty) => {
        impl std::ops::Deref for $wrapper {
            type Target = BrowserState;
            fn deref(&self) -> &Self::Target {
                &self.0
            }
        }
    };
}

impl_browser_state_deref!(HeadedBrowserState);
impl_browser_state_deref!(HeadlessBrowserState);

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

    /// Reads the configured login phone number from `store.json`. Errors before
    /// any browser is launched if it isn't set.
    fn phone(&self) -> Result<String, AppError> {
        let store = self.app.store("store.json")?;
        let phone = store
            .get("account")
            .and_then(|v| v.get("phone").and_then(|p| p.as_str().map(String::from)))
            .ok_or("Phone number not configured")?;
        Ok(phone)
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
        let (browser, page, temp_dir) = self.launch_and_login().await?;
        *guard = Some((browser, page.clone(), temp_dir));
        Ok(page)
    }

    /// Launches a fresh Chromium instance and logs into the admin portal,
    /// returning the live browser/page and its user-data dir.
    async fn launch_and_login(&self) -> Result<(Browser, Page, tempfile::TempDir), AppError> {
        // Read the phone first so a missing config fails before we spend the
        // cost of launching a browser.
        let phone = self.phone()?;

        // Prefix the user-data dir so leftovers from an unclean shutdown can be
        // identified and swept on the next launch (see `sweep_stale_user_data_dirs`).
        let temp_dir = tempfile::Builder::new()
            .prefix(USER_DATA_DIR_PREFIX)
            .tempdir()?;
        let mut config = BrowserConfig::builder()
            .user_data_dir(temp_dir.path())
            .viewport(None);
        if self.with_head {
            config = config.with_head();
        }
        let (browser, mut handler) = Browser::launch(config.build()?).await?;
        tokio::spawn(async move { while handler.next().await.is_some() {} });
        let page = browser.new_page("about:blank").await?;

        page.enable_stealth_mode().await?;
        let token = STANDARD.encode(BASIC_AUTH_CREDENTIAL);
        page.execute(SetExtraHttpHeadersParams::new(Headers::new(
            serde_json::json!({ "Authorization": format!("Basic {}", token) }),
        )))
        .await?;
        page.goto(ADMIN_BASE).await?;

        // Build the JS via `serde_json::to_string` so the selector is
        // properly quoted/escaped. The selector itself contains single quotes
        // (`input[type='text']`), so hand-wrapping it in `'...'` breaks the JS.
        let selector_js = serde_json::to_string(LOGIN_INPUT_SELECTOR)?;
        page.evaluate(format!(
            "
                const phoneInput = document.querySelector({selector_js});
                phoneInput.value = '{phone}';
                phoneInput.form.submit();
            "
        ))
        .await?;

        wait_for_url(&page, &format!("{ADMIN_BASE}/member.php"), 5_000)
            .await
            .map_err(|e| AppError::from(format!("{e}\nIncorrect phone number")))?;

        // Chromium starts with an initial blank tab in addition to the page we
        // create; close it after login so the headed window doesn't show a
        // stray empty tab. Best-effort: login already succeeded, so a cleanup
        // failure shouldn't fail the launch.
        if let Ok(pages) = browser.pages().await {
            for p in pages {
                if p.target_id() != page.target_id() {
                    let _ = p.close().await;
                }
            }
        }

        Ok((browser, page, temp_dir))
    }
}

/// Probes whether the cached page can still be driven over CDP. Issues a real
/// round-trip into the page's JS context (`Runtime.evaluate`) and returns false
/// if it errors or times out, signalling the browser must be relaunched.
///
/// Do NOT probe with `page.url()`: chromiumoxide answers that from the handler's
/// locally-cached frame state without contacting Chromium, so it keeps returning
/// `Ok` even when the renderer/CDP session is dead (e.g. after the OS suspends
/// the browser during a long idle) — a false positive that then strands the next
/// real command on a ~30s CDP timeout. A process-level check (`Browser::try_wait`)
/// is likewise insufficient: on macOS the process lingers after its last window
/// closes. Probe the live session, not the cache or the process.
async fn is_page_alive(page: &Page) -> bool {
    matches!(
        tokio::time::timeout(std::time::Duration::from_secs(2), page.evaluate("1")).await,
        Ok(Ok(_))
    )
}

async fn wait_for_url(page: &Page, expected: &str, timeout_ms: u64) -> Result<(), AppError> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(timeout_ms);
    loop {
        if std::time::Instant::now() > deadline {
            return Err(format!("Timed out waiting for URL: {expected}").into());
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        let url = tokio::time::timeout(std::time::Duration::from_millis(2_000), page.url())
            .await
            .map_err(|_| "page.url() timed out")??;
        if url.as_deref() == Some(expected) {
            return Ok(());
        }
    }
}

#[derive(Serialize, Clone)]
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

/// The project `<select>` options, scraped from the portal on first use and
/// cached for the rest of the app's lifetime. The project list is stable, so
/// callers (parameter scrape, label lookup in `submit_task`) share one scrape
/// instead of hitting the form each time.
static PROJECT_OPTIONS: tokio::sync::OnceCell<Vec<SelectOption>> =
    tokio::sync::OnceCell::const_new();

/// Returns the cached project options, scraping `page` once on the first call.
/// `page` must already be on the task form.
async fn get_project_options(page: &Page) -> Result<&'static [SelectOption], AppError> {
    PROJECT_OPTIONS
        .get_or_try_init(|| async {
            get_select_options(page, &format!("{TASK_PROJECT_SELECT_1} option")).await
        })
        .await
        .map(Vec::as_slice)
}

#[tauri::command]
async fn close_headless_browser(
    state: tauri::State<'_, HeadlessBrowserState>,
) -> Result<(), AppError> {
    state.close().await;
    Ok(())
}

#[tauri::command]
async fn get_task_parameters(
    state: tauri::State<'_, HeadlessBrowserState>,
) -> Result<TaskParameters, AppError> {
    let page = state.get_page().await?;

    page.goto(format!("{ADMIN_BASE}/task.php")).await?;

    let date_options = get_select_options(&page, &format!("{TASK_DATE_SELECT} option")).await?;
    let leave_options = get_select_options(&page, &format!("{TASK_LEAVE_SELECT} option")).await?;
    let project_options = get_project_options(&page).await?.to_vec();

    page.goto(format!("{ADMIN_BASE}/member.php")).await?;

    Ok(TaskParameters {
        dates: date_options,
        leaves: leave_options,
        projects: project_options,
    })
}

#[tauri::command]
async fn open_member_page(state: tauri::State<'_, HeadedBrowserState>) -> Result<(), AppError> {
    let page = state.get_page().await?;
    page.goto(format!("{ADMIN_BASE}/member.php")).await?;
    page.bring_to_front().await?;
    Ok(())
}

#[tauri::command]
async fn submit_task(
    state: tauri::State<'_, HeadedBrowserState>,
    date: String,
    summary: String,
) -> Result<(), AppError> {
    let page = state.get_page().await?;
    page.goto(format!("{ADMIN_BASE}/task.php")).await?;
    page.bring_to_front().await?;
    page.evaluate(format!(
        "document.querySelector('{TASK_DATE_SELECT}').value = '{date}'"
    ))
    .await?;

    let store = state.app.store("store.json")?;
    let default_project = store.get("preferences").and_then(|v| {
        v.get("default_project")
            .and_then(|p| p.as_str().map(String::from))
    });
    if let Some(project) = &default_project {
        page.evaluate(format!(
            "document.querySelector('{TASK_PROJECT_SELECT_1}').value = '{project}';"
        ))
        .await?;
    }

    let summary_text = serde_json::to_string(&summary)?;
    page.evaluate(format!(
        "document.querySelector('{TASK_COMMENT_TEXTAREA_1}').value = {summary_text};"
    ))
    .await?;

    let project_list = store
        .get("preferences")
        .and_then(|v| v.get("project_list").and_then(|s| s.as_array().cloned()))
        .unwrap_or_default();
    if !project_list.is_empty() {
        let project_list_js = serde_json::to_string(&project_list)?;
        let default_project_js = serde_json::to_string(&default_project)?;
        page.evaluate(format!(
            "Array.from(document.querySelectorAll('select')).forEach((e) => {{
                if (e.id.includes('task_project_id')) {{
                    e.querySelectorAll('option').forEach((o) => {{
                        if (!{project_list_js}.includes(o.value)
                            && o.value != ''
                            && o.value != {default_project_js})
                        {{
                            o.remove();
                        }}
                    }});
                }}
            }});"
        ))
        .await?;
    }

    Ok(())
}

/// Removes Chromium user-data dirs left in the temp dir by previous runs that
/// didn't shut down cleanly (force-quit, or `Ctrl+C` during `tauri dev`) — these
/// would otherwise accumulate, each a multi-MB profile. Safe to delete all of
/// them: the app is single-instance and this runs at startup before any browser
/// launches, so every `daily-report-*` dir necessarily belongs to a prior, now
/// dead run. Best-effort — individual failures are ignored.
fn sweep_stale_user_data_dirs() {
    let Ok(entries) = std::fs::read_dir(std::env::temp_dir()) else {
        return;
    };
    for entry in entries.flatten() {
        let is_ours = entry
            .file_name()
            .to_str()
            .is_some_and(|name| name.starts_with(USER_DATA_DIR_PREFIX));
        if is_ours && entry.path().is_dir() {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app
                .get_webview_window("main")
                .expect("no main window")
                .set_focus();
        }))
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Reclaim user-data dirs leaked by a previous unclean shutdown,
            // before this run creates any of its own.
            sweep_stale_user_data_dirs();
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
        .invoke_handler(tauri::generate_handler![
            get_task_parameters,
            close_headless_browser,
            submit_task,
            open_member_page
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
