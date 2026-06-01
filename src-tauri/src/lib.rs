use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use chromiumoxide::browser::{Browser, BrowserConfig};
use chromiumoxide::cdp::browser_protocol::network::{Headers, SetExtraHttpHeadersParams};
use chromiumoxide::Page;
use futures::StreamExt;
use tauri::Manager;
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;

struct BrowserState {
    inner: Mutex<Option<(Browser, Page, tempfile::TempDir)>>,
    app: tauri::AppHandle,
}

impl BrowserState {
    fn new(app: tauri::AppHandle) -> Self {
        Self {
            inner: Mutex::new(None),
            app,
        }
    }

    async fn reset(&self) {
        let mut guard = self.inner.lock().await;
        if let Some((mut browser, page, _temp_dir)) = guard.take() {
            let _ = page.close().await;
            let _ = browser.close().await;
            let _ = browser.wait().await;
        }
    }

    async fn get_page(&self) -> Result<Page, String> {
        let mut guard = self.inner.lock().await;
        if let Some((_, page, _)) = guard.as_ref() {
            return Ok(page.clone());
        }
        let temp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;
        let (browser, mut handler) = Browser::launch(
            BrowserConfig::builder()
                .with_head()
                .user_data_dir(temp_dir.path())
                .build()
                .map_err(|e| e.to_string())?,
        )
        .await
        .map_err(|e| e.to_string())?;
        tokio::spawn(async move { while let Some(_) = handler.next().await {} });
        let page = browser
            .new_page("about:blank")
            .await
            .map_err(|e| e.to_string())?;

        page.enable_stealth_mode()
            .await
            .map_err(|e| e.to_string())?;
        let token = STANDARD.encode("user:pass");
        page.execute(SetExtraHttpHeadersParams::new(Headers::new(
            serde_json::json!({ "Authorization": format!("Basic {}", token) }),
        )))
        .await
        .map_err(|e| e.to_string())?;
        page.goto("https://portal.example.com/team")
            .await
            .map_err(|e| e.to_string())?;
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;

        let store = self.app.store("store.json").map_err(|e| e.to_string())?;
        let phone = store
            .get("phone")
            .and_then(|v| v.as_str().map(String::from))
            .ok_or("Phone number not configured")?;

        let input_el = page
            .find_element("input[type='text']")
            .await
            .map_err(|e| e.to_string())?;
        input_el.click().await.map_err(|e| e.to_string())?;
        input_el.type_str(phone).await.map_err(|e| e.to_string())?;
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        input_el
            .press_key("Enter")
            .await
            .map_err(|e| e.to_string())?;

        wait_for_url(&page, "/team/member.php", 5_000).await?;

        *guard = Some((browser, page.clone(), temp_dir));
        Ok(page)
    }
}

async fn wait_for_url(page: &Page, expected: &str, timeout_ms: u64) -> Result<(), String> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(timeout_ms);
    let initial_url = page.url().await.map_err(|e| e.to_string())?;
    loop {
        if std::time::Instant::now() > deadline {
            return Err(format!("Timed out waiting for URL containing: {expected}"));
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        let url = tokio::time::timeout(std::time::Duration::from_millis(2_000), page.url())
            .await
            .map_err(|_| "page.url() timed out".to_string())?
            .map_err(|e| e.to_string())?;
        if url != initial_url && url.as_deref().is_some_and(|u| u.contains(expected)) {
            return Ok(());
        }
    }
}

#[derive(Serialize)]
struct TaskOptions {
    dates: Vec<String>,
    leaves: Vec<String>,
    projects: Vec<String>,
}

async fn get_option_values(page: &Page, selector: &str) -> Result<Vec<String>, String> {
    let elements = page
        .find_elements(selector)
        .await
        .map_err(|e| e.to_string())?;
    let mut values = Vec::with_capacity(elements.len());
    for el in &elements {
        if let Some(value) = el.attribute("value").await.map_err(|e| e.to_string())? {
            if !value.is_empty() {
                values.push(value);
            }
        }
    }
    Ok(values)
}

#[tauri::command]
async fn reset_browser(state: tauri::State<'_, BrowserState>) -> Result<(), String> {
    state.reset().await;
    Ok(())
}

#[tauri::command]
async fn get_task_options(state: tauri::State<'_, BrowserState>) -> Result<TaskOptions, String> {
    let page = state.get_page().await?;

    page.goto("https://portal.example.com/team/task.php")
        .await
        .map_err(|e| e.to_string())?;

    let date_options = get_option_values(&page, "select#task_date option")
        .await
        .map_err(|e| e.to_string())?;
    let leave_options = get_option_values(&page, "select#task_leave option")
        .await
        .map_err(|e| e.to_string())?;
    let project_options = get_option_values(&page, "select#task_project_id1 option")
        .await
        .map_err(|e| e.to_string())?;

    page.goto("https://portal.example.com/team/member.php")
        .await
        .map_err(|e| e.to_string())?;

    Ok(TaskOptions {
        dates: date_options,
        leaves: leave_options,
        projects: project_options,
    })
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let store = app.store("store.json")?;
            if store.is_empty() {
                store.set("phone", "");
                store.set("email", "");
                store.set("api_token", "");
            }
            let _ = store.save();
            app.manage(BrowserState::new(app.handle().clone()));
            Ok(())
        })
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_task_options, reset_browser])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<BrowserState>();
                tauri::async_runtime::block_on(async {
                    let mut guard = state.inner.lock().await;
                    if let Some((mut browser, page, _temp_dir)) = guard.take() {
                        let _ = page.clone().close().await;
                        let _ = browser.close().await;
                        let _ = browser.wait().await;
                    }
                });
            }
        });
}
