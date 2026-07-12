use base64::{engine::general_purpose::STANDARD, Engine};
use chromiumoxide::browser::{Browser, BrowserConfig};
use chromiumoxide::cdp::browser_protocol::network::{Headers, SetExtraHttpHeadersParams};
use chromiumoxide::Page;
use futures::StreamExt;
use serde::Serialize;
use tauri::Manager;
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;

// Portal-specific selectors. Update these here if the admin site changes its
// form markup. The portal base URL and Basic-auth credential are NOT compiled
// in: they are user-supplied via the Account form and read from `store.json`
// (`account.portal_url` / `account.portal_credential`) — see `portal_url()`
// and `portal_credential()`.
const LOGIN_INPUT_SELECTOR: &str = "input[type='text']";
const TASK_DATE_SELECT: &str = "select#task_date";
const TASK_LEAVE_SELECT: &str = "select#task_leave";
const TASK_PROJECT_SELECT_1: &str = "select#task_project_id1";
const TASK_COMMENT_TEXTAREA_1: &str = "textarea#task_comment1";
const TASK_FORM_SELECTOR: &str = "form[action='task.php']";

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
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
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
    inner: Mutex<Option<(Browser, Page)>>,
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

/// Holds the throwaway browser used by `verify_portal_login` while a check is
/// in flight, so the `RunEvent::Exit` handler can kill it if the app closes
/// mid-verify (invariant: every browser instance must be terminated on app
/// close). The `Mutex` also serializes concurrent verifies, which share one
/// profile dir.
struct VerifyBrowserState(Mutex<Option<Browser>>);

impl BrowserState {
    fn new(app: tauri::AppHandle, with_head: bool) -> Self {
        Self {
            inner: Mutex::new(None),
            app,
            with_head,
        }
    }

    /// Which instance this is, for log lines.
    fn label(&self) -> &'static str {
        if self.with_head {
            "headed"
        } else {
            "headless"
        }
    }

    async fn close(&self) {
        let mut guard = self.inner.lock().await;
        if let Some((mut browser, page)) = guard.take() {
            log::info!("closing {} browser", self.label());
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
                log::warn!(
                    "graceful close of {} browser timed out, force-killing",
                    self.label()
                );
                let _ = browser.kill().await;
            }
        }
    }

    /// Reads the configured login phone number from `store.json`. Errors before
    /// any browser is launched if it isn't set.
    fn phone(&self) -> Result<String, AppError> {
        account_str_field(&self.app, "phone", "Phone number not configured")
    }

    async fn get_page(&self) -> Result<Page, AppError> {
        let mut guard = self.inner.lock().await;
        if let Some((_, page)) = guard.as_ref() {
            if is_page_alive(page).await {
                return Ok(page.clone());
            }
            log::warn!(
                "cached {} browser session no longer responds, relaunching",
                self.label()
            );
        }
        // Either there is no cached browser, or the cached one can no longer be
        // driven (e.g. the user closed the window). Force-kill any lingering
        // process and drop it so a fresh instance is launched below. We use
        // `kill` rather than `close` + `wait`: once the connection is gone the
        // close command can't be delivered, so `wait` would block forever.
        if let Some((mut browser, _page)) = guard.take() {
            let _ = browser.kill().await;
        }
        let (browser, page) = self.launch_and_login().await?;
        *guard = Some((browser, page.clone()));
        Ok(page)
    }

    /// Path to this browser's Chromium user-data dir, under the app's own cache
    /// dir (not the shared system temp). Headed and headless get separate
    /// subdirs so the two instances never contend for the same profile lock.
    fn user_data_dir(&self) -> Result<std::path::PathBuf, AppError> {
        let subdir = if self.with_head { "headed" } else { "headless" };
        Ok(self
            .app
            .path()
            .app_cache_dir()?
            .join("profiles")
            .join(subdir))
    }

    /// Launches a fresh Chromium instance and logs into the admin portal.
    async fn launch_and_login(&self) -> Result<(Browser, Page), AppError> {
        // Read the config first so a missing value fails before we spend the
        // cost of launching a browser.
        let phone = self.phone()?;
        let base_url = portal_url(&self.app)?;
        let credential = portal_credential(&self.app)?;

        let (browser, page) =
            launch_browser(&self.user_data_dir()?, self.with_head, self.label()).await?;
        login_to_portal(&page, &phone, &base_url, &credential, self.label()).await?;

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

        Ok((browser, page))
    }
}

/// Launches a fresh Chromium instance from a clean profile at `user_data_dir`.
/// `label` is used for log lines only. Shared by `BrowserState::launch_and_login`
/// and `verify_portal_login`.
async fn launch_browser(
    user_data_dir: &std::path::Path,
    with_head: bool,
    label: &str,
) -> Result<(Browser, Page), AppError> {
    // Start each launch from a clean profile in our own cache dir. Wiping
    // also clears any stale `SingletonLock` a previous unclean shutdown left
    // behind, so a leftover Chromium can't make this launch hand off and exit.
    log::info!("launching {label} browser");
    let _ = std::fs::remove_dir_all(user_data_dir);
    std::fs::create_dir_all(user_data_dir)?;
    let mut config = BrowserConfig::builder()
        .user_data_dir(user_data_dir)
        .incognito()
        .viewport(None);
    if with_head {
        config = config.with_head();
    }
    let (browser, mut handler) = Browser::launch(config.build()?).await?;
    tokio::spawn(async move { while handler.next().await.is_some() {} });
    let page = browser.new_page("about:blank").await?;
    Ok((browser, page))
}

/// Logs `page` into the admin portal: Basic-auth header, navigate to
/// `base_url`, type the phone into the login input, confirm arrival at
/// member.php. Shared by `BrowserState::launch_and_login` (values from
/// `store.json`) and `verify_portal_login` (candidate values from the
/// Account form), so the login sequence can't drift between the two.
async fn login_to_portal(
    page: &Page,
    phone: &str,
    base_url: &str,
    credential: &str,
    label: &str,
) -> Result<(), AppError> {
    page.enable_stealth_mode().await?;
    let token = STANDARD.encode(credential);
    page.execute(SetExtraHttpHeadersParams::new(Headers::new(
        serde_json::json!({ "Authorization": format!("Basic {}", token) }),
    )))
    .await?;
    page.goto(base_url).await?;

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

    wait_for_url(page, &format!("{base_url}/member.php"), 5_000)
        .await
        .map_err(|e| {
            log::warn!("{label} browser login failed: {e}");
            AppError::from(format!(
                "{e}\nWrong phone number, portal URL, or portal credential — or the portal was slow to respond"
            ))
        })?;
    log::info!("{label} browser logged into portal");
    Ok(())
}

/// Reads a required string field from the `account` object in `store.json`,
/// erroring with `missing_msg` when the store key, object, or field is absent
/// or empty. Free function (not a `BrowserState` method) so commands can read
/// portal config without holding a browser state reference.
fn account_str_field(
    app: &tauri::AppHandle,
    field: &str,
    missing_msg: &'static str,
) -> Result<String, AppError> {
    let store = app.store("store.json")?;
    let value = store
        .get("account")
        .and_then(|v| v.get(field).and_then(|f| f.as_str().map(String::from)))
        .filter(|s| !s.is_empty())
        .ok_or(missing_msg)?;
    Ok(value)
}

/// The user-configured portal base URL. Trailing slashes are trimmed
/// defensively — callers join paths as `format!("{base_url}/task.php")` —
/// though the frontend already normalizes on save.
fn portal_url(app: &tauri::AppHandle) -> Result<String, AppError> {
    let url = account_str_field(app, "portal_url", "Portal URL not configured")?;
    Ok(url.trim_end_matches('/').to_string())
}

/// The user-configured HTTP Basic-auth credential (`user:pass`), encoded
/// verbatim into the `Authorization` header.
fn portal_credential(app: &tauri::AppHandle) -> Result<String, AppError> {
    account_str_field(app, "portal_credential", "Portal credential not configured")
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

/// Polls until the page URL starts with `expected`. Prefix match rather than
/// equality, so a redirect that appends query params, a fragment, or a
/// trailing slash still counts as arrival.
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
        if url.as_deref().is_some_and(|u| u.starts_with(expected)) {
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

/// Tears down both browser instances so the next command logs in fresh.
/// Called from the frontend after the account changes: both sessions belong
/// to the old login, and a reused headed session would submit tasks as the
/// previous member.
#[tauri::command]
async fn close_browsers(
    headless: tauri::State<'_, HeadlessBrowserState>,
    headed: tauri::State<'_, HeadedBrowserState>,
) -> Result<(), AppError> {
    log::info!("close_browsers: tearing down both browser instances");
    tokio::join!(headless.close(), headed.close());
    Ok(())
}

/// Verifies the given portal values by performing a real login in a throwaway
/// headless browser. Takes the *candidate* values as arguments — this never
/// reads `store.json` — so nothing persists unless the frontend decides to
/// save after this succeeds. Pass or fail, the browser is killed before
/// returning; it exists only for the duration of the check.
#[tauri::command]
async fn verify_portal_login(
    app: tauri::AppHandle,
    state: tauri::State<'_, VerifyBrowserState>,
    portal_url: String,
    portal_credential: String,
    phone: String,
) -> Result<(), AppError> {
    log::info!("verify_portal_login: checking candidate portal values");
    // The frontend normalizes the trailing slash before saving, but this runs
    // on pre-save input — trim defensively, matching `portal_url()`.
    let base_url = portal_url.trim_end_matches('/');
    let user_data_dir = app.path().app_cache_dir()?.join("profiles").join("verify");

    // Hold the lock for the whole check: it serializes concurrent verifies
    // (they share the profile dir) and parking the browser here is what lets
    // the Exit handler kill it if the app closes mid-login.
    let mut guard = state.0.lock().await;
    let (browser, page) = launch_browser(&user_data_dir, false, "verify").await?;
    *guard = Some(browser);
    let login_result = login_to_portal(&page, &phone, base_url, &portal_credential, "verify").await;
    // Throwaway either way: nothing to keep after the check.
    if let Some(mut browser) = guard.take() {
        let _ = browser.kill().await;
    }
    login_result
}

#[tauri::command]
async fn get_task_parameters(
    state: tauri::State<'_, HeadlessBrowserState>,
) -> Result<TaskParameters, AppError> {
    let base_url = portal_url(&state.app)?;
    let page = state.get_page().await?;

    page.goto(format!("{base_url}/task.php")).await?;

    let date_options = get_select_options(&page, &format!("{TASK_DATE_SELECT} option")).await?;
    let leave_options = get_select_options(&page, &format!("{TASK_LEAVE_SELECT} option")).await?;
    let project_options = get_project_options(&page).await?.to_vec();

    page.goto(format!("{base_url}/member.php")).await?;

    log::info!(
        "get_task_parameters: scraped {} dates, {} leaves, {} projects",
        date_options.len(),
        leave_options.len(),
        project_options.len()
    );
    Ok(TaskParameters {
        dates: date_options,
        leaves: leave_options,
        projects: project_options,
    })
}

#[tauri::command]
async fn open_member_page(state: tauri::State<'_, HeadedBrowserState>) -> Result<(), AppError> {
    let base_url = portal_url(&state.app)?;
    let page = state.get_page().await?;
    page.goto(format!("{base_url}/member.php")).await?;
    page.bring_to_front().await?;
    Ok(())
}

#[tauri::command]
async fn submit_task(
    state: tauri::State<'_, HeadedBrowserState>,
    date: String,
    summary: String,
) -> Result<(), AppError> {
    log::info!(
        "submit_task: pre-filling form for date {date} ({} char summary)",
        summary.len()
    );
    let base_url = portal_url(&state.app)?;
    let page = state.get_page().await?;
    page.goto(format!("{base_url}/task.php")).await?;
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

    let auto_submit = store
        .get("preferences")
        .and_then(|v| v.get("auto_submit").and_then(|b| b.as_bool()))
        .unwrap_or(false);
    if !auto_submit {
        return Ok(());
    }

    // The selector contains single quotes, so pass it through
    // `serde_json::to_string` instead of hand-wrapping it in '...'
    // (same technique as the login selector).
    log::info!("submit_task: auto-submitting the task form");
    let form_selector_js = serde_json::to_string(TASK_FORM_SELECTOR)?;
    page.evaluate(format!(
        "document.querySelector({form_selector_js}).submit();"
    ))
    .await?;

    let auto_close = store
        .get("preferences")
        .and_then(|v| v.get("auto_close").and_then(|b| b.as_bool()))
        .unwrap_or(false);
    if !auto_close {
        return Ok(());
    }

    // Only close once the portal confirms the submission by navigating to
    // member.php. On timeout the submission state is unknown: return the
    // error and leave the browser open so the user can see what happened.
    wait_for_url(&page, &format!("{base_url}/task_report.php"), 10_000)
        .await
        .map_err(|e| {
            log::warn!("auto-close skipped, submission not confirmed: {e}");
            AppError::from(format!(
                "{e}\nThe portal didn't confirm the submission; leaving the browser open"
            ))
        })?;
    log::info!("submit_task: submission confirmed, closing headed browser");
    state.close().await;

    Ok(())
}

pub fn run() {
    let mut builder = tauri::Builder::default();
    // Logs go to the terminal in dev only — never to disk. Release builds
    // don't register the plugin at all, so log macros become no-ops there.
    if cfg!(debug_assertions) {
        builder = builder.plugin(
            tauri_plugin_log::Builder::new()
                .targets([tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                )])
                .level(log::LevelFilter::Info)
                .build(),
        );
    }
    builder
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let window = app.get_webview_window("main").expect("no main window");
            // Show before focusing: the window starts hidden until the frontend
            // reveals it (see main.tsx), and focusing a hidden window does
            // nothing — this is the escape hatch if the frontend never loads.
            let _ = window.show();
            let _ = window.set_focus();
        }))
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        )
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(HeadlessBrowserState(BrowserState::new(
                app.handle().clone(),
                false,
            )));
            app.manage(HeadedBrowserState(BrowserState::new(
                app.handle().clone(),
                true,
            )));
            app.manage(VerifyBrowserState(Mutex::new(None)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_task_parameters,
            close_browsers,
            submit_task,
            open_member_page,
            verify_portal_login
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                tauri::async_runtime::block_on(async {
                    app_handle.state::<HeadlessBrowserState>().close().await;
                    app_handle.state::<HeadedBrowserState>().close().await;
                    // The verify browser is throwaway: kill it outright if a
                    // verification was in flight when the app closed.
                    if let Some(mut browser) = app_handle
                        .state::<VerifyBrowserState>()
                        .0
                        .lock()
                        .await
                        .take()
                    {
                        let _ = browser.kill().await;
                    }
                });
            }
        });
}
