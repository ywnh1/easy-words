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
 * 拒绝应用往公共 Download 目录直接写，MediaStore 是官方给的正路，
 * 而且写完后系统里确实能看到这个文件。
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

            val resolver = activity.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, args.fileName)
                put(MediaStore.Downloads.MIME_TYPE, args.mime)
                // 放进子目录，免得和用户的其它下载混在一起
                put(
                    MediaStore.Downloads.RELATIVE_PATH,
                    Environment.DIRECTORY_DOWNLOADS + "/" + folder
                )
                put(MediaStore.Downloads.IS_PENDING, 1)
            }

            val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                MediaStore.Downloads.EXTERNAL_CONTENT_URI
            } else {
                // API 24-28 没有 Downloads 集合，退回媒体库的通用 Files
                @Suppress("DEPRECATION")
                MediaStore.Files.getContentUri("external")
            }

            val uri: Uri = resolver.insert(collection, values)
                ?: run {
                    invoke.reject("系统拒绝创建文件")
                    return
                }

            try {
                resolver.openOutputStream(uri)?.use { out ->
                    src.inputStream().use { it.copyTo(out) }
                } ?: run {
                    resolver.delete(uri, null, null)
                    invoke.reject("无法写入目标文件")
                    return
                }
            } catch (e: Exception) {
                resolver.delete(uri, null, null)
                throw e
            }

            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, values, null, null)

            val result = JSObject()
            // 给用户看的路径。Android 不允许应用拿到真实的公共路径，
            // 但「下载/Easy Words/文件名」这个说法用户能照着找到。
            result.put(
                "displayPath",
                "Download/$folder/${args.fileName}"
            )
            result.put("uri", uri.toString())
            invoke.resolve(result)
        } catch (ex: Exception) {
            invoke.reject(ex.message ?: "保存失败")
        }
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
