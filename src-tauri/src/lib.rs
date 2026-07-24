mod account;
mod browser_session;
mod login;
mod navigation;
#[cfg(test)]
mod portal_dom;
mod project_options;
mod submission;
mod task_parameters;

use account::PortalAccountConfig;
use browser_session::{BrowserHost, BrowserSession};
use chromiumoxide::browser::{Browser, BrowserConfig};
use chromiumoxide::cdp::browser_protocol::network::{Headers, SetExtraHttpHeadersParams};
use chromiumoxide::Page;
use futures::StreamExt;
use login::{login_script, LoginPortal, PortalLogin, VerifyHost, VerifySession};
use navigation::{wait_for_navigation, UrlExpectation};
use project_options::ProjectOptionsCache;
use serde::Serialize;
use std::time::Duration;
use submission::{
    SubmissionAutomation, SubmissionPlan, SubmissionPortal, SubmissionPreferences,
    SubmissionWorkflow, TaskEntry,
};
use task_parameters::{TaskFormSource, TaskParameters, TaskParametersScrape};
use tauri::Manager;
use tauri_plugin_store::StoreExt;

// Portal-specific selectors. Update these here if the admin site changes its
// form markup. The portal base URL and Basic-auth credential are NOT compiled
// in: they are user-supplied via the Account form and read from `store.json`
// (`account.portal_url` / `account.portal_credential`) — see `portal_url()`
// and `portal_credential()`.
const LOGIN_INPUT_SELECTOR: &str = "input[type='text']";
const TASK_DATE_SELECT: &str = "select#task_date";
const TASK_LEAVE_SELECT: &str = "select#task_leave";
// The task form has 3 project/comment row pairs, numbered 1-3; append the row
// number to these prefixes to get a row's selectors.
const TASK_PROJECT_SELECT_PREFIX: &str = "select#task_project_id";
const TASK_COMMENT_TEXTAREA_PREFIX: &str = "textarea#task_comment";
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

/// The real Chromium boundary behind `BrowserSession`: launches a browser from
/// this instance's own profile dir, logs it into the portal, and terminates it.
struct ChromiumHost {
    app: tauri::AppHandle,
    with_head: bool,
}

/// One lazily-launched, logged-in Chromium instance. All reuse and teardown
/// policy lives in [`BrowserSession`](browser_session::BrowserSession).
type BrowserState = BrowserSession<ChromiumHost>;

fn browser_state(app: &tauri::AppHandle, with_head: bool) -> BrowserState {
    BrowserSession::new(ChromiumHost {
        app: app.clone(),
        with_head,
    })
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

/// The real Chromium boundary behind `VerifySession`. Always headless and
/// always in its own `profiles/verify` dir, so a check never contends with the
/// headed or headless session's profile lock.
struct ChromiumVerifyHost {
    app: tauri::AppHandle,
}

impl VerifyHost for ChromiumVerifyHost {
    type Browser = Browser;
    type Page = Page;

    async fn launch(&self) -> Result<(Browser, Page), AppError> {
        let user_data_dir = self
            .app
            .path()
            .app_cache_dir()?
            .join("profiles")
            .join("verify");
        launch_browser(&user_data_dir, false, "verify").await
    }

    async fn login(&self, page: &Page, config: &PortalAccountConfig) -> Result<(), AppError> {
        login_to_portal(page, config, "verify").await
    }

    async fn kill(&self, browser: &mut Browser) {
        let _ = browser.kill().await;
    }
}

/// Runs `verify_portal_login` checks. Parks the in-flight browser so the
/// `RunEvent::Exit` handler can kill it if the app closes mid-verify
/// (invariant: every browser instance must be terminated on app close).
struct VerifyBrowserState(VerifySession<ChromiumVerifyHost>);

impl std::ops::Deref for VerifyBrowserState {
    type Target = VerifySession<ChromiumVerifyHost>;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl ChromiumHost {
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
}

impl BrowserHost for ChromiumHost {
    type Browser = Browser;
    type Page = Page;

    fn label(&self) -> &'static str {
        if self.with_head {
            "headed"
        } else {
            "headless"
        }
    }

    /// Launches a fresh Chromium instance and logs into the admin portal.
    async fn launch(&self) -> Result<(Browser, Page), AppError> {
        // Read the whole config first: a missing value must fail before we
        // spend the cost of launching a browser.
        let account = portal_account(&self.app)?;

        let (browser, page) =
            launch_browser(&self.user_data_dir()?, self.with_head, self.label()).await?;
        login_to_portal(&page, &account, self.label()).await?;

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

    /// Probes whether the cached page can still be driven over CDP. Issues a
    /// real round-trip into the page's JS context (`Runtime.evaluate`) and
    /// returns false if it errors or times out.
    ///
    /// Do NOT probe with `page.url()`: chromiumoxide answers that from the
    /// handler's locally-cached frame state without contacting Chromium, so it
    /// keeps returning `Ok` even when the renderer/CDP session is dead (e.g.
    /// after the OS suspends the browser during a long idle) — a false positive
    /// that then strands the next real command on a ~30s CDP timeout. A
    /// process-level check (`Browser::try_wait`) is likewise insufficient: on
    /// macOS the process lingers after its last window closes. Probe the live
    /// session, not the cache or the process.
    async fn is_page_alive(&self, page: &Page) -> bool {
        matches!(
            tokio::time::timeout(std::time::Duration::from_secs(2), page.evaluate("1")).await,
            Ok(Ok(_))
        )
    }

    async fn close(&self, browser: &mut Browser, page: Page) {
        let _ = page.close().await;
        let _ = browser.close().await;
        let _ = browser.wait().await;
    }

    async fn kill(&self, browser: &mut Browser) {
        let _ = browser.kill().await;
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

/// The real `LoginPortal`: a Chromium page with stealth mode enabled. Holds no
/// login policy — the sequence lives in `PortalLogin::execute`.
struct ChromiumLoginPortal<'a>(&'a Page);

impl LoginPortal for ChromiumLoginPortal<'_> {
    async fn set_basic_auth(&mut self, token: &str) -> Result<(), AppError> {
        self.0.enable_stealth_mode().await?;
        self.0
            .execute(SetExtraHttpHeadersParams::new(Headers::new(
                serde_json::json!({ "Authorization": format!("Basic {token}") }),
            )))
            .await?;
        Ok(())
    }

    async fn goto(&mut self, url: &str) -> Result<(), AppError> {
        self.0.goto(url).await?;
        Ok(())
    }

    async fn submit_phone(&mut self, phone: &str) -> Result<(), AppError> {
        self.0
            .evaluate(login_script(LOGIN_INPUT_SELECTOR, phone)?)
            .await?;
        Ok(())
    }

    async fn wait_for_url(&mut self, expected: &str, timeout: Duration) -> Result<(), AppError> {
        wait_for_url(self.0, expected, timeout.as_millis() as u64).await
    }
}

/// Logs `page` into the admin portal with `config`. Shared by the persistent
/// browser sessions (values from `store.json`) and `verify_portal_login`
/// (candidate values from the Account form), so login can't drift between them.
async fn login_to_portal(
    page: &Page,
    config: &PortalAccountConfig,
    label: &str,
) -> Result<(), AppError> {
    PortalLogin::execute(config, label, &mut ChromiumLoginPortal(page)).await
}

/// Reads and validates the portal account config from `store.json`. Free
/// function (not a `ChromiumHost` method) so commands can read portal config
/// without holding a browser state reference.
fn portal_account(app: &tauri::AppHandle) -> Result<PortalAccountConfig, AppError> {
    let store = app.store("store.json")?;
    PortalAccountConfig::from_store_value(store.get("account").as_ref())
}

/// The user-configured portal base URL, normalized. Validates the whole
/// account, so a command that only needs the URL still reports the first
/// unconfigured field rather than failing later inside login.
fn portal_url(app: &tauri::AppHandle) -> Result<String, AppError> {
    Ok(portal_account(app)?.portal_url().to_string())
}

/// Polls until the page URL starts with `expected`. Prefix match rather than
/// equality, so a redirect that appends query params, a fragment, or a
/// trailing slash still counts as arrival. The first probe is immediate, so
/// an already-reached URL returns without waiting for the polling interval.
async fn wait_for_url(page: &Page, expected: &str, timeout_ms: u64) -> Result<(), AppError> {
    let expectation = UrlExpectation::new(expected);
    wait_for_navigation(
        &expectation,
        std::time::Duration::from_millis(timeout_ms),
        || async { page.url().await.map_err(AppError::from) },
    )
    .await
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
struct SelectOption {
    label: String,
    value: String,
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
/// held until the browser sessions are torn down. See `ProjectOptionsCache`
/// for why the cache is scoped to a login rather than to the process.
static PROJECT_OPTIONS: ProjectOptionsCache = ProjectOptionsCache::new();

/// The real `TaskFormSource`: a logged-in page plus the portal base URL. Holds
/// the selectors and nothing else — the scrape order and the caching rule live
/// in `TaskParametersScrape`.
struct ChromiumTaskFormSource<'a> {
    page: &'a Page,
    base_url: &'a str,
}

impl TaskFormSource for ChromiumTaskFormSource<'_> {
    async fn goto_task_form(&self) -> Result<(), AppError> {
        self.page
            .goto(format!("{}/task.php", self.base_url))
            .await?;
        Ok(())
    }

    async fn scrape_dates(&self) -> Result<Vec<SelectOption>, AppError> {
        get_select_options(self.page, &format!("{TASK_DATE_SELECT} option")).await
    }

    async fn scrape_leaves(&self) -> Result<Vec<SelectOption>, AppError> {
        get_select_options(self.page, &format!("{TASK_LEAVE_SELECT} option")).await
    }

    async fn scrape_projects(&self) -> Result<Vec<SelectOption>, AppError> {
        get_select_options(self.page, &format!("{TASK_PROJECT_SELECT_PREFIX}1 option")).await
    }

    async fn goto_member_page(&self) -> Result<(), AppError> {
        self.page
            .goto(format!("{}/member.php", self.base_url))
            .await?;
        Ok(())
    }
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
    // The scraped project list belongs to the login that was just torn down;
    // the next one may be a different member or portal.
    PROJECT_OPTIONS.clear().await;
    Ok(())
}

/// Verifies the given portal values by performing a real login in a throwaway
/// headless browser. Takes the *candidate* values as arguments — this never
/// reads `store.json` — so nothing persists unless the frontend decides to
/// save after this succeeds. Pass or fail, the browser is killed before
/// returning; it exists only for the duration of the check.
#[tauri::command]
async fn verify_portal_login(
    state: tauri::State<'_, VerifyBrowserState>,
    portal_url: String,
    portal_credential: String,
    phone: String,
) -> Result<(), AppError> {
    log::info!("verify_portal_login: checking candidate portal values");
    // Candidates run through the same validation and trailing-slash
    // normalization as stored values, so nothing can pass here and then behave
    // differently once the frontend saves it.
    let candidate = PortalAccountConfig::from_candidates(phone, portal_url, portal_credential)?;
    state.verify(&candidate).await
}

#[tauri::command]
async fn get_task_parameters(
    state: tauri::State<'_, HeadlessBrowserState>,
) -> Result<TaskParameters, AppError> {
    let base_url = portal_url(&state.host().app)?;
    let page = state.get_page().await?;
    let source = ChromiumTaskFormSource {
        page: &page,
        base_url: &base_url,
    };

    let parameters = TaskParametersScrape::run(&source, &PROJECT_OPTIONS).await?;

    log::info!(
        "get_task_parameters: scraped {} dates, {} leaves, {} projects",
        parameters.dates.len(),
        parameters.leaves.len(),
        parameters.projects.len()
    );
    Ok(parameters)
}

#[tauri::command]
async fn open_member_page(state: tauri::State<'_, HeadedBrowserState>) -> Result<(), AppError> {
    let base_url = portal_url(&state.host().app)?;
    let page = state.get_page().await?;
    page.goto(format!("{base_url}/member.php")).await?;
    page.bring_to_front().await?;
    Ok(())
}

struct ChromiumSubmissionPortal<'a> {
    page: &'a Page,
    state: &'a HeadedBrowserState,
    base_url: &'a str,
}

/// Writes the plan into the task form on `page`, which must already be on it.
/// Free function (not a `ChromiumSubmissionPortal` method) so the DOM contract
/// can be exercised against a fixture page without an `AppHandle`.
async fn fill_task_form(page: &Page, date: &str, plan: &SubmissionPlan) -> Result<(), AppError> {
    // `date` comes from a portal option value, but escape it like every
    // other injected literal so the trust boundary isn't load-bearing.
    let date_js = serde_json::to_string(date)?;
    page.evaluate(format!(
        "document.querySelector('{TASK_DATE_SELECT}').value = {date_js}"
    ))
    .await?;

    for (i, entry) in plan.rows().iter().enumerate() {
        let row = i + 1;
        if let Some(project) = entry.project() {
            let project_js = serde_json::to_string(project)?;
            page.evaluate(format!(
                "document.querySelector('{TASK_PROJECT_SELECT_PREFIX}{row}').value = {project_js};"
            ))
            .await?;
        }
        let summary_js = serde_json::to_string(entry.summary())?;
        page.evaluate(format!(
            "document.querySelector('{TASK_COMMENT_TEXTAREA_PREFIX}{row}').value = {summary_js};"
        ))
        .await?;
    }

    if let Some(keep) = plan.project_filter() {
        // Every value set on a row select must survive the filter, so the
        // keep list is project_list + default_project + each entry's project.
        let keep_js = serde_json::to_string(keep)?;
        page.evaluate(format!(
            "Array.from(document.querySelectorAll('select')).forEach((e) => {{
                        if (e.id.includes('task_project_id')) {{
                            e.querySelectorAll('option').forEach((o) => {{
                                if (!{keep_js}.includes(o.value) && o.value != '') {{
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

/// Submits the task form on `page`. Free function for the same reason as
/// `fill_task_form`.
async fn submit_task_form(page: &Page) -> Result<(), AppError> {
    // The selector contains single quotes, so pass it through
    // `serde_json::to_string` instead of hand-wrapping it in '...'
    // (same technique as the login selector).
    let form_selector_js = serde_json::to_string(TASK_FORM_SELECTOR)?;
    page.evaluate(format!(
        "document.querySelector({form_selector_js}).submit();"
    ))
    .await?;
    Ok(())
}

impl SubmissionPortal for ChromiumSubmissionPortal<'_> {
    async fn prepare(&mut self, date: &str, plan: &SubmissionPlan) -> Result<(), AppError> {
        self.page
            .goto(format!("{}/task.php", self.base_url))
            .await?;
        self.page.bring_to_front().await?;
        fill_task_form(self.page, date, plan).await
    }

    async fn submit(&mut self) -> Result<(), AppError> {
        log::info!("submit_task: auto-submitting the task form");
        submit_task_form(self.page).await
    }

    async fn confirm_submission(&mut self) -> Result<(), AppError> {
        // The portal confirms a saved task by navigating to the report page.
        wait_for_url(
            self.page,
            &format!("{}/task_report.php", self.base_url),
            10_000,
        )
        .await
    }

    async fn close(&mut self) {
        log::info!("submit_task: submission confirmed, closing headed browser");
        self.state.close().await;
    }
}

#[tauri::command]
async fn submit_task(
    state: tauri::State<'_, HeadedBrowserState>,
    date: String,
    entries: Vec<TaskEntry>,
) -> Result<(), AppError> {
    log::info!(
        "submit_task: pre-filling form for date {date} ({} row(s))",
        entries.len().max(1)
    );
    let base_url = portal_url(&state.host().app)?;
    let page = state.get_page().await?;

    let store = state.host().app.store("store.json")?;
    let preferences = store.get("preferences");
    let default_project = preferences.as_ref().and_then(|value| {
        value
            .get("default_project")
            .and_then(|p| p.as_str().map(String::from))
    });
    let project_list = preferences
        .as_ref()
        .and_then(|value| {
            value
                .get("project_list")
                .and_then(|projects| projects.as_array().cloned())
        })
        .unwrap_or_default()
        .into_iter()
        .filter_map(|project| project.as_str().map(String::from))
        .collect();
    let plan = SubmissionPlan::build(
        entries,
        SubmissionPreferences::new(default_project, project_list),
    )?;
    let automation = SubmissionAutomation::from_preferences(preferences.as_ref());
    let mut portal = ChromiumSubmissionPortal {
        page: &page,
        state: &state,
        base_url: &base_url,
    };

    SubmissionWorkflow::execute(&plan, automation, &date, &mut portal)
        .await
        .map(|_| ())
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(HeadlessBrowserState(browser_state(app.handle(), false)));
            app.manage(HeadedBrowserState(browser_state(app.handle(), true)));
            app.manage(VerifyBrowserState(VerifySession::new(ChromiumVerifyHost {
                app: app.handle().clone(),
            })));
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
                    app_handle.state::<VerifyBrowserState>().kill_parked().await;
                });
            }
        });
}
