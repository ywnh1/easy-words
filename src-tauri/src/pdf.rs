//! PDF 排版。
//!
//! 为什么不用 Typst/Markdown 中转（曾经的备选方案）：
//!   * Typst 作为库有 200+ 依赖，Android 交叉编译风险高，启动也是秒级；
//!   * Markdown → PDF 还得自己再写一个渲染器，等于绕一圈回到这里；
//!   * 四种卷面都是强约束版式（默写横线、表格列宽、挖空位置），
//!     直接用 printpdf 画坐标，代码短、行为可预测、两端一致。
//!
//! 字体：Noto Sans SC 掌管中文和拉丁，DejaVu Sans 只负责 IPA 音标
//! （Noto CJK 不含 ɪ ʊ ɔ ɜ ʃ ʒ ŋ 等音标字符，混用会缺字）。

use owned_ttf_parser::AsFaceRef;
use printpdf::*;
use serde::Deserialize;
use std::io::BufWriter;

use crate::db::EntryView;

const PW: f32 = 210.0;
const PH: f32 = 297.0;
const ML: f32 = 17.0;
const MR: f32 = 17.0;
const MT: f32 = 16.0;
const MB: f32 = 15.0;
const CW: f32 = PW - ML - MR;

// 三套字体都是 TrueType。汉字用 Droid，拉丁和 IPA 用 DejaVu：
// 系统里没有既含汉字又含音标的字体，而 Noto Sans CJK 的 CFF 轮廓
// 经 printpdf 写出后字形会错位，所以不用它。
const ZH: &[u8] = include_bytes!("../assets/fonts/zh.ttf");
const LATIN: &[u8] = include_bytes!("../assets/fonts/latin.ttf");
const LATIN_BOLD: &[u8] = include_bytes!("../assets/fonts/latin-bold.ttf");

#[derive(Debug, Default, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    /// 四选 n：从 英文/音标/中文/默写 里选若干列排成表格
    #[default]
    Columns,
    /// 句子默写：例句挖空
    Sentence,
    /// 选词填空：n 个选项放进方框，n-m 个句子挖空
    Cloze,
    /// 笔记模式：英文 + 音标 + 中文（多来源）+ 例句
    Notes,
}

/// 表格里的一列。顺序由前端拖动决定。
#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Field {
    Word,
    Phonetic,
    Meaning,
    /// 留空的默写列
    Blank,
}

impl Field {
    fn label(self) -> &'static str {
        match self {
            Field::Word => "英文",
            Field::Phonetic => "音标",
            Field::Meaning => "中文",
            Field::Blank => "默写",
        }
    }

    /// 分列宽度的权重，中文列最宽
    fn weight(self) -> f32 {
        match self {
            Field::Word => 1.1,
            Field::Phonetic => 0.95,
            Field::Meaning => 1.7,
            Field::Blank => 1.0,
        }
    }
}

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Hint {
    /// 只挖空，没有任何提示
    None,
    /// 横线后给该词的中文
    Zh,
    /// 横线后给英文原形
    En,
    /// 横线后给音标
    Phonetic,
    /// 保留首字母
    Initial,
}

#[derive(Debug, Default, Deserialize)]
pub struct Spec {
    pub mode: Mode,
    /// Columns：表格列，顺序即显示顺序
    #[serde(default)]
    pub fields: Vec<Field>,
    /// Sentence：全局提示方式
    #[serde(default)]
    pub hint: Option<Hint>,
    /// Sentence：为单个词特殊指定的提示，键是小写词形
    #[serde(default)]
    pub overrides: std::collections::HashMap<String, Hint>,
    /// Cloze：选项总数 n
    #[serde(default)]
    pub pool: Option<usize>,
    /// Cloze：挖空个数 n-m
    #[serde(default)]
    pub blanks: Option<usize>,
    /// 中文释义来源优先级，越靠前越优先
    #[serde(default)]
    pub sense_sources: Vec<String>,
    /// 笔记模式的例句来源；空表示不附例句
    #[serde(default)]
    pub example_sources: Vec<String>,
    #[serde(default)]
    pub answer_key: bool,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub subtitle: Option<String>,
}

impl Spec {
    fn hint_for(&self, e: &EntryView) -> Hint {
        self.overrides
            .get(&e.word.to_lowercase())
            .copied()
            .or(self.hint)
            .unwrap_or(Hint::None)
    }
}

/// 按来源优先级挑一条中文释义；全都没有时退回教材释义。
pub fn pick_zh(e: &EntryView, sources: &[String]) -> String {
    if sources.is_empty() {
        return e.meaning.clone();
    }
    for src in sources {
        if src == "textbook" {
            if !e.meaning.is_empty() {
                return e.meaning.clone();
            }
            continue;
        }
        let hits: Vec<&str> = e
            .senses
            .iter()
            .filter(|s| &s.source == src && !s.zh.is_empty())
            .map(|s| s.zh.as_str())
            .collect();
        if !hits.is_empty() {
            let mut out = String::new();
            for (i, h) in hits.iter().enumerate() {
                if i > 0 {
                    out.push('；');
                }
                out.push_str(h);
            }
            return out;
        }
    }
    e.meaning.clone()
}

/// 笔记模式要列出多个来源，每个都带来源名。
pub fn pick_zh_all(e: &EntryView, sources: &[String]) -> Vec<(String, String)> {
    let order: Vec<String> = if sources.is_empty() {
        vec!["textbook".into()]
    } else {
        sources.to_vec()
    };
    let mut out = Vec::new();
    for src in &order {
        if src == "textbook" {
            if !e.meaning.is_empty() {
                out.push(("textbook".into(), e.meaning.clone()));
            }
            continue;
        }
        for s in e.senses.iter().filter(|s| &s.source == src && !s.zh.is_empty()) {
            out.push((src.clone(), s.zh.clone()));
        }
    }
    out
}

pub const SOURCE_LABEL: fn(&str) -> &'static str = |src| match src {
    "textbook" => "教材",
    "oxford_high" => "牛津高阶",
    "collins" => "柯林斯",
    "oxford_bilingual" => "牛津双解",
    "ai" => "AI 翻译",
    _ => "其他",
};

/// 用 ttf-parser 量字宽，避免为排版再加一套字体栈。
struct Metrics {
    face: owned_ttf_parser::OwnedFace,
    upem: f32,
}

impl Metrics {
    fn new(bytes: &[u8]) -> Self {
        let face = owned_ttf_parser::OwnedFace::from_vec(bytes.to_vec(), 0)
            .expect("内置字体必须能被解析");
        let upem = face.as_face_ref().units_per_em() as f32;
        Self { face, upem }
    }

    fn has(&self, c: char) -> bool {
        self.face.as_face_ref().glyph_index(c).is_some()
    }

    /// 返回毫米宽度。size 是 pt。
    fn width(&self, text: &str, size: f32) -> f32 {
        let f = self.face.as_face_ref();
        let mut units = 0.0f32;
        for c in text.chars() {
            match f.glyph_index(c).and_then(|g| f.glyph_hor_advance(g)) {
                Some(a) => units += a as f32,
                None => units += self.upem * if is_cjk(c) { 1.0 } else { 0.5 },
            }
        }
        units / self.upem * size * 25.4 / 72.0
    }
}

fn is_cjk(c: char) -> bool {
    matches!(c as u32, 0x3000..=0x9FFF | 0xF900..=0xFAFF | 0xFF00..=0xFFEF)
}

/// 一个字符该用哪套字体画。
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Face {
    Zh,
    Lat,
    LatBold,
}

pub struct Fonts {
    zh: IndirectFontRef,
    lat: IndirectFontRef,
    lat_bold: IndirectFontRef,
    m_zh: Metrics,
    m_lat: Metrics,
    m_lat_bold: Metrics,
}

impl Fonts {
    /// 拉丁字体覆盖 ASCII 和 IPA，优先用它；剩下的一律交给中文字体。
    fn face_for(&self, c: char, bold: bool) -> Face {
        let lat = if bold { &self.m_lat_bold } else { &self.m_lat };
        if lat.has(c) && !is_cjk(c) {
            if bold {
                Face::LatBold
            } else {
                Face::Lat
            }
        } else {
            Face::Zh
        }
    }

    fn font(&self, f: Face) -> &IndirectFontRef {
        match f {
            Face::Zh => &self.zh,
            Face::Lat => &self.lat,
            Face::LatBold => &self.lat_bold,
        }
    }

    fn metrics(&self, f: Face) -> &Metrics {
        match f {
            Face::Zh => &self.m_zh,
            Face::Lat => &self.m_lat,
            Face::LatBold => &self.m_lat_bold,
        }
    }
}

/// 一张纸。y 记录当前基线距页顶的距离（mm，向下增长）。
struct Sheet {
    doc: PdfDocumentReference,
    page: PdfPageIndex,
    layer: PdfLayerReference,
    fonts: Fonts,
    y: f32,
    page_no: u32,
    header: String,
}

impl Sheet {
    fn new(header: String) -> Result<Self, String> {
        let (doc, page, layer_idx) = PdfDocument::new(header.clone(), Mm(PW), Mm(PH), "Layer 1");
        let layer = doc.get_page(page).get_layer(layer_idx);
        // 子集化在 scripts/make_fonts.py 里做（只保留词库用到的字符），
        // 不用 printpdf 的 font_subsetting —— 它会让字形错位。
        let fonts = Fonts {
            zh: doc.add_external_font(ZH).map_err(|e| e.to_string())?,
            lat: doc.add_external_font(LATIN).map_err(|e| e.to_string())?,
            lat_bold: doc.add_external_font(LATIN_BOLD).map_err(|e| e.to_string())?,
            m_zh: Metrics::new(ZH),
            m_lat: Metrics::new(LATIN),
            m_lat_bold: Metrics::new(LATIN_BOLD),
        };
        let s = Sheet {
            doc,
            page,
            layer,
            fonts,
            y: MT,
            page_no: 1,
            header,
        };
        s.footer();
        Ok(s)
    }

    fn new_page(&mut self) -> Result<(), String> {
        let (p, l) = self.doc.add_page(Mm(PW), Mm(PH), "Layer 1");
        self.page = p;
        self.layer = self.doc.get_page(p).get_layer(l);
        self.page_no += 1;
        self.y = MT;
        self.footer();
        Ok(())
    }

    fn footer(&self) {
        let txt = format!("{} · 第 {} 页", self.header, self.page_no);
        let size = 8.0;
        let w = self.width(&txt, size, false);
        self.layer.set_fill_color(Color::Rgb(rgb(0.55, 0.55, 0.58)));
        // 走 text_at 才能让数字落到 DejaVu 上（中文字体没有拉丁数字）
        self.text_at(&txt, size, PW - MR - w, 9.0, false);
        self.measure_line(ML, ML + CW, PH - 12.5, 0.2, rgb(0.85, 0.85, 0.87));
        self.layer.set_fill_color(Color::Rgb(rgb(0.1, 0.1, 0.12)));
    }

    fn ensure(&mut self, h: f32) -> Result<(), String> {
        if self.y + h > PH - MB {
            self.new_page()?;
        }
        Ok(())
    }

    /// 把字符串按"该由哪套字体画"切成若干段。
    fn runs<'a>(&self, text: &'a str, bold: bool) -> Vec<(Face, &'a str)> {
        let mut out: Vec<(Face, &str)> = Vec::new();
        let mut start = 0usize;
        let mut cur: Option<Face> = None;
        for (i, c) in text.char_indices() {
            let f = self.fonts.face_for(c, bold);
            match cur {
                None => cur = Some(f),
                Some(prev) if prev != f => {
                    out.push((prev, &text[start..i]));
                    start = i;
                    cur = Some(f);
                }
                _ => {}
            }
        }
        if let (Some(f), true) = (cur, start < text.len()) {
            out.push((f, &text[start..]));
        }
        if out.is_empty() {
            out.push((Face::Zh, ""));
        }
        out
    }

    /// 在指定基线上画一段富文本，逐字选字体。
    fn text_at(&self, text: &str, size: f32, x: f32, baseline: f32, bold: bool) {
        let mut cx = x;
        for (face, seg) in self.runs(text, bold) {
            self.layer
                .use_text(seg, size, Mm(cx), Mm(PH - baseline), self.fonts.font(face));
            cx += self.fonts.metrics(face).width(seg, size);
        }
    }

    fn width(&self, text: &str, size: f32, bold: bool) -> f32 {
        self.runs(text, bold)
            .into_iter()
            .map(|(face, seg)| self.fonts.metrics(face).width(seg, size))
            .sum()
    }

    fn measure_line(&self, x1: f32, x2: f32, y: f32, thick: f32, color: Rgb) {
        self.layer.set_outline_color(Color::Rgb(color));
        self.layer.set_outline_thickness(thick);
        self.layer.add_line(printpdf::Line {
            points: vec![
                (Point::new(Mm(x1), Mm(PH - y)), false),
                (Point::new(Mm(x2), Mm(PH - y)), false),
            ],
            is_closed: false,
        });
    }

    /// 自动换行，返回行列表。
    fn wrap(&self, text: &str, size: f32, max_w: f32, bold: bool) -> Vec<String> {
        let mut lines: Vec<String> = Vec::new();
        for para in text.split('\n') {
            let mut cur = String::new();
            let mut cur_w = 0.0f32;
            for unit in units(para) {
                let w = self.width(&unit, size, bold);
                if cur_w + w > max_w && !cur.trim_end().is_empty() {
                    lines.push(cur.trim_end().to_string());
                    cur = String::new();
                    cur_w = 0.0;
                    if unit.trim().is_empty() {
                        continue;
                    }
                }
                cur.push_str(&unit);
                cur_w += w;
            }
            lines.push(cur.trim_end().to_string());
        }
        lines
    }
}

fn rgb(r: f32, g: f32, b: f32) -> Rgb {
    Rgb {
        r,
        g,
        b,
        icc_profile: None,
    }
}

/// 切分成排版单元：中文逐字，拉丁按词，音标整段。
fn units(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    for c in text.chars() {
        if is_cjk(c) || (c.is_ascii_punctuation() && c != '/' && c != '\'' && c != '-') {
            if !cur.is_empty() {
                out.push(std::mem::take(&mut cur));
            }
            out.push(c.to_string());
        } else if c == ' ' {
            if !cur.is_empty() {
                out.push(std::mem::take(&mut cur));
            }
            out.push(" ".to_string());
        } else {
            cur.push(c);
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

// ---------------------------------------------------------------- 卷面生成
// ---------------------------------------------------------------- 卷面生成

pub fn render(entries: &[EntryView], spec: &Spec) -> Result<Vec<u8>, String> {
    let title = spec
        .title
        .clone()
        .unwrap_or_else(|| title_of(spec.mode).to_string());
    let mut s = Sheet::new(title.clone())?;
    header_block(&mut s, &title, spec)?;

    // 选词填空的选项与题目只洗一次牌，答案页沿用同一组下标，
    // 否则两边各自随机，答案与题号就对不上了
    let mut cloze_pick: Option<(Vec<usize>, Vec<usize>)> = None;

    match spec.mode {
        Mode::Columns => render_columns(&mut s, entries, spec)?,
        Mode::Sentence => render_sentences(&mut s, entries, spec)?,
        Mode::Cloze => {
            let pick = pick_cloze(entries, spec);
            render_cloze(&mut s, entries, &pick)?;
            cloze_pick = Some(pick);
        }
        Mode::Notes => render_notes(&mut s, entries, spec)?,
    }

    // 答案规则：Columns 只有存在默写列时才给答案；笔记模式永远没有答案
    if spec.answer_key && has_answer(spec) {
        s.new_page()?;
        s.y = MT + 2.0;
        s.text_at(&format!("{title} · 参考答案"), 15.0, ML, s.y, true);
        s.y += 10.0;
        match spec.mode {
            Mode::Columns => answer_columns(&mut s, entries, spec)?,
            Mode::Sentence => answer_sentences(&mut s, entries, spec)?,
            Mode::Cloze => {
                if let Some((_, items)) = &cloze_pick {
                    answer_cloze(&mut s, entries, items)?;
                }
            }
            Mode::Notes => {}
        }
    }

    let mut buf = Vec::new();
    s.doc
        .save(&mut BufWriter::new(&mut buf))
        .map_err(|e| e.to_string())?;
    Ok(buf)
}

fn title_of(m: Mode) -> &'static str {
    match m {
        Mode::Columns => "词汇默写",
        Mode::Sentence => "句子默写",
        Mode::Cloze => "选词填空",
        Mode::Notes => "词汇笔记",
    }
}

fn has_answer(spec: &Spec) -> bool {
    match spec.mode {
        Mode::Columns => spec.fields.contains(&Field::Blank),
        Mode::Sentence | Mode::Cloze => true,
        Mode::Notes => false,
    }
}

fn header_block(s: &mut Sheet, title: &str, spec: &Spec) -> Result<(), String> {
    s.text_at(title, 17.0, ML, s.y, true);
    s.y += 7.5;
    if let Some(sub) = &spec.subtitle {
        if !sub.is_empty() {
            s.layer.set_fill_color(Color::Rgb(rgb(0.42, 0.42, 0.46)));
            for line in s.wrap(sub, 9.0, CW, false) {
                s.text_at(&line, 9.0, ML, s.y, false);
                s.y += 4.4;
            }
            s.layer.set_fill_color(Color::Rgb(rgb(0.1, 0.1, 0.12)));
        }
    }
    // 姓名 / 班级横线
    s.measure_line(ML, ML + CW, s.y + 2.0, 0.3, rgb(0.6, 0.6, 0.64));
    s.y += 9.0;
    Ok(())
}

const SIZE: f32 = 11.0;

// ---------------------------------------------------------------- 四选 n

fn render_columns(s: &mut Sheet, entries: &[EntryView], spec: &Spec) -> Result<(), String> {
    let fields: Vec<Field> = if spec.fields.is_empty() {
        vec![Field::Word, Field::Phonetic, Field::Meaning, Field::Blank]
    } else {
        spec.fields.clone()
    };
    let total_w: f32 = fields.iter().map(|f| f.weight()).sum();
    let widths: Vec<f32> = fields.iter().map(|f| f.weight() / total_w * CW).collect();

    let row = 8.2;
    let draw_head = |s: &mut Sheet| -> Result<(), String> {
        s.ensure(row * 2.0)?;
        let y = s.y;
        s.measure_line(ML, ML + CW, y, 0.5, rgb(0.25, 0.25, 0.3));
        let mut x = ML;
        for (f, w) in fields.iter().zip(&widths) {
            s.text_at(f.label(), 9.5, x + 1.6, y + 5.6, true);
            x += w;
        }
        s.measure_line(ML, ML + CW, y + 7.0, 0.4, rgb(0.25, 0.25, 0.3));
        s.y = y + row;
        Ok(())
    };
    draw_head(s)?;

    for e in entries.iter() {
        let zh = pick_zh(e, &spec.sense_sources);
        // 中文可能很长，按列宽算行数
        let mut lines: usize = 1;
        for (f, w) in fields.iter().zip(&widths) {
            let text = match f {
                Field::Meaning => zh.as_str(),
                Field::Word => e.word.as_str(),
                Field::Phonetic => e.phonetic.as_str(),
                Field::Blank => "",
            };
            if !text.is_empty() {
                lines = lines.max(s.wrap(text, 9.5, w - 3.0, false).len());
            }
        }
        let h = row * lines as f32;
        if s.y + h > PH - MB {
            s.new_page()?;
            draw_head(s)?;
        }
        let y = s.y;

        // 竖线
        let mut x = ML;
        s.measure_line(x, x, y - 0.2, 0.3, rgb(0.72, 0.72, 0.76));
        for w in &widths {
            x += w;
            s.measure_line(x, x, y - 0.2, 0.3, rgb(0.72, 0.72, 0.76));
        }

        let mut cx = ML;
        for (f, w) in fields.iter().zip(&widths) {
            let text = match f {
                Field::Meaning => zh.as_str(),
                Field::Word => e.word.as_str(),
                Field::Phonetic => e.phonetic.as_str(),
                Field::Blank => "",
            };
            if !text.is_empty() {
                let mut yy = y + 5.4;
                for line in s.wrap(text, 9.5, w - 3.0, false) {
                    s.text_at(&line, 9.5, cx + 1.6, yy, false);
                    yy += 4.6;
                }
            }
            cx += w;
        }
        s.y = y + h;
        s.measure_line(ML, ML + CW, s.y, 0.25, rgb(0.86, 0.86, 0.88));
    }
    Ok(())
}

/// 有默写列时，答案是四选三：英文 + 音标 + 中文。
fn answer_columns(s: &mut Sheet, entries: &[EntryView], spec: &Spec) -> Result<(), String> {
    for (i, e) in entries.iter().enumerate() {
        let zh = pick_zh(e, &spec.sense_sources);
        let mut text = e.word.clone();
        if !e.phonetic.is_empty() {
            text.push(' ');
            text.push_str(&e.phonetic);
        }
        if !zh.is_empty() {
            text.push(' ');
            text.push_str(&zh);
        }
        let lines = s.wrap(&format!("{}. {text}", i + 1), 9.5, CW, false);
        s.ensure(lines.len() as f32 * 5.0 + 1.0)?;
        for line in &lines {
            s.text_at(line, 9.5, ML, s.y, false);
            s.y += 5.0;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------- 句子默写

/// 把字符串按目标区间切成 (是否高亮, 片段)，用于答案页的凸显。
fn split_at_target<'a>(text: &'a str, target: (usize, usize)) -> Vec<(bool, &'a str)> {
    let (start, len) = target;
    let end = start + len;
    let mut out = Vec::new();
    if start > 0 {
        out.push((false, &text[..start]));
    }
    out.push((true, &text[start..end]));
    if end < text.len() {
        out.push((false, &text[end..]));
    }
    out
}

/// 带高亮标记的换行：返回每行的若干段。
fn wrap_marks(
    s: &Sheet,
    parts: &[(bool, &str)],
    size: f32,
    max_w: f32,
) -> Vec<Vec<(bool, String)>> {
    let mut lines: Vec<Vec<(bool, String)>> = vec![Vec::new()];
    let mut cur_w = 0.0f32;
    for (hl, part) in parts {
        for unit in units(part) {
            let w = s.width(&unit, size, false);
            if cur_w + w > max_w && cur_w > 0.0 {
                lines.push(Vec::new());
                cur_w = 0.0;
                if unit.trim().is_empty() {
                    continue;
                }
            }
            let line = lines.last_mut().unwrap();
            // 状态相同的相邻段合并，少画几次
            match line.last_mut() {
                Some((h, text)) if *h == *hl => text.push_str(&unit),
                _ => line.push((*hl, unit)),
            }
            cur_w += w;
        }
    }
    lines
}

/// 画一行带高亮的文字：高亮段加粗并加下划线。
fn draw_marked_line(s: &Sheet, parts: &[(bool, String)], size: f32, x: f32, y: f32) {
    let mut cx = x;
    for (hl, text) in parts {
        if text.is_empty() {
            continue;
        }
        let w = s.width(text, size, *hl);
        s.text_at(text, size, cx, y, *hl);
        if *hl {
            s.measure_line(cx, cx + w, y + 1.4, 0.4, rgb(0.15, 0.32, 0.72));
        }
        cx += w;
    }
}

/// 释义自带的括号在提示里没有信息量，出现就会变成【（…）】，一并去掉。
fn strip_parens(s: &str) -> String {
    s.chars()
        .filter(|c| !matches!(c, '（' | '）' | '(' | ')'))
        .collect::<String>()
        .trim()
        .to_string()
}

/// 提示文字统一用【】，彻底避开释义里自带的（），不再出现嵌套括号。
fn hint_mark(h: Hint, e: &EntryView, sources: &[String]) -> String {
    match h {
        Hint::None | Hint::Initial => String::new(),
        Hint::Zh => {
            let zh = pick_zh(e, sources);
            let first = strip_parens(zh.split('；').next().unwrap_or(""));
            if first.is_empty() {
                String::new()
            } else {
                format!("【{first}】")
            }
        }
        Hint::En => format!("【{}】", e.word),
        Hint::Phonetic => {
            if e.phonetic.is_empty() {
                String::new()
            } else {
                format!("【{}】", e.phonetic)
            }
        }
    }
}

fn blank_of(word: &str, hint: Hint) -> String {
    if hint != Hint::Initial {
        return "_".repeat(12);
    }
    // 首字母模式：保留首字母，其余按原词长度换成下划线（空格保留）
    let mut out = String::new();
    for (i, c) in word.chars().enumerate() {
        if i == 0 || c == ' ' {
            out.push(c);
        } else {
            out.push('_');
        }
    }
    out
}

/// 把目标词从例句里挖掉，提示放在横线后面。
fn fill_blank(
    sentence: &str,
    word: &str,
    blank: &str,
    mark: &str,
) -> Option<(String, (usize, usize))> {
    let low = sentence.to_lowercase();
    let target = word.to_lowercase();
    let (start, len) = find_target(&low, &target)?;
    let replaced = format!("{}{}{}", &sentence[..start], blank, &sentence[start + len..]);
    let idx = start + blank.len();
    let marked = format!("{}{}{}", &replaced[..idx], mark, &replaced[idx..]);
    Some((marked, (start, len)))
}

/// 允许词形变化：优先整词，其次词干前缀。
fn find_target(haystack: &str, needle: &str) -> Option<(usize, usize)> {
    fn bounded(h: &str, at: usize, len: usize) -> bool {
        let before = h[..at].chars().next_back();
        let after = h[at + len..].chars().next();
        !before.map(|c| c.is_alphabetic()).unwrap_or(false)
            && !after.map(|c| c.is_alphabetic()).unwrap_or(false)
    }

    let mut from = 0;
    while let Some(p) = haystack[from..].find(needle) {
        let at = from + p;
        if bounded(haystack, at, needle.len()) {
            return Some((at, needle.len()));
        }
        from = at + 1;
    }
    // 词形变化：mood → moods / moody，取前 4 个字母匹配
    let stem: String = needle.chars().take(4).collect();
    if stem.len() >= 3 {
        let mut from = 0;
        while let Some(p) = haystack[from..].find(&stem) {
            let at = from + p;
            let end = haystack[at..]
                .char_indices()
                .find(|(_, c)| !c.is_alphabetic())
                .map(|(i, _)| at + i)
                .unwrap_or(haystack.len());
            if at == 0 || !haystack[..at].ends_with(|c: char| c.is_alphabetic()) {
                return Some((at, end - at));
            }
            from = at + 1;
        }
    }
    None
}

/// 每个词条取第一条例句，并挖空；返回 (题面, 原句, 原句中的目标区间)
fn sentence_item(e: &EntryView, hint: Hint, sources: &[String]) -> Option<(String, String, (usize, usize))> {
    let en = e.examples.first()?.en.clone();
    let mark = hint_mark(hint, e, sources);
    let (shown, range) = fill_blank(&en, &e.word, &blank_of(&e.word, hint), &mark)?;
    Some((shown, en, range))
}

fn render_sentences(s: &mut Sheet, entries: &[EntryView], spec: &Spec) -> Result<(), String> {
    let mut items = Vec::new();
    for e in entries.iter() {
        if let Some((shown, en, range)) = sentence_item(e, spec.hint_for(e), &spec.sense_sources) {
            items.push((shown, en, range));
        }
    }
    for (n, (shown, _en, _range)) in items.iter().enumerate() {
        let lines = s.wrap(shown, SIZE, CW - 8.0, false);
        let need = lines.len() as f32 * 6.0 + 4.0;
        s.ensure(need)?;
        let y = s.y;
        s.text_at(&format!("{}.", n + 1), SIZE, ML, y, false);
        let mut yy = y;
        for line in &lines {
            s.text_at(line, SIZE, ML + 7.0, yy, false);
            yy += 6.0;
        }
        s.y = y + need;
    }
    Ok(())
}

fn answer_sentences(s: &mut Sheet, entries: &[EntryView], spec: &Spec) -> Result<(), String> {
    let mut n = 0usize;
    for e in entries.iter() {
        let Some((_shown, en, range)) = sentence_item(e, spec.hint_for(e), &spec.sense_sources)
        else {
            continue;
        };
        n += 1;
        draw_answer_sentence(s, n, &en, range, &e.word)?;
    }
    Ok(())
}

/// 答案里的完整句子：目标词加粗 + 下划线，换行也保持。
fn draw_answer_sentence(
    s: &mut Sheet,
    n: usize,
    en: &str,
    range: (usize, usize),
    _word: &str,
) -> Result<(), String> {
    let parts = split_at_target(en, range);
    let lines = wrap_marks(s, &parts, 9.5, CW - 8.0);
    let need = lines.len() as f32 * 5.4 + 1.5;
    s.ensure(need)?;
    let y = s.y;
    s.text_at(&format!("{n}."), 9.5, ML, y, false);
    let mut yy = y;
    for line in &lines {
        draw_marked_line(s, line, 9.5, ML + 7.0, yy);
        yy += 5.4;
    }
    s.y = y + need;
    Ok(())
}

// ---------------------------------------------------------------- 选词填空

/// 选出 (选项下标, 题目下标)：候选必须有例句，题目是候选项的子集，
/// 这样每个空的答案都一定在方框里。
fn pick_cloze(entries: &[EntryView], spec: &Spec) -> (Vec<usize>, Vec<usize>) {
    let pool = spec.pool.unwrap_or(8).max(2);
    let blanks = spec.blanks.unwrap_or(6).clamp(1, pool);

    let mut candidates: Vec<usize> = entries
        .iter()
        .enumerate()
        .filter(|(_, e)| !e.examples.is_empty())
        .map(|(i, _)| i)
        .take(pool)
        .collect();

    let mut options = candidates.clone();
    shuffle_slice(&mut options);

    candidates.truncate(blanks);
    shuffle_slice(&mut candidates);
    (options, candidates)
}

fn render_cloze(
    s: &mut Sheet,
    entries: &[EntryView],
    pick: &(Vec<usize>, Vec<usize>),
) -> Result<(), String> {
    let (options, items) = pick;
    if options.is_empty() || items.is_empty() {
        return Ok(());
    }

    // 方框
    let box_lines = wrap_options(s, entries, options);
    let box_h = 6.0 + box_lines.len() as f32 * 6.4;
    s.ensure(box_h + 8.0)?;
    let top = s.y;
    s.measure_line(ML, ML + CW, top, 0.4, rgb(0.35, 0.35, 0.42));
    s.measure_line(ML, ML + CW, top + box_h, 0.4, rgb(0.35, 0.35, 0.42));
    s.measure_line(ML, ML, top, 0.4, rgb(0.35, 0.35, 0.42));
    s.measure_line(ML, ML, top + box_h, 0.4, rgb(0.35, 0.35, 0.42));
    s.measure_line(ML + CW, ML + CW, top, 0.4, rgb(0.35, 0.35, 0.42));
    s.measure_line(ML + CW, ML + CW, top + box_h, 0.4, rgb(0.35, 0.35, 0.42));
    let mut yy = top + 6.0;
    for line in &box_lines {
        s.text_at(line, 10.0, ML + 4.0, yy, false);
        yy += 6.4;
    }
    s.y = top + box_h + 8.0;

    for (n, idx) in items.iter().enumerate() {
        let e = &entries[*idx];
        let Some(en) = e.examples.first().map(|x| x.en.clone()) else {
            continue;
        };
        // 选词填空的句子不给任何提示，只有空
        let Some((shown, _)) = fill_blank(&en, &e.word, &"_".repeat(12), "") else {
            continue;
        };
        let lines = s.wrap(&shown, SIZE, CW - 8.0, false);
        let need = lines.len() as f32 * 6.4 + 4.0;
        s.ensure(need)?;
        let y = s.y;
        s.text_at(&format!("{}.", n + 1), SIZE, ML, y, false);
        let mut ly = y;
        for line in &lines {
            s.text_at(line, SIZE, ML + 7.0, ly, false);
            ly += 6.4;
        }
        s.y = y + need;
    }
    Ok(())
}

/// 选项排成若干行，每行尽量放满。
fn wrap_options(s: &Sheet, entries: &[EntryView], options: &[usize]) -> Vec<String> {
    let mut lines = Vec::new();
    let mut cur = String::new();
    let mut cur_w = 0.0f32;
    for (i, idx) in options.iter().enumerate() {
        let tag = label_of(i);
        let item = format!("{tag}. {}    ", entries[*idx].word);
        let w = s.width(&item, 10.0, false);
        if cur_w + w > CW - 8.0 && !cur.is_empty() {
            lines.push(cur.trim_end().to_string());
            cur = String::new();
            cur_w = 0.0;
        }
        cur.push_str(&item);
        cur_w += w;
    }
    if !cur.trim().is_empty() {
        lines.push(cur.trim_end().to_string());
    }
    lines
}

fn label_of(i: usize) -> String {
    let c = (b'A' + (i % 26) as u8) as char;
    c.to_string()
}

fn answer_cloze(
    s: &mut Sheet,
    entries: &[EntryView],
    items: &[usize],
) -> Result<(), String> {
    let mut n = 0usize;
    for idx in items {
        let e = &entries[*idx];
        let Some(en) = e.examples.first().map(|x| x.en.clone()) else {
            continue;
        };
        let Some(range) = find_target(&en.to_lowercase(), &e.word.to_lowercase()) else {
            continue;
        };
        n += 1;
        draw_answer_sentence(s, n, &en, range, &e.word)?;
    }
    Ok(())
}

// ---------------------------------------------------------------- 笔记模式

fn render_notes(s: &mut Sheet, entries: &[EntryView], spec: &Spec) -> Result<(), String> {
    for e in entries.iter() {
        // 首行：英文 + 音标（短语没有音标）
        let mut head = e.word.clone();
        if !e.phonetic.is_empty() {
            head.push_str("  ");
            head.push_str(&e.phonetic);
        }
        if !e.pos.is_empty() {
            head.push_str("  ");
            head.push_str(&e.pos);
        }
        let head_lines = s.wrap(&head, 12.0, CW, true);
        s.ensure(head_lines.len() as f32 * 6.6 + 4.0)?;
        for line in &head_lines {
            s.text_at(line, 12.0, ML, s.y, true);
            s.y += 6.6;
        }

        // 中文：可能多个来源，逐条标注
        let senses = pick_zh_all(e, &spec.sense_sources);
        for (src, zh) in &senses {
            let text = if senses.len() == 1 {
                format!("　{zh}")
            } else {
                format!("　{}：{zh}", SOURCE_LABEL(src))
            };
            for line in s.wrap(&text, 10.0, CW - 4.0, false) {
                s.ensure(6.0)?;
                s.text_at(&line, 10.0, ML, s.y, false);
                s.y += 5.4;
            }
        }

        // 例句：按来源筛选，标注出处
        for ex in &e.examples {
            if !spec.example_sources.is_empty()
                && !spec.example_sources.iter().any(|s| s == &ex.source)
            {
                continue;
            }
            let mut line_text = format!("　例 {}", ex.en);
            for part in s.wrap(&line_text, 9.5, CW - 6.0, false) {
                s.ensure(5.6)?;
                s.text_at(&part, 9.5, ML, s.y, false);
                s.y += 5.0;
            }
            line_text.clear();
            // 译文与出处放同一行，出处用括号收在末尾，避免换行后孤零零掉到下一行
            let full = match (ex.zh.is_empty(), ex.label.is_empty()) {
                (true, true) => String::new(),
                (false, true) => format!("　　{}", ex.zh),
                (true, false) => format!("　　（{}）", ex.label),
                (false, false) => format!("　　{}（{}）", ex.zh, ex.label),
            };
            if !full.trim().is_empty() {
                s.layer.set_fill_color(Color::Rgb(rgb(0.45, 0.45, 0.5)));
                for part in s.wrap(&full, 9.0, CW - 6.0, false) {
                    s.ensure(5.4)?;
                    s.text_at(&part, 9.0, ML, s.y, false);
                    s.y += 4.8;
                }
                s.layer.set_fill_color(Color::Rgb(rgb(0.1, 0.1, 0.12)));
            }
        }
        s.y += 3.0;
    }
    Ok(())
}

// ---------------------------------------------------------------- 工具

fn shuffle_slice<T>(v: &mut [T]) {
    let mut seed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0x9E3779B97F4A7C15)
        | 1;
    for i in (1..v.len()).rev() {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        let j = (seed % (i as u64 + 1)) as usize;
        v.swap(i, j);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{Example, Sense};

    fn e(word: &str, meaning: &str, phonetic: &str, ex: &str) -> EntryView {
        EntryView {
            word: word.into(),
            phonetic: phonetic.into(),
            pos: String::new(),
            meaning: meaning.into(),
            is_phrase: phonetic.is_empty(),
            marker: "none".into(),
            book: "测试".into(),
            unit_no: 1,
            page: Some(1),
            examples: if ex.is_empty() {
                vec![]
            } else {
                vec![Example {
                    en: ex.into(),
                    zh: "例句译文".into(),
                    source: "oxford".into(),
                    label: "选自牛津".into(),
                }]
            },
            senses: vec![
                Sense {
                    source: "textbook".into(),
                    pos: String::new(),
                    zh: meaning.into(),
                },
                Sense {
                    source: "oxford_high".into(),
                    pos: String::new(),
                    zh: format!("{meaning}（词典）"),
                },
            ],
        }
    }

    fn base(mode: Mode) -> Spec {
        Spec {
            mode,
            fields: vec![],
            hint: Some(Hint::Zh),
            overrides: Default::default(),
            pool: None,
            blanks: None,
            sense_sources: vec![],
            example_sources: vec![],
            answer_key: true,
            title: None,
            subtitle: Some("测试卷".into()),
        }
    }

    /// 字体分派：汉字走中文字体，拉丁和音标走 DejaVu。
    #[test]
    fn font_faces_split_by_glyph() {
        let (doc, _, _) = PdfDocument::new("t", Mm(PW), Mm(PH), "L");
        let fonts = Fonts {
            zh: doc.add_external_font(ZH).unwrap(),
            lat: doc.add_external_font(LATIN).unwrap(),
            lat_bold: doc.add_external_font(LATIN_BOLD).unwrap(),
            m_zh: Metrics::new(ZH),
            m_lat: Metrics::new(LATIN),
            m_lat_bold: Metrics::new(LATIN_BOLD),
        };
        assert_eq!(fonts.face_for('心', false), Face::Zh);
        assert_eq!(fonts.face_for('m', false), Face::Lat);
        assert_eq!(fonts.face_for('m', true), Face::LatBold);
        for c in "ɜːˈʃŋəɪʊɔ".chars() {
            assert_eq!(fonts.face_for(c, false), Face::Lat, "{c} 应走 DejaVu");
        }
        assert!(fonts.m_zh.has('印'));
        assert!(fonts.m_lat.has('ˈ'));
    }

    /// 提示必须用【】，这样释义自带（）时也不会嵌套。
    #[test]
    fn hint_never_nests_parentheses() {
        let item = e("wind up", "给（机械）上发条", "", "");
        let mark = hint_mark(Hint::Zh, &item, &[]);
        assert!(mark.starts_with('【') && mark.ends_with('】'), "{mark}");
        assert!(!mark.contains("（【"), "{mark}");
        let (shown, _, _) = sentence_item(
            &e("wind up", "给（机械）上发条", "", "He began to wind up the clock."),
            Hint::Zh,
            &[],
        )
        .unwrap();
        // 释义自带的括号被清掉，提示只剩【】一种括号
        assert!(shown.contains("【给机械上发条】"), "{shown}");
        assert!(!shown.contains("（"), "提示里不该再有圆括号：{shown}");
    }

    #[test]
    fn blank_handles_inflection() {
        let (shown, _, _) = sentence_item(
            &e("smile", "微笑", "", "She was smiling at me."),
            Hint::None,
            &[],
        )
        .unwrap();
        assert!(shown.starts_with("She was ____________"), "{shown}");
    }

    /// 各来源按优先级取第一个有值的。
    #[test]
    fn picks_first_available_source() {
        let item = e("mood", "心情", "/muːd/", "");
        assert_eq!(pick_zh(&item, &[]), "心情");
        assert_eq!(pick_zh(&item, &["collins".into(), "textbook".into()]), "心情");
        assert_eq!(
            pick_zh(&item, &["collins".into(), "oxford_high".into()]),
            "心情（词典）"
        );
    }

    /// 四选 n：只有含默写列时才出答案。
    #[test]
    fn columns_answer_only_when_blank_present() {
        let with_blank = Spec {
            fields: vec![Field::Word, Field::Blank],
            ..base(Mode::Columns)
        };
        assert!(has_answer(&with_blank));
        let no_blank = Spec {
            fields: vec![Field::Word, Field::Meaning],
            ..base(Mode::Columns)
        };
        assert!(!has_answer(&no_blank));
        // 笔记模式永远没有答案
        assert!(!has_answer(&base(Mode::Notes)));
    }

    #[test]
    fn all_modes_render_real_pdf() {
        let entries = vec![
            e("mood", "心情", "/muːd/", "Her mood improved at once."),
            e(
                "amusement park",
                "游乐场",
                "",
                "We went to the amusement park on Sunday.",
            ),
            e("smile", "微笑", "/smaɪl/", "She was smiling at me."),
            e("campus", "校园", "/ˈkæmpəs/", "The campus is very large."),
        ];

        let mut columns = base(Mode::Columns);
        columns.fields = vec![Field::Word, Field::Phonetic, Field::Meaning, Field::Blank];
        let mut sentence = base(Mode::Sentence);
        sentence.hint = Some(Hint::Initial);
        let mut cloze = base(Mode::Cloze);
        cloze.pool = Some(4);
        cloze.blanks = Some(3);
        let mut notes = base(Mode::Notes);
        notes.sense_sources = vec!["textbook".into(), "oxford_high".into()];
        notes.example_sources = vec!["oxford".into()];

        for spec in [columns, sentence, cloze, notes] {
            let bytes = render(&entries, &spec).expect("生成失败");
            assert!(bytes.starts_with(b"%PDF"), "{:?} 不是 PDF", spec.mode);
            assert!(bytes.len() > 2000, "{:?} 太小：{}", spec.mode, bytes.len());
        }
    }
}
