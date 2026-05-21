use base64::{engine::general_purpose::STANDARD, Engine};
use chromiumoxide::browser::{Browser, BrowserConfig};
use chromiumoxide::cdp::browser_protocol::network::{Headers, SetExtraHttpHeadersParams};
use futures::StreamExt;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn test() -> Result<String, String> {
    let (browser, mut handler) = Browser::launch(
        BrowserConfig::builder()
            .with_head()
            .build()
            .map_err(|e| e.to_string())?,
    )
    .await
    .map_err(|e| e.to_string())?;

    let handle = tokio::spawn(async move {
        loop {
            let _event = handler.next().await.unwrap();
        }
    });

    let page = browser
        .new_page("about:blank")
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

    println!("1");
    tokio::time::sleep(std::time::Duration::from_millis(2000)).await;

    // 1. Fill phone number
    // let nav = page.wait_for_navigation();
    page.find_element("input[type='text']")
        .await
        .map_err(|e| e.to_string())?
        .click()
        .await
        .map_err(|e| e.to_string())?
        .type_str("0000000000")
        .await
        .map_err(|e| e.to_string())?
        .press_key("Enter")
        .await
        .map_err(|e| e.to_string())?;
    page.wait_for_navigation()
        .await
        .map_err(|e| e.to_string())?;
    println!("2");

    // // 2. Submit and wait for navigation to member.php
    // let nav = page.wait_for_navigation();
    // let _ = page
    //     .find_element("input[type='submit']")
    //     .await
    //     .map_err(|e| e.to_string())?
    //     .click()
    //     .await;
    // nav.await.map_err(|e| e.to_string())?;

    // println!("3");

    // // 3. Click "ส่งรายงาน" and wait for navigation to task.php
    // // No CSS text selector — use find_element to wait, then JS to click by text
    // let nav = page.wait_for_navigation();
    // let _ = page
    //     .evaluate(
    //         r#"Array.from(document.querySelectorAll('button'))
    //         .find(b => b.textContent.trim() === 'ส่งรายงาน')
    //         ?.click()"#,
    //     )
    //     .await;
    // nav.await.map_err(|e| e.to_string())?;

    // println!("4");

    // // 4. Select today's date in task_date
    // let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    // page.find_element("select#task_date")
    //     .await.map_err(|e| e.to_string())?
    //     .click().await.map_err(|e| e.to_string())?;
    // page.find_element(&format!("select#task_date option[value='{}']", today))
    //     .await.map_err(|e| e.to_string())?
    //     .click().await.map_err(|e| e.to_string())?;

    // // 5. Select project "flexirent web" in task_project_id1
    // // No CSS text selector for option text — use find_element to wait, then JS to select
    // page.find_element("select#task_project_id1").await.map_err(|e| e.to_string())?;
    // page.evaluate(
    //     r#"(()=>{
    //         const s = document.getElementById('task_project_id1');
    //         const opt = Array.from(s.options).find(
    //             o => o.text.toLowerCase().includes('flexirent web') ||
    //                  o.value.toLowerCase().includes('flexirent web')
    //         );
    //         if (opt) { s.value = opt.value; s.dispatchEvent(new Event('change', {bubbles:true})); }
    //     })()"#,
    // )
    // .await
    // .map_err(|e| e.to_string())?;

    // // 6. Fill textarea task_comment1
    // let comment = page
    //     .find_element("textarea#task_comment1")
    //     .await.map_err(|e| e.to_string())?;
    // comment.click().await.map_err(|e| e.to_string())?;
    // comment.type_str("test").await.map_err(|e| e.to_string())?;

    // // 7. Click "upload" submit button
    // // No CSS text selector — use find_element to wait, then JS to click by text
    // page.find_element("button[type='submit']").await.map_err(|e| e.to_string())?;
    // page.evaluate(
    //     r#"Array.from(document.querySelectorAll('button[type="submit"]'))
    //         .find(b => b.textContent.trim().toLowerCase() === 'upload')
    //         ?.click()"#,
    // )
    // .await
    // .map_err(|e| e.to_string())?;

    // browser.close().await.map_err(|e| e.to_string())?;
    handle.await.map_err(|e| e.to_string())?;
    Ok("Done".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, test])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
