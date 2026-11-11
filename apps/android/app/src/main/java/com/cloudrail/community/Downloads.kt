package com.cloudrail.community

import android.app.DownloadManager
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.CookieManager
import android.webkit.URLUtil
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 原生下载与图片保存。
 *
 * 站内下载走 `DownloadManager`：文件落在系统「下载」目录，通知栏有进度。
 * WebView 自己的 Cookie 不会自动带给下载请求，所以这里手动补 `Cookie` 与 UA，
 * 否则需要登录的资源文件会直接 401。
 */
object Downloads {
    private const val MAX_IMAGE_BYTES = 12 * 1024 * 1024

    fun enqueue(
        ctx: Context,
        url: String,
        filename: String?,
        mime: String?,
        userAgent: String?,
    ): Long? {
        if (!url.startsWith("http://") && !url.startsWith("https://")) return null
        return try {
            val guessed = filename?.takeIf { it.isNotBlank() }
                ?: URLUtil.guessFileName(url, null, mime)
            val name = uniqueName(sanitize(guessed))
            val request = DownloadManager.Request(Uri.parse(url))
                .setTitle(name)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)
            userAgent?.takeIf { it.isNotBlank() }?.let { request.addRequestHeader("User-Agent", it) }
            CookieManager.getInstance().getCookie(url)?.takeIf { it.isNotBlank() }?.let {
                request.addRequestHeader("Cookie", it)
            }
            ctx.getSystemService(DownloadManager::class.java).enqueue(request)
        } catch (e: Exception) {
            null
        }
    }

    /** 网页侧把图片转成 base64 交过来（长按保存、分享图），写入相册 */
    fun saveImage(ctx: Context, name: String, mime: String, base64: String): Boolean {
        return try {
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            if (bytes.isEmpty() || bytes.size > MAX_IMAGE_BYTES) return false
            val fileName = sanitize(name.ifBlank { "cloudrail-${stamp()}.png" })
            val type = mime.ifBlank { "image/png" }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                    put(MediaStore.MediaColumns.MIME_TYPE, type)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/云轨社区")
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
                val resolver = ctx.contentResolver
                val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return false
                resolver.openOutputStream(uri)?.use { it.write(bytes) } ?: return false
                values.clear()
                values.put(MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
                true
            } else {
                @Suppress("DEPRECATION")
                val dir = File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                    "云轨社区",
                )
                if (!dir.exists() && !dir.mkdirs()) return false
                File(dir, fileName).writeBytes(bytes)
                true
            }
        } catch (e: Exception) {
            false
        }
    }

    private fun sanitize(raw: String): String {
        val cleaned = raw.replace(Regex("[\\\\/:*?\"<>|\\r\\n]"), "_").trim().take(96)
        return cleaned.ifBlank { "download-${stamp()}.bin" }
    }

    /** DownloadManager 不会覆盖同名文件，重名时补时间戳，免得点两次直接失败 */
    private fun uniqueName(name: String): String {
        @Suppress("DEPRECATION")
        val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        if (!File(dir, name).exists()) return name
        val dot = name.lastIndexOf('.')
        val base = if (dot > 0) name.substring(0, dot) else name
        val ext = if (dot > 0) name.substring(dot) else ""
        return "$base-${stamp()}$ext"
    }

    private fun stamp(): String = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
}
