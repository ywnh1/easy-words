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

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    /// 中译英：给中文默英文，不给音标
    Cn2En,
    /// 英译中：给英文默中文，给音标
    En2Cn,
    /// 单词表：英文 · 音标 · 中文 · 默写空列
    Table,
    /// 句子默写：例句挖空
    Blank,
}

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Hint {
    None,
    /// 横线后括号里给中文
    Zh,
    /// 横线后括号里给英文
    En,
    /// 首字母
    Initial,
}

#[derive(Debug, Deserialize)]
pub struct Spec {
    pub kind: Kind,
    #[serde(default)]
    pub hint: Option<Hint>,
    #[serde(default)]
    pub answer_key: bool,
    #[serde(default)]
    pub title: Option<String>,
    /// 卷头副标题，例如「外研社 必修第一册 · UNIT 1–3」
    #[serde(default)]
    pub subtitle: Option<String>,
}

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

pub fn render(entries: &[EntryView], spec: &Spec) -> Result<Vec<u8>, String> {
    let title = spec
        .title
        .clone()
        .unwrap_or_else(|| title_of(spec.kind).to_string());
    let mut s = Sheet::new(title.clone())?;

    s.y = MT + 2.0;
    s.text_at(&title, 17.0, ML, s.y, true);
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
    // 姓名 / 班级条
    s.measure_line(ML, ML + CW, s.y + 2.0, 0.3, rgb(0.6, 0.6, 0.64));
    s.y += 9.0;

    match spec.kind {
        Kind::Cn2En => render_cn2en(&mut s, entries)?,
        Kind::En2Cn => render_en2cn(&mut s, entries)?,
        Kind::Table => render_table(&mut s, entries)?,
        Kind::Blank => render_blank(&mut s, entries, spec.hint.unwrap_or(Hint::None))?,
    }

    if spec.answer_key {
        s.new_page()?;
        s.y = MT + 2.0;
        s.text_at(&format!("{title} · 参考答案"), 15.0, ML, s.y, true);
        s.y += 10.0;
        render_key(&mut s, entries, spec.kind)?;
    }

    let mut buf = Vec::new();
    s.doc
        .save(&mut BufWriter::new(&mut buf))
        .map_err(|e| e.to_string())?;
    Ok(buf)
}

fn title_of(k: Kind) -> &'static str {
    match k {
        Kind::Cn2En => "中译英默写",
        Kind::En2Cn => "英译中默写",
        Kind::Table => "单词表",
        Kind::Blank => "句子默写",
    }
}

const SIZE: f32 = 11.0;
const ROW: f32 = 12.5;

fn render_cn2en(s: &mut Sheet, entries: &[EntryView]) -> Result<(), String> {
    for (i, e) in entries.iter().enumerate() {
        let lines = s.wrap(&e.meaning, SIZE, CW * 0.62, false);
        s.ensure(ROW * lines.len() as f32 + 2.0)?;
        let start = s.y;
        let num = format!("{}.", i + 1);
        s.text_at(&num, SIZE, ML, start, false);
        let mut y = start;
        for (n, line) in lines.iter().enumerate() {
            s.text_at(line, SIZE, ML + 7.0, y, false);
            if n == 0 {
                // 默写横线：从释义右侧拉到右边距
                let w = s.width(line, SIZE, false);
                let x1 = (ML + 7.0 + w + 4.0).min(ML + CW - 40.0);
                s.measure_line(x1, ML + CW, y + 1.6, 0.3, rgb(0.62, 0.62, 0.66));
            }
            y += 5.2;
        }
        s.y = start + ROW * lines.len() as f32;
    }
    Ok(())
}

fn render_en2cn(s: &mut Sheet, entries: &[EntryView]) -> Result<(), String> {
    for (i, e) in entries.iter().enumerate() {
        let head = if e.phonetic.is_empty() {
            e.word.clone()
        } else {
            format!("{} {}", e.word, e.phonetic)
        };
        let head_w = s.width(&head, SIZE, true);
        let head_max = CW * 0.55;
        s.ensure(ROW)?;
        let y = s.y;
        s.text_at(&format!("{}.", i + 1), SIZE, ML, y, false);
        let lines = s.wrap(&head, SIZE, head_max, true);
        let mut yy = y;
        for line in &lines {
            s.text_at(line, SIZE, ML + 7.0, yy, true);
            yy += 5.2;
        }
        let x1 = (ML + 7.0 + head_w.min(head_max) + 4.0).min(ML + CW - 50.0);
        s.measure_line(x1, ML + CW, y + 1.6, 0.3, rgb(0.62, 0.62, 0.66));
        s.y = y + ROW;
    }
    Ok(())
}

/// 列宽（mm），总和等于版心宽 176
const TABLE_COLS: [(f32, &str); 4] = [
    (46.0, "英文"),
    (34.0, "音标"),
    (62.0, "中文"),
    (34.0, "默写"),
];

fn render_table(s: &mut Sheet, entries: &[EntryView]) -> Result<(), String> {
    let row = 8.2;
    let draw_head = |s: &mut Sheet| -> Result<(), String> {
        s.ensure(row * 2.0)?;
        let y = s.y;
        s.measure_line(ML, ML + CW, y, 0.5, rgb(0.25, 0.25, 0.3));
        let mut x = ML;
        for (w, name) in TABLE_COLS {
            s.text_at(name, 9.5, x + 1.6, y + 5.6, true);
            x += w;
        }
        s.measure_line(ML, ML + CW, y + 7.0, 0.4, rgb(0.25, 0.25, 0.3));
        s.y = y + row;
        Ok(())
    };
    draw_head(s)?;

    for e in entries.iter() {
        // 中文可能很长，按列宽算行数
        let zh_lines = s.wrap(&e.meaning, 9.5, TABLE_COLS[2].0 - 3.0, false);
        let h = (row * zh_lines.len() as f32).max(row);
        if s.y + h > PH - MB {
            s.new_page()?;
            draw_head(s)?;
        }
        let y = s.y;
        // 竖线
        let mut x = ML;
        s.measure_line(x, x, y - 0.2, 0.3, rgb(0.72, 0.72, 0.76));
        for (w, _) in TABLE_COLS {
            x += w;
            s.measure_line(x, x, y - 0.2, 0.3, rgb(0.72, 0.72, 0.76));
        }
        s.text_at(&e.word, 9.5, ML + 1.6, y + 5.4, false);
        if !e.phonetic.is_empty() {
            s.text_at(&e.phonetic, 9.0, ML + TABLE_COLS[0].0 + 1.6, y + 5.4, false);
        }
        let mut yy = y + 5.4;
        for line in &zh_lines {
            s.text_at(line, 9.5, ML + TABLE_COLS[0].0 + TABLE_COLS[1].0 + 1.6, yy, false);
            yy += 4.6;
        }
        s.y = y + h;
        s.measure_line(ML, ML + CW, s.y, 0.25, rgb(0.86, 0.86, 0.88));
    }
    Ok(())
}

fn hint_text(e: &EntryView, hint: Hint) -> Option<String> {
    match hint {
        Hint::None | Hint::Initial => None,
        Hint::Zh => {
            let first = e.meaning.split('；').next().unwrap_or("").trim().to_string();
            if first.is_empty() {
                None
            } else {
                Some(first)
            }
        }
        Hint::En => Some(e.word.clone()),
    }
}

/// 提示已经自带括号时就换个包裹方式，避免出现「（（…））」。
fn wrap_hint(h: &str) -> String {
    if h.starts_with('（') || h.starts_with('(') {
        format!(" [{h}] ")
    } else {
        format!("（{h}）")
    }
}

fn blank_of(e: &EntryView, hint: Hint) -> String {
    if hint != Hint::Initial {
        return "_".repeat(12);
    }
    // 首字母模式：保留首字母，其余按原词长度换成下划线（空格保留）
    let mut out = String::new();
    for (i, c) in e.word.chars().enumerate() {
        if i == 0 || c == ' ' {
            out.push(c);
        } else {
            out.push('_');
        }
    }
    out
}

fn render_blank(s: &mut Sheet, entries: &[EntryView], hint: Hint) -> Result<(), String> {
    // 先筛出真正能挖空的句子，再连续编号 —— 否则匹配失败的词会让题号跳号
    let mut items: Vec<(usize, String)> = Vec::new();
    for (idx, e) in entries.iter().enumerate() {
        let Some(sentence) = e.examples.first().map(|x| x.en.as_str()) else {
            continue;
        };
        if let Some(filled) =
            fill_blank(sentence, &e.word, &blank_of(e, hint), hint_text(e, hint))
        {
            items.push((idx, filled));
        }
    }
    for (n, (idx, filled)) in items.iter().enumerate() {
        let e = &entries[*idx];
        let _ = e;
        let lines = s.wrap(filled, SIZE, CW - 8.0, false);
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

/// 把目标词从例句里挖掉，提示统一放在横线后面。
fn fill_blank(sentence: &str, word: &str, blank: &str, hint: Option<String>) -> Option<String> {
    let low = sentence.to_lowercase();
    let target = word.to_lowercase();
    let (start, len) = find_target(&low, &target)?;
    let replaced = format!("{}{}{}", &sentence[..start], blank, &sentence[start + len..]);
    Some(match hint {
        Some(h) if !h.is_empty() => {
            // 提示统一放在横线后面
            let idx = start + blank.len();
            format!("{}{}{}", &replaced[..idx], wrap_hint(&h), &replaced[idx..])
        }
        _ => replaced,
    })
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

fn render_key(s: &mut Sheet, entries: &[EntryView], kind: Kind) -> Result<(), String> {
    let mut n = 0usize;
    for (i, e) in entries.iter().enumerate() {
        let text = match kind {
            Kind::Cn2En => {
                if e.phonetic.is_empty() {
                    e.word.clone()
                } else {
                    format!("{} {}", e.word, e.phonetic)
                }
            }
            Kind::En2Cn => format!("{}  {}", e.word, e.meaning),
            Kind::Table => continue,
            Kind::Blank => match e.examples.first() {
                // 与正文一致：只给能真正挖空的那条例句
                Some(x) if fill_blank(&x.en, &e.word, "_", None).is_some() => x.en.clone(),
                _ => continue,
            },
        };
        let _ = i;
        n += 1;
        let lines = s.wrap(&format!("{n}. {text}"), 9.5, CW, false);
        s.ensure(lines.len() as f32 * 5.0 + 1.0)?;
        for line in &lines {
            s.text_at(line, 9.5, ML, s.y, false);
            s.y += 5.0;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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
                vec![crate::db::Example {
                    en: ex.into(),
                    zh: String::new(),
                    source: "own".into(),
                    label: String::new(),
                }]
            },
        }
    }

    /// 字体分派：汉字走中文字体，拉丁和音标走 DejaVu。
    #[test]
    fn font_faces_split_by_glyph() {
        let fonts = {
            let (doc, _, _) = PdfDocument::new("t", Mm(PW), Mm(PH), "L");
            Fonts {
                zh: doc.add_external_font(ZH).unwrap(),
                lat: doc.add_external_font(LATIN).unwrap(),
                lat_bold: doc.add_external_font(LATIN_BOLD).unwrap(),
                m_zh: Metrics::new(ZH),
                m_lat: Metrics::new(LATIN),
                m_lat_bold: Metrics::new(LATIN_BOLD),
            }
        };
        assert_eq!(fonts.face_for('心', false), Face::Zh);
        assert_eq!(fonts.face_for('m', false), Face::Lat);
        assert_eq!(fonts.face_for('m', true), Face::LatBold);
        // 音标字符必须在拉丁字体里，否则会变成豆腐块
        for c in "ɜːˈʃŋəɪʊɔ".chars() {
            assert_eq!(fonts.face_for(c, false), Face::Lat, "{c} 应走 DejaVu");
        }
        // 汉字字体必须真的含汉字，否则整页空白
        assert!(fonts.m_zh.has('印'));
        assert!(fonts.m_lat.has('ˈ'));
    }

    #[test]
    fn blank_inserts_hint_after_line() {
        let got = fill_blank("With butterflies in my stomach, I walked in.", "butterflies", "____________", Some("紧张".into())).unwrap();
        assert!(got.contains("____________（紧张）"), "{got}");
        assert!(!got.contains("butterflies"), "{got}");
    }

    #[test]
    fn blank_handles_inflection() {
        let got = fill_blank("She was smiling at me.", "smile", "______", None);
        let got = got.expect("应能匹配 smile → smiling");
        assert!(got.starts_with("She was ______"), "{got}");
    }

    #[test]
    fn all_kinds_render_real_pdf() {
        let entries = vec![
            e("mood", "心情", "/muːd/", "Her mood improved at once."),
            e("amusement park", "游乐场", "", "We went to the amusement park on Sunday."),
        ];
        for kind in [Kind::Cn2En, Kind::En2Cn, Kind::Table, Kind::Blank] {
            let spec = Spec {
                kind,
                hint: Some(Hint::Zh),
                answer_key: true,
                title: None,
                subtitle: Some("测试卷".into()),
            };
            let bytes = render(&entries, &spec).expect("生成失败");
            assert!(bytes.starts_with(b"%PDF"), "{kind:?} 不是 PDF");
            assert!(bytes.len() > 2000, "{kind:?} 太小：{}", bytes.len());
        }
    }
}
