package com.cloudrail.community

import android.app.Activity
import android.app.AlertDialog
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.widget.Toast
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * 应用内更新。
 *
 * 之前「检查更新」只写在下载页文案里，客户端根本没有实现 —— 用户点更新没有任何反应。
 * 这里补完整链路：查 `/api/v1/app/latest` → 比较 build → 弹窗（强制更新不可取消）→
 * 系统下载器拉 APK → 下载完成广播 → 安装器。
 *
 * 只比 `build`（versionCode），不比版本号字符串：字符串顺序不可靠，build 是单调的。
 */
object Updater {

    data class Release(
        val version: String,
        val build: Int,
        val url: String,
        val notes: String,
        val force: Boolean,
        val minVersion: String,
        val size: Long,
        val sha256: String,
    )

    private const val PREFS = "cloudrail.update"
    private const val KEY_DOWNLOAD_ID = "download_id"

    private val io = Executors.newSingleThreadExecutor()

    /** 后台线程查最新版；回调在主线程。失败静默（手动检查时才提示） */
    fun check(activity: Activity, manual: Boolean) {
        io.execute {
            val release = runCatching { fetch(activity) }.getOrNull()
            activity.runOnUiThread {
                if (release == null) {
                    if (manual) toast(activity, "检查更新失败，请检查网络")
                    return@runOnUiThread
                }
                val current = BuildConfig.VERSION_CODE
                if (release.build <= current) {
                    if (manual) toast(activity, "已是最新版本 v${BuildConfig.VERSION_NAME}")
                    return@runOnUiThread
                }
                prompt(activity, release)
            }
        }
    }

    private fun fetch(activity: Activity): Release? {
        val base = BuildConfig.APP_URL.trimEnd('/')
        val conn = URL("$base/api/v1/app/latest?platform=android&channel=stable")
            .openConnection() as HttpURLConnection
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        conn.setRequestProperty("Accept", "application/json")
        conn.setRequestProperty("User-Agent", "CloudRailApp/${BuildConfig.VERSION_NAME}")
        try {
            if (conn.responseCode != 200) return null
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            val item = JSONObject(body).optJSONObject("item") ?: return null
            val url = item.optString("downloadUrl")
            if (url.isBlank()) return null
            return Release(
                version = item.optString("version", ""),
                build = item.optInt("build", 0),
                url = url,
                notes = item.optString("notes", ""),
                force = item.optBoolean("forceUpdate", false),
                minVersion = item.optString("minVersion", ""),
                size = item.optLong("fileSize", 0),
                sha256 = item.optString("sha256", ""),
            )
        } finally {
            conn.disconnect()
        }
    }

    private fun prompt(activity: Activity, release: Release) {
        // 低于 minVersion 的一律按强制更新处理：接口里两个字段都要尊重
        val force = release.force || isBelowMin(BuildConfig.VERSION_NAME, release.minVersion)
        val notes = release.notes.ifBlank { "包含问题修复与体验改进。" }
        val size = if (release.size > 0) "\n\n安装包 ${fmtSize(release.size)}" else ""

        val builder = AlertDialog.Builder(activity)
            .setTitle("发现新版本 v${release.version}")
            .setMessage(notes + size)
            .setPositiveButton("下载并安装") { _, _ -> download(activity, release) }
            .setCancelable(!force)
        if (!force) builder.setNegativeButton("稍后") { dialog, _ -> dialog.dismiss() }
        builder.show()
    }

    private fun download(activity: Activity, release: Release) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !activity.packageManager.canRequestPackageInstalls()
        ) {
            // 没有「安装未知应用」权限时先引导开启，否则下载完也装不上
            toast(activity, "请先允许安装未知应用，再点一次下载")
            runCatching {
                activity.startActivity(
                    Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:${activity.packageName}"),
                    ),
                )
            }
            return
        }

        val name = "CloudRail-${release.version}.apk"
        // 后台登记的是站内相对地址（/downloads/x.apk），下载器只吃绝对 URL，这里补一下
        val absolute = if (release.url.startsWith("http")) release.url
        else BuildConfig.APP_URL.trimEnd('/') + release.url
        val request = DownloadManager.Request(Uri.parse(absolute))
            .setTitle("云轨社区 v${release.version}")
            .setDescription("正在下载更新")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(
                android.os.Environment.DIRECTORY_DOWNLOADS,
                URLUtil.guessFileName(absolute, null, "application/vnd.android.package-archive")
                    .ifBlank { name },
            )
            .setAllowedOverMetered(true)

        CookieManager.getInstance().getCookie(absolute)?.let {
            request.addRequestHeader("Cookie", it)
        }
        val dm = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val id = dm.enqueue(request)
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putLong(KEY_DOWNLOAD_ID, id)
            .apply()
        toast(activity, "开始下载，完成后会提示安装")
    }

    /** 下载完成广播：只认我们自己发起的那一个 id */
    class InstallReceiver : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action != DownloadManager.ACTION_DOWNLOAD_COMPLETE) return
            val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            if (id <= 0 || prefs.getLong(KEY_DOWNLOAD_ID, -1) != id) return
            prefs.edit().remove(KEY_DOWNLOAD_ID).apply()

            val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val cursor: Cursor = dm.query(DownloadManager.Query().setFilterById(id)) ?: return
            val status = cursor.use {
                if (!it.moveToFirst()) return
                it.getInt(it.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
            }
            if (status != DownloadManager.STATUS_SUCCESSFUL) {
                toast(context, "更新包下载失败，请重试")
                return
            }
            val uri = dm.getUriForDownloadedFile(id) ?: return
            install(context, uri)
        }
    }

    fun install(context: Context, uri: Uri) {
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        runCatching { context.startActivity(intent) }
            .onFailure { toast(context, "没有找到安装器，请到「下载」目录手动安装") }
    }

    private fun isBelowMin(current: String, min: String): Boolean {
        if (min.isBlank()) return false
        val a = current.split('.').mapNotNull { it.toIntOrNull() }
        val b = min.split('.').mapNotNull { it.toIntOrNull() }
        for (i in 0 until maxOf(a.size, b.size)) {
            val x = a.getOrElse(i) { 0 }
            val y = b.getOrElse(i) { 0 }
            if (x != y) return x < y
        }
        return false
    }

    private fun fmtSize(bytes: Long): String =
        if (bytes >= 1024 * 1024) "%.1f MB".format(bytes / 1024.0 / 1024.0)
        else "${bytes / 1024} KB"

    private fun toast(context: Context, text: String) {
        Toast.makeText(context, text, Toast.LENGTH_SHORT).show()
    }
}
