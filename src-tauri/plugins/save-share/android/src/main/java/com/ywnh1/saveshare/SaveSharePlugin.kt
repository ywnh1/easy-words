package com.ywnh1.saveshare

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
class SaveFileArgs {
    lateinit var path: String
    lateinit var fileName: String
    lateinit var mime: String
}

@InvokeArg
class ShareArgs {
    lateinit var uri: String
    lateinit var mime: String
    var title: String? = null
}

/**
 * 导出文件的落地与分享。
 *
 * 用 MediaStore 而不是直接写路径：Android 10+ 的 scoped storage 会
 * 拒绝应用往公共 Download 目录直接写，MediaStore 是官方给的正路。
 *
 * 注意 API 差异（minSdk 是 24）：
 *   - API 29+：MediaStore.Downloads + RELATIVE_PATH + IS_PENDING
 *   - API 24-28：Downloads 这个类还不存在，只能走外部存储目录直接写，
 *     再用 MediaScanner 通知媒体库
 * 直接引用 MediaStore.Downloads.* 在旧版本上会崩，所以必须分版本。
 */
@TauriPlugin
class SaveSharePlugin(private val activity: Activity) : Plugin(activity) {

    /** 子目录名，和桌面端保持一致 */
    private val folder = "Easy Words"

    @Command
    fun saveFile(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SaveFileArgs::class.java)
            val src = File(args.path)
            if (!src.exists()) {
                invoke.reject("源文件不存在：${args.path}")
                return
            }

            val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                writeModern(src, args)
            } else {
                writeLegacy(src, args)
            }

            val result = JSObject()
            result.put("displayPath", "Download/$folder/${args.fileName}")
            result.put("uri", uri.toString())
            invoke.resolve(result)
        } catch (ex: Exception) {
            invoke.reject(ex.message ?: "保存失败")
        }
    }

    /** API 29+：MediaStore.Downloads + RELATIVE_PATH，不需要任何权限 */
    private fun writeModern(src: File, args: SaveFileArgs): Uri {
        val resolver = activity.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, args.fileName)
            put(MediaStore.Downloads.MIME_TYPE, args.mime)
            put(
                MediaStore.Downloads.RELATIVE_PATH,
                Environment.DIRECTORY_DOWNLOADS + "/" + folder
            )
            put(MediaStore.Downloads.IS_PENDING, 1)
        }

        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: throw IllegalStateException("系统拒绝创建文件")

        try {
            resolver.openOutputStream(uri)?.use { out ->
                src.inputStream().use { it.copyTo(out) }
            } ?: throw IllegalStateException("无法写入目标文件")
        } catch (e: Exception) {
            resolver.delete(uri, null, null)
            throw e
        }

        values.clear()
        values.put(MediaStore.Downloads.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
        return uri
    }

    /** API 24-28：没有 Downloads 集合，直接写公共下载目录 */
    @Suppress("DEPRECATION")
    private fun writeLegacy(src: File, args: SaveFileArgs): Uri {
        // 老系统写公共目录需要这个权限。没给就说清楚，而不是抛个看不懂的 IO 异常。
        if (activity.checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
            != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            throw SecurityException("需要存储权限才能保存到下载目录，请在系统设置里授予")
        }

        val dir = File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
            folder
        )
        if (!dir.exists() && !dir.mkdirs()) {
            throw IllegalStateException("无法创建目录 ${dir.absolutePath}")
        }

        // 同名文件加序号，免得连着导出两次时后一次把前一次顶掉
        var target = File(dir, args.fileName)
        val base = args.fileName.substringBeforeLast('.')
        val ext = args.fileName.substringAfterLast('.', "")
        var i = 1
        while (target.exists()) {
            target = File(dir, "$base($i).$ext")
            i++
        }

        src.inputStream().use { input ->
            target.outputStream().use { output -> input.copyTo(output) }
        }

        // 让媒体库知道有新文件，否则文件管理器里要重启才看得到
        android.media.MediaScannerConnection.scanFile(
            activity, arrayOf(target.absolutePath), arrayOf(args.mime), null
        )
        return Uri.fromFile(target)
    }

    @Command
    fun open(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(ShareArgs::class.java)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(Uri.parse(args.uri), args.mime)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(intent)
            invoke.resolve()
        } catch (ex: Exception) {
            invoke.reject(ex.message ?: "没有能打开这种文件的应用")
        }
    }

    @Command
    fun share(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(ShareArgs::class.java)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = args.mime
                putExtra(Intent.EXTRA_STREAM, Uri.parse(args.uri))
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val chooser = Intent.createChooser(intent, args.title ?: "分享")
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.startActivity(chooser)
            invoke.resolve()
        } catch (ex: Exception) {
            invoke.reject(ex.message ?: "无法调起分享")
        }
    }
}
