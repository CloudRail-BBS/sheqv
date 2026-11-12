// 云轨社区桌面壳：远程加载 Web，原生层只处理窗口/托盘/通知/外链/下载。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri::WebviewUrl;
use tauri::WebviewWindowBuilder;
use tauri::webview::DownloadEvent;
use tauri_plugin_notification::NotificationExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            build_main_window(app)?;

            #[cfg(desktop)]
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::TrayIconBuilder;

                let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show, &quit])?;
                let _tray = TrayIconBuilder::new()
                    .menu(&menu)
                    .show_menu_on_left_click(true)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .build(app)?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 主窗口在代码里建，只为了挂下载处理器。
///
/// 之前窗口写在 tauri.conf.json 里，`on_download` 没地方挂 —— 表现就是点「下载」
/// 什么也不发生（WebView2 默认把下载吞掉）。这里显式落到系统「下载」目录，
/// 完成后弹一条系统通知，用户找得到文件。
fn build_main_window(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle().clone();

    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("云轨社区")
        .inner_size(1200.0, 820.0)
        .min_inner_size(980.0, 640.0)
        .center()
        // 关掉 Tauri 自己的拖放拦截：网页里的拖拽上传（资源 / 发帖带图）才能收到事件
        .disable_drag_drop_handler()
        .on_download(move |webview, event| {
            match event {
                DownloadEvent::Requested { url, destination } => {
                    if let Ok(dir) = webview.path().download_dir() {
                        let name = url
                            .path_segments()
                            .and_then(|s| s.last())
                            .filter(|s| !s.is_empty())
                            .unwrap_or("download.bin");
                        *destination = unique_path(&dir.join(sanitize(name)));
                    }
                }
                DownloadEvent::Finished { path, success, .. } => {
                    if success {
                        if let Some(path) = path {
                            let _ = handle
                                .notification()
                                .builder()
                                .title("下载完成")
                                .body(format!("已保存到 {}", path.display()))
                                .show();
                        }
                    }
                }
                _ => {}
            }
            // 返回 false 会取消这次下载
            true
        })
        .build()?;

    Ok(())
}

/// 重名时加序号：下载目录里不该互相覆盖
fn unique_path(path: &std::path::Path) -> std::path::PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("download");
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    for i in 1..1000 {
        let name = if ext.is_empty() {
            format!("{stem} ({i})")
        } else {
            format!("{stem} ({i}).{ext}")
        };
        let candidate = path.with_file_name(name);
        if !candidate.exists() {
            return candidate;
        }
    }
    path.to_path_buf()
}

/// 只留文件名，挡掉 `../` 之类的写法，避免写到下载目录之外
fn sanitize(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if "\\/:*?\"<>|".contains(c) { '_' } else { c })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').to_string();
    if trimmed.is_empty() {
        "download.bin".to_string()
    } else {
        trimmed
    }
}
