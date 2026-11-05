package com.cloudrail.community

import android.app.DownloadManager
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File

/**
 * 文件写入桥：只做站内需要的四件事。
 *
 * - 大文件下载：DownloadManager → 公共下载目录
 * - 图片/证书：MediaStore → Pictures/云轨社区
 * - 另存为：SAF ACTION_CREATE_DOCUMENT，用户选位置
 * - 分享/安装 APK：FileProvider
 *
 * 不使用 MANAGE_EXTERNAL_STORAGE，避免应用商店审核问题。
 */
@CapacitorPlugin(name = "FileBridge")
class FileBridgePlugin : Plugin() {
    @PluginMethod
    fun saveUrlToDownloads(call: PluginCall) {
        val raw = call.getString("url") ?: return call.reject("缺少 url")
        // 站内地址补成绝对地址；DownloadManager 不认相对路径
        val url = if (raw.startsWith("http")) raw else "https://crbbsx.com$raw"
        val wanted = call.getString("filename")?.takeIf { it.isNotBlank() }
        val name = wanted?.let { safeName(it) }
        val request = DownloadManager.Request(Uri.parse(url))
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(false)
        if (name != null) {
            request.setTitle(name).setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
        }
        // 站内下载要过会话校验：把 WebView 的 Cookie 一起带上，否则 401
        val cookie = android.webkit.CookieManager.getInstance().getCookie(url)
        if (!cookie.isNullOrEmpty()) request.addRequestHeader("Cookie", cookie)
        call.getString("mime")?.takeIf { it.isNotEmpty() }?.let { request.setMimeType(it) }
        val dm = context.getSystemService(DownloadManager::class.java)
        val id = dm.enqueue(request)
        call.resolve(JSObject().put("id", id).put("filename", name ?: ""))
    }

    @PluginMethod
    fun saveImageToGallery(call: PluginCall) {
        val base64 = call.getString("base64") ?: return call.reject("缺少 base64")
        val name = safeName(call.getString("filename") ?: "image.png")
        val bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
        if (bytes.size > 5 * 1024 * 1024) return call.reject("图片不能超过 5MB")

        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, "image/png")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/云轨社区")
            }
        }
        val uri = context.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
            ?: return call.reject("无法创建相册文件")
        context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
        call.resolve(JSObject().put("uri", uri.toString()))
    }

    @PluginMethod
    fun saveAs(call: PluginCall) {
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = call.getString("mime") ?: "application/octet-stream"
            putExtra(Intent.EXTRA_TITLE, safeName(call.getString("name") ?: "export.bin"))
        }
        startActivityForResult(call, intent, "onCreateDocument")
    }

    @ActivityCallback
    private fun onCreateDocument(call: PluginCall?, result: androidx.activity.result.ActivityResult) {
        if (call == null) return
        val uri = result.data?.data ?: return call.reject("用户取消")
        val bytes = android.util.Base64.decode(call.getString("base64") ?: "", android.util.Base64.DEFAULT)
        context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
        call.resolve(JSObject().put("uri", uri.toString()))
    }

    @PluginMethod
    fun shareFile(call: PluginCall) {
        val uri = Uri.parse(call.getString("uri") ?: return call.reject("缺少 uri"))
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = call.getString("mime") ?: "*/*"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "分享"))
        call.resolve()
    }

    @PluginMethod
    fun installApk(call: PluginCall) {
        val path = call.getString("path") ?: return call.reject("缺少 path")
        val file = File(path)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        call.resolve()
    }

    private fun safeName(raw: String): String =
        raw.substringAfterLast('/').substringAfterLast('\\').take(120).ifBlank { "file.bin" }
}
