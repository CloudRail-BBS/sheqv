package com.cloudrail.community

import android.webkit.JavascriptInterface
import android.widget.Toast

/**
 * 给网页用的原生能力入口，挂在 `window.NativeApp` 上。
 *
 * 注意：`@JavascriptInterface` 的方法运行在 WebView 的 JavaBridge 线程，
 * 一切 UI / 系统服务调用都丢回主线程，别在这里直接弹窗。
 */
class WebBridge(private val activity: MainActivity) {

    @JavascriptInterface
    fun download(url: String?, filename: String?) {
        if (url.isNullOrBlank()) return
        activity.runOnUiThread { activity.startDownload(url, filename) }
    }

    @JavascriptInterface
    fun saveBase64(name: String?, mime: String?, data: String?) {
        if (data.isNullOrBlank()) return
        activity.runOnUiThread {
            activity.saveBase64(name ?: "image.png", mime ?: "image/png", data)
        }
    }

    @JavascriptInterface
    fun share(title: String?, text: String?, url: String?) {
        activity.runOnUiThread { activity.share(title, text, url) }
    }

    @JavascriptInterface
    fun openExternal(url: String?) {
        if (url.isNullOrBlank()) return
        activity.runOnUiThread { activity.openExternalUrl(url) }
    }

    /** 网页主题变化时同步状态栏 / 导航栏的图标明暗 */
    @JavascriptInterface
    fun setTheme(dark: Boolean) {
        activity.runOnUiThread { activity.applyBars(dark) }
    }

    @JavascriptInterface
    fun toast(message: String?) {
        if (message.isNullOrBlank()) return
        activity.runOnUiThread { Toast.makeText(activity, message, Toast.LENGTH_SHORT).show() }
    }

    @JavascriptInterface
    fun vibrate(ms: Int) {
        activity.runOnUiThread { activity.vibrate(ms.coerceIn(10, 400)) }
    }

    @JavascriptInterface
    fun version(): String = BuildConfig.VERSION_NAME

    @JavascriptInterface
    fun reload() {
        activity.runOnUiThread { activity.reloadSite() }
    }
}
