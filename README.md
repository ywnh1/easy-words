# Easy Words

外研社高中英语词汇出题器。桌面（Windows）与 Android 双端，Tauri v2 + React + Rust。

内嵌词库，按 **书 / 单元 / 页码 / 首字母 / 词汇标记 / 单词或短语** 筛选，
可以「全取」或「随机抽 n 个」，结果按 **书后顺序 / 首字母 / 随机** 排列。
随机用的是可复现种子：预览里看到的就是导出时得到的那一批，点「换一批」才换词，
所以预览里给某个词设的提示不会在导出时落空。

四种出题形式：

- **四选 n** —— 从 英文 / 音标 / 中文 / 默写 四列里挑若干列，列顺序可拖动。
  例如「中文 + 默写」就是中译英，「英文 + 音标 + 默写」是英译中，
  四列全选就是单词表。**只有包含默写列时才生成答案页**，答案是英文 + 音标 + 中文。
- **句子默写** —— 从例句里挖掉目标词。提示方式五种：只挖空 / 中文 / 英文 / 音标 / 首字母，
  可以全局一键应用，也可以在预览里给某个词单独覆盖。答案页给出完整句子，目标词加粗并加下划线。
- **选词填空** —— 方框里给 N + M 个选项（N 个答案、M 个干扰），下面出 N 个句子，
  句子不带任何提示。答案页给出完整句子并凸显目标短语。
- **笔记模式** —— 英文 + 音标 + 多来源中文 + 例句，词典来源会标注（如「选自牛津」）。无答案页。

英文相同、中文不同的词会合并，所有中文一起显示。

### 中文释义来源

教材词条的释义有多个来源，界面上可以拖动排序决定优先级，前一个没有就取后一个：

1. 书后中文（教材词表）
2. 牛津高阶（英汉双解，`<defT><chn>` 里的释义）
3. 柯林斯 COBUILD
4. 牛津高阶英汉双解词典 —— 实际是同义词/反查词典，噪声较大，默认不启用
5. AI 翻译 —— **空占位**：还没有接任何服务，勾选也会被跳过、回退到下一个来源。
   要真正启用需要指定服务商与密钥。

「笔记模式」会把勾选的所有来源并列出来，每条都标来源。

## 词库现状

| 书 | 词条 | 扩充短语 |
| --- | --- | --- |
| 必修第一册 | 411 | 80 |
| 必修第二册 | 363 | 75 |
| 必修第三册 | 283 | 65 |
| 选择性必修第一册 | 266 | 58 |

「扩充短语」来自教材 Learning aid 页的 Key expressions 列。中文释义先查牛津高阶，
查不到的按教材语境自撰（`data/phrases/zh-oxford.tsv` / `zh-own.tsv`）。
与教材词表同名且同义的短语不会重复录入，义项确实不同的（如 `wind up` 上发条 / 以…告终）保留为补充。

词汇标记沿用教材印刷符号：无符号 = 必修单词，`*` = 不作要求，`□` = 选择性必修。
筛选面板里可以按这三类分别取词。

## 开发

```sh
pnpm install
pnpm tauri dev          # 桌面调试
pnpm build              # 只构建前端
pnpm typecheck          # tsc --noEmit
```

Rust 侧：

```sh
cd src-tauri
cargo test              # 词库查询 + 四种卷面的 PDF 冒烟测试
cargo check
```

### 纯前端预览（手机上直接看界面）

没有构建桌面/安卓客户端时，也可以打一个单文件 HTML，手机浏览器双击就能打开：

```sh
pnpm mock            # 从种子库导出精简数据 → src/lib/mock-data.ts
pnpm preview:build   # 单文件 → /storage/emulated/0/用户/易词预览/index.html
pnpm preview:verify  # 用 jsdom 真跑一遍，确认能渲染、按钮能点
```

这份预览用的是真实词库的一小部分（每本书 UNIT 1 前 48 条），筛选、排序、题型切换都能点，
但生成 PDF 需要真实后端，会提示不可用。正式安装包里不会带这份 mock 数据 ——
`src/lib/api.ts` 用动态 import，只在没有 Tauri 时才加载。

### 数据流水线

所有词库都是 TSV 源文件，编译成一个 SQLite 种子库：

```sh
.venv/bin/python scripts/build_db.py        # data/**/*.tsv → src-tauri/resources/seed.sqlite
```

- `data/books/<book_id>.tsv` —— 教材词表，7 列：`unit page word phonetic pos meaning marker`
- `data/phrases/<book_id>.tsv` —— 扩充短语，3 列：`unit phrase note`
- `data/examples/examples.tsv` —— 例句，5 列：`word unit en zh source`
- `data/phrases/zh-oxford.tsv`、`zh-own.tsv` —— 扩充短语中文释义，3 列：`phrase zh source`
- `data/senses/senses.tsv` —— 各词典抽出的中文释义，4 列：`word source pos zh`

重新生成例句与词典释义（要扫 mdict 词典，各约 2–5 分钟）：

```sh
.venv/bin/python scripts/extract_examples.py   # 例句
.venv/bin/python scripts/extract_senses.py     # 中文释义（牛津高阶/柯林斯/牛津双解）
```

重新生成 PDF 用的子集字体：

```sh
.venv/bin/python scripts/make_fonts.py
```

### 加一本新书（四六级、词典、别的教材）

1. 在 `scripts/build_db.py` 的 `BOOKS` 里加一条（`id` / `title` / `level` / `kind` / `sort_order`）
2. 放一个 `data/books/<id>.tsv`，可选 `data/phrases/<id>.tsv`
3. 跑 `scripts/build_db.py`

表结构不需要动，应用代码也不需要动 —— `catalog` 和 `query` 都是按 `book_id` 泛化的。

## 设计要点

- **为什么不用 JSON**：全部走 SQLite，启动时只拷贝一份种子库到应用数据目录，
  查询靠索引，内存占用与词库规模无关。
- **为什么 PDF 直接用 printpdf 而不是 Typst / Markdown**：
  Typst 当库用有 200+ 依赖，Android 交叉编译风险高、启动也是秒级；
  Markdown 还得再写一个渲染器。四种卷面都是强约束版式，直接画坐标代码最短、两端行为一致。
- **字体**：Noto Sans SC 子集管中文和拉丁，DejaVu Sans 只管 IPA 音标。
  Noto CJK 本身不含 `ɪ ʊ ɔ ɜ ʃ ʒ ŋ` 等音标字符，混排会出豆腐块，
  所以 `pdf.rs` 会把字符串切成「音标段 / 普通段」分别用对应字体绘制。
  两套字体合计约 5.8 MB，都编进二进制，不依赖系统字体。

## CI

`.github/workflows/build.yml`：

- `check` —— 前端 `tsc --noEmit` + `cargo test`
- `windows` —— NSIS + MSI 安装包，产物上传为 artifact；打 tag 时附到 draft release
- `android` —— 四个 ABI 的 release APK

### Android 签名

`src-tauri/keystore/easywords.jks`，别名 `easywords`，store/key 密码都是 `easy-words`。

这个密钥库是**明文提交在仓库里**的，方便 CI 直接签出可覆盖安装的 APK。
代价是任何拿到仓库的人都能给同包名的应用签名。如果你的用途需要更强的隔离，
把 `easywords.jks` 换成 GitHub Secret（base64）+ CI 里解码，再把仓库里的文件删掉。

## 目录

```
data/            词库源文件（TSV）
scripts/         数据流水线：抽例句、编译 SQLite、切字体子集
src/             React 界面
src-tauri/       Rust：db.rs（查询）/ pdf.rs（排版）/ lib.rs（命令）
  resources/     seed.sqlite（编译产物，随二进制内嵌）
  assets/fonts/  子集字体
  keystore/      Android 签名
```
