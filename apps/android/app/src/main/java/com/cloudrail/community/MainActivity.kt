package com.cloudrail.community

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * 社区 Android 端：原生壳 + 原生模块。
 *
 * 界面仍然是站点本身（所有页面功能都在），原生只负责 WebView 管不了的部分：
 * 会话 Cookie、文件选择、下载与保存、分享、外链、返回键、深链、状态栏明暗、离线兜底。
 * 网页通过 `window.NativeApp` 调原生；另外注入一层 `window.Capacitor` 兼容层，
 * 让站点里已有的 FileBridge 调用照常工作。
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var progress: ProgressBar
    private lateinit var offline: View
    private lateinit var splash: View

    private var fileCallback: android.webkit.ValueCallback<Array<Uri>>? = null
    private var lastBackAt = 0L
    private var splashHidden = false
    private var currentDark = false

    private val filePicker =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = fileCallback
            fileCallback = null
            if (callback == null) return@registerForActivityResult
            if (result.resultCode != RESULT_OK) {
                callback.onReceiveValue(null)
                return@registerForActivityResult
            }
            val data = result.data
            val clip = data?.clipData
            val uris: Array<Uri> = when {
                clip != null && clip.itemCount > 0 -> Array(clip.itemCount) { clip.getItemAt(it).uri }
                data?.data != null -> arrayOf(data.data!!)
                else -> emptyArray()
            }
            callback.onReceiveValue(if (uris.isEmpty()) null else uris)
        }

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, true)
        setContentView(R.layout.activity_main)

        web = findViewById(R.id.web)
        progress = findViewById(R.id.progress)
        offline = findViewById(R.id.offline)
        splash = findViewById(R.id.splash)

        findViewById<View>(R.id.offlineRetry).setOnClickListener {
            offline.visibility = View.GONE
            web.reload()
        }
        findViewById<View>(R.id.offlineBrowser).setOnClickListener {
            openExternalUrl(web.url ?: BuildConfig.APP_URL)
        }

        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)

        currentDark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES
        applyBars(currentDark)
        configureWeb()
        web.addJavascriptInterface(WebBridge(this), "NativeApp")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) {
                    web.goBack()
                    return
                }
                val now = System.currentTimeMillis()
                if (now - lastBackAt < 2000) {
                    finish()
                } else {
                    lastBackAt = now
                    Toast.makeText(this@MainActivity, R.string.exit_hint, Toast.LENGTH_SHORT).show()
                }
            }
        })

        requestNotificationPermission()

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState)
            hideSplash()
        } else {
            loadFromIntent(intent)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val data = intent.data
        if (intent.action == Intent.ACTION_VIEW && data != null && isInternal(data)) {
            web.loadUrl(data.toString())
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onPause() {
        CookieManager.getInstance().flush()
        web.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onDestroy() {
        web.removeJavascriptInterface("NativeApp")
        web.destroy()
        super.onDestroy()
    }

    // ── WebView 配置 ────────────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWeb() {
        web.setBackgroundColor(ContextCompat.getColor(this, R.color.app_bg))
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            loadsImagesAutomatically = true
            useWideViewPort = true
            loadWithOverviewMode = false
            builtInZoomControls = false
            displayZoomControls = false
            setSupportZoom(false)
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString CloudRailApp/${BuildConfig.VERSION_NAME}"
        }
        web.isVerticalScrollBarEnabled = false
        // 页面自己管滚动，根 WebView 不要再叠一层拉伸回弹（Android 12+ 的 stretch 会重绘整页）
        web.overScrollMode = View.OVER_SCROLL_NEVER
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(web, true)
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean = handleUri(request.url)

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                offline.visibility = View.GONE
                progress.visibility = View.VISIBLE
                progress.progress = 0
            }

            override fun onPageFinished(view: WebView, url: String?) {
                progress.visibility = View.GONE
                hideSplash()
                view.evaluateJavascript(BRIDGE_SHIM, null)
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError,
            ) {
                if (!request.isForMainFrame) return
                progress.visibility = View.GONE
                hideSplash()
                offline.visibility = View.VISIBLE
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress >= 100) {
                    progress.visibility = View.GONE
                } else {
                    progress.visibility = View.VISIBLE
                    progress.progress = newProgress
                }
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: android.webkit.ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?,
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = filePathCallback
                val intent = try {
                    fileChooserParams?.createIntent()
                } catch (e: Exception) {
                    null
                } ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                }
                return try {
                    filePicker.launch(intent)
                    true
                } catch (e: ActivityNotFoundException) {
                    fileCallback = null
                    false
                }
            }
        }

        web.setDownloadListener { url, userAgent, _, _, _ ->
            if (url.startsWith("blob:")) {
                Toast.makeText(this, R.string.dl_failed, Toast.LENGTH_SHORT).show()
                return@setDownloadListener
            }
            startDownload(url, null, userAgent)
        }

        web.setOnLongClickListener {
            val hit = web.hitTestResult
            when (hit.type) {
                WebView.HitTestResult.IMAGE_TYPE,
                WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE -> {
                    val url = hit.extra ?: return@setOnLongClickListener false
                    showImageMenu(url)
                    true
                }
                else -> false
            }
        }
    }

    private fun loadFromIntent(intent: Intent?) {
        val data = intent?.data
        val url = if (intent?.action == Intent.ACTION_VIEW && data != null && isInternal(data)) {
            data.toString()
        } else {
            BuildConfig.APP_URL
        }
        web.loadUrl(url)
    }

    // ── 导航与链接 ─────────────────────────────────────────────────

    private fun handleUri(uri: Uri): Boolean {
        return when (uri.scheme?.lowercase()) {
            "http", "https" -> if (isInternal(uri)) {
                false
            } else {
                openExternal(uri)
                true
            }
            "mailto", "tel", "sms", "weixin", "alipays", "intent" -> {
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                true
            }
            else -> {
                openExternal(uri)
                true
            }
        }
    }

    private fun isInternal(uri: Uri): Boolean {
        val host = uri.host?.lowercase() ?: return false
        val site = runCatching { Uri.parse(BuildConfig.APP_URL).host?.lowercase() }.getOrNull()
            ?: "crbbsx.com"
        return host == site || host.endsWith(".$site")
    }

    /** 站外链接交给自定义标签页，保留用户的浏览器会话与密码管理器 */
    private fun openExternal(uri: Uri) {
        try {
            CustomTabsIntent.Builder()
                .setShowTitle(true)
                .build()
                .launchUrl(this, uri)
        } catch (e: ActivityNotFoundException) {
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
        }
    }

    fun openExternalUrl(url: String) {
        val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return
        openExternal(uri)
    }

    // ── 原生能力（供 WebBridge 调） ────────────────────────────────

    fun startDownload(url: String, filename: String?, userAgent: String? = null) {
        val id = Downloads.enqueue(
            this,
            url,
            filename,
            null,
            userAgent ?: web.settings.userAgentString,
        )
        val msg = if (id != null) R.string.dl_started else R.string.dl_failed
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
    }

    fun saveBase64(name: String, mime: String, data: String) {
        val ok = Downloads.saveImage(this, name, mime, data)
        val msg = if (ok) R.string.saved_image else R.string.save_failed
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
    }

    fun share(title: String?, text: String?, url: String?) {
        val parts = listOfNotNull(
            text?.takeIf { it.isNotBlank() },
            url?.takeIf { it.isNotBlank() },
        )
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, parts.joinToString("\n"))
            title?.takeIf { it.isNotBlank() }?.let { putExtra(Intent.EXTRA_SUBJECT, it) }
        }
        runCatching { startActivity(Intent.createChooser(intent, null)) }
    }

    fun vibrate(ms: Int) {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        } ?: return
        runCatching {
            vibrator.vibrate(VibrationEffect.createOneShot(ms.toLong(), VibrationEffect.DEFAULT_AMPLITUDE))
        }
    }

    fun reloadSite() {
        offline.visibility = View.GONE
        web.reload()
    }

    fun applyBars(dark: Boolean) {
        currentDark = dark
        val bg = ContextCompat.getColor(this, if (dark) R.color.app_bg_dark else R.color.app_bg)
        window.statusBarColor = bg
        window.navigationBarColor = bg
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
        web.setBackgroundColor(bg)
    }

    // ── 杂项 ──────────────────────────────────────────────────────

    private fun hideSplash() {
        if (splashHidden) return
        splashHidden = true
        splash.animate().alpha(0f).setDuration(160).withEndAction {
            splash.visibility = View.GONE
        }.start()
    }

    private fun showImageMenu(url: String) {
        val actions = arrayOf(
            getString(R.string.save_image),
            getString(R.string.copy_link),
        )
        AlertDialog.Builder(this)
            .setItems(actions) { _, which ->
                if (which == 0) {
                    startDownload(url, null)
                } else {
                    copyToClipboard(url)
                }
            }
            .show()
    }

    private fun copyToClipboard(text: String) {
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("url", text))
        Toast.makeText(this, R.string.copied, Toast.LENGTH_SHORT).show()
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    companion object {
        private const val TAG = "MainActivity"

        /**
         * 页面脚本注入：
         * 1. 兼容站点里已有的 `Capacitor.Plugins.FileBridge` 调用，转给 NativeApp；
         * 2. 监听 `data-theme` 变化，把状态栏图标明暗同步给原生。
         */
        private val BRIDGE_SHIM = """
            (function () {
              try {
                if (window.__cloudrailNative) return;
                window.__cloudrailNative = true;
                var native = window.NativeApp || {};
                function call(name, args) {
                  try { if (native && typeof native[name] === 'function') native[name].apply(native, args); } catch (e) {}
                }
                window.Capacitor = {
                  isNativePlatform: function () { return true; },
                  getPlatform: function () { return 'android'; },
                  Plugins: {
                    FileBridge: {
                      saveUrlToDownloads: function (o) {
                        call('download', [o && o.url || '', o && o.filename || '']);
                        return Promise.resolve({ id: 0 });
                      },
                      saveImageToGallery: function (o) {
                        call('saveBase64', [o && o.filename || 'image.png', o && o.mime || 'image/png', o && o.base64 || '']);
                        return Promise.resolve({});
                      },
                      shareFile: function (o) {
                        call('share', [o && o.title || '', o && o.text || '', o && o.url || '']);
                        return Promise.resolve({});
                      }
                    }
                  }
                };
                function syncTheme() {
                  var dark = document.documentElement.getAttribute('data-theme') === 'dark';
                  call('setTheme', [dark]);
                }
                syncTheme();
                try {
                  new MutationObserver(syncTheme).observe(document.documentElement, {
                    attributes: true,
                    attributeFilter: ['data-theme']
                  });
                } catch (e) {}
              } catch (e) {}
            })();
        """.trimIndent()
    }
}
