use base64::{engine::general_purpose::STANDARD, Engine};
use chromiumoxide::browser::{Browser, BrowserConfig};
use chromiumoxide::cdp::browser_protocol::network::{Headers, SetExtraHttpHeadersParams};
use chromiumoxide::Page;
use futures::StreamExt;
use tauri_plugin_store::StoreExt;

async fn wait_for_url(page: &Page, expected: &str, timeout_ms: u64) -> Result<(), String> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(timeout_ms);
    let initial_url = page.url().await.map_err(|e| e.to_string())?;
    loop {
        if std::time::Instant::now() > deadline {
            return Err(format!("Timed out waiting for URL containing: {expected}"));
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        let url = tokio::time::timeout(
            std::time::Duration::from_millis(2_000),
            page.url(),
        )
        .await
        .map_err(|_| "page.url() timed out".to_string())?
        .map_err(|e| e.to_string())?;
        if url != initial_url && url.as_deref().is_some_and(|u| u.contains(expected)) {
            return Ok(());
        }
    }
}

#[tauri::command]
async fn get_date_options(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let store = app.store("store.json").map_err(|e| e.to_string())?;
    let phone = store
        .get("phone")
        .and_then(|v| v.as_str().map(String::from))
        .ok_or("Phone number not configured")?;
    let (mut browser, mut handler) = Browser::launch(
        BrowserConfig::builder()
            // .headless_mode(chromiumoxide::browser::HeadlessMode::New)
            .with_head()
            .build()
            .map_err(|e| e.to_string())?,
    )
    .await
    .map_err(|e| e.to_string())?;

    let handle = tokio::spawn(async move { while let Some(_) = handler.next().await {} });

    let result: Result<Vec<String>, String> = async {
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

        // go to login page
        page.goto("https://portal.example.com/team")
            .await
            .map_err(|e| e.to_string())?;
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;

        // login
        let input_el = page
            .find_element("input[type='text']")
            .await
            .map_err(|e| e.to_string())?;
        input_el.click().await.map_err(|e| e.to_string())?;
        input_el.type_str(phone).await.map_err(|e| e.to_string())?;
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        input_el.press_key("Enter").await.map_err(|e| e.to_string())?;

        // wait for login success
        wait_for_url(&page, "/team/member.php", 5_000).await?;

        // go to task page
        page.goto("https://portal.example.com/team/task.php")
            .await
            .map_err(|e| e.to_string())?;

        // get date options
        let elements = page
            .find_elements("select#task_date option")
            .await
            .map_err(|e| e.to_string())?;
        let mut options = Vec::with_capacity(elements.len());
        for el in &elements {
            if let Some(value) = el.attribute("value").await.map_err(|e| e.to_string())? {
                if !value.is_empty() {
                    options.push(value);
                }
            }
        }

        let _ = page.close().await;
        Ok(options)
    }
    .await;

    let _ = browser.close().await;
    let _ = browser.wait().await;
    handle.abort();
    let _ = handle.await;

    return result;
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

            Ok(())
        })
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_date_options])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
