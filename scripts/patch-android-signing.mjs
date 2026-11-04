#!/usr/bin/env node
/**
 * 给 Tauri 生成的 Android 工程注入 release 签名配置。
 *
 * Tauri v2 的 app/build.gradle.kts 模板里没有 signingConfigs，
 * 光放一个 keystore.properties 是没人读的 —— release APK 会是未签名的。
 * 这里在 `android {` 之后插入 signingConfigs，并把 release 的
 * signingConfig 指过去。
 *
 * gen/android 是每次 `tauri android init` 现生成的，所以必须在 init 之后跑。
 *
 * 用法：node scripts/patch-android-signing.mjs <gen/android 目录>
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const genDir = process.argv[2] || "src-tauri/gen/android";
const gradlePath = path.join(genDir, "app/build.gradle.kts");

if (!existsSync(gradlePath)) {
  console.error(`找不到 ${gradlePath}，先跑 tauri android init`);
  process.exit(1);
}

let src = await readFile(gradlePath, "utf8");

const MARK = "// easy-words: release 签名（由 scripts/patch-android-signing.mjs 注入）";
if (src.includes(MARK)) {
  console.log("已经注入过，跳过");
  process.exit(0);
}

// 1) 在 android { 之后插入 signingConfigs
const anchor = /android\s*\{\n/;
if (!anchor.test(src)) {
  console.error("build.gradle.kts 里找不到 `android {`，模板可能变了");
  process.exit(1);
}

const signingBlock = `${MARK}
    signingConfigs {
        create("release") {
            val ks = rootProject.file("keystore.properties")
            if (ks.exists()) {
                val props = Properties().apply { ks.inputStream().use { load(it) } }
                storeFile = file(props.getProperty("storeFile"))
                storePassword = props.getProperty("storePassword")
                keyAlias = props.getProperty("keyAlias")
                keyPassword = props.getProperty("keyPassword")
            }
        }
    }
`;

src = src.replace(anchor, (m) => m + signingBlock);

// 2) 让 release 构建用这个签名
const releaseRE = /(getByName\("release"\)\s*\{)/;
if (!releaseRE.test(src)) {
  console.error("找不到 release buildType，模板可能变了");
  process.exit(1);
}
src = src.replace(
  releaseRE,
  `$1\n            signingConfig = signingConfigs.getByName("release")`,
);

await writeFile(gradlePath, src, "utf8");

// 校验：两处都改到了
const after = await readFile(gradlePath, "utf8");
const checks = [
  ["signingConfigs", after.includes("signingConfigs {")],
  ["release 引用", after.includes('signingConfig = signingConfigs.getByName("release")')],
  ["keystore.properties", after.includes('rootProject.file("keystore.properties")')],
];
const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error("注入后校验失败：", failed.map(([n]) => n).join(", "));
  process.exit(1);
}

console.log(`✓ 已注入 release 签名配置 → ${gradlePath}`);
