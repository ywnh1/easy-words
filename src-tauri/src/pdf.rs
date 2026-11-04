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
use std::io::BufWriter;

use crate::db::EntryView;
use crate::content::{
    blank_of, has_answer, hint_mark, label_of, pick_zh, pick_zh_all, plan_cloze,
    sentence_item, spec_seed, split_at_target, title_of, ClozePlan, Field, Hint, Mode, Spec,
    SOURCE_LABEL,
};

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

    // 选词填空的选项与题目只规划一次，答案页沿用同一份方案，
    // 否则两边各自随机，答案与题号就对不上
    let mut cloze_plan: Option<ClozePlan> = None;

    match spec.mode {
        Mode::Columns => render_columns(&mut s, entries, spec)?,
        Mode::Sentence => render_sentences(&mut s, entries, spec)?,
        Mode::Cloze => {
            let plan = plan_cloze(entries, spec);
            render_cloze(&mut s, entries, &plan)?;
            cloze_plan = Some(plan);
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
                if let Some(plan) = &cloze_plan {
                    answer_cloze(&mut s, entries, plan)?;
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

fn render_sentences(s: &mut Sheet, entries: &[EntryView], spec: &Spec) -> Result<(), String> {
    let seed = spec_seed(spec);
    let mut items = Vec::new();
    for e in entries.iter() {
        if let Some(item) = sentence_item(e, spec.hint_for(e), &spec.sense_sources, seed) {
            items.push(item);
        }
    }
    for (n, item) in items.iter().enumerate() {
        let shown = &item.shown;
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
    // 必须和题面用同一个种子，否则答案页给的是另一句
    let seed = spec_seed(spec);
    let mut n = 0usize;
    for e in entries.iter() {
        let Some(item) = sentence_item(e, spec.hint_for(e), &spec.sense_sources, seed) else {
            continue;
        };
        n += 1;
        draw_answer_sentence(s, n, &item.original, item.range, &e.word)?;
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

fn render_cloze(s: &mut Sheet, entries: &[EntryView], plan: &ClozePlan) -> Result<(), String> {
    let options = &plan.options;
    let items = &plan.items;
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

    // 句子已在 plan 里准备好，题面与答案共用，不再各自取第一条例句
    for (n, item) in items.iter().enumerate() {
        let shown = &item.sentence.shown;
        let lines = s.wrap(shown, SIZE, CW - 8.0, false);
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

fn answer_cloze(s: &mut Sheet, entries: &[EntryView], plan: &ClozePlan) -> Result<(), String> {
    let mut n = 0usize;
    for item in &plan.items {
        let e = &entries[item.entry];
        n += 1;
        draw_answer_sentence(s, n, &item.sentence.original, item.sentence.range, &e.word)?;
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
            seed: 1,
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
        let item = sentence_item(
            &e("wind up", "给（机械）上发条", "", "He began to wind up the clock."),
            Hint::Zh,
            &[],
            1,
        )
        .unwrap();
        let shown = item.shown;
        // 释义自带的括号被清掉，提示只剩【】一种括号
        assert!(shown.contains("【给机械上发条】"), "{shown}");
        assert!(!shown.contains("（"), "提示里不该再有圆括号：{shown}");
    }

    #[test]
    fn blank_handles_inflection() {
        let item = sentence_item(
            &e("smile", "微笑", "", "She was smiling at me."),
            Hint::None,
            &[],
            1,
        )
        .unwrap();
        let shown = item.shown;
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

    /// 从生成的 PDF 字节里数页数。
    ///
    /// 答案规则的验收点就在这里：TODO 要求「四选 n 只有含默写列才出答案」、
    /// 「笔记模式没有答案」。只看 has_answer 这个布尔不够 —— 得确认 PDF
    /// 真的没多出一页。用 lopdf（printpdf 的底座）读回页数最直接。
    fn page_count(bytes: &[u8]) -> usize {
        let doc = printpdf::lopdf::Document::load_mem(bytes).expect("PDF 应能读回");
        doc.get_pages().len()
    }

    fn entry_with_example(word: &str, meaning: &str, phonetic: &str, ex: &str) -> EntryView {
        e(word, meaning, phonetic, ex)
    }

    #[test]
    fn notes_never_emit_answer_page() {
        let entries = vec![
            entry_with_example("mood", "心情", "/muːd/", "Her mood improved at once."),
            entry_with_example("smile", "微笑", "/smaɪl/", "She was smiling at me."),
        ];
        let mut spec = base(Mode::Notes);
        spec.answer_key = true; // 即便前端勾了，笔记模式也不该出答案页
        let alone = page_count(&render(&entries, &spec).unwrap());

        spec.answer_key = false;
        let without = page_count(&render(&entries, &spec).unwrap());

        assert_eq!(alone, without, "笔记模式不该因为 answer_key 多出一页");
    }

    #[test]
    fn columns_answer_page_only_with_blank_field() {
        let entries = vec![entry_with_example(
            "mood",
            "心情",
            "/muːd/",
            "Her mood improved at once.",
        )];

        // 无默写列：不应有答案页
        let no_blank = Spec {
            fields: vec![Field::Word, Field::Meaning],
            answer_key: true,
            ..base(Mode::Columns)
        };
        let a = page_count(&render(&entries, &no_blank).unwrap());

        let no_blank_no_key = Spec {
            answer_key: false,
            ..no_blank.clone()
        };
        let b = page_count(&render(&entries, &no_blank_no_key).unwrap());
        assert_eq!(a, b, "没有默写列时不该生成答案页");

        // 有默写列：必须多出答案页
        let with_blank = Spec {
            fields: vec![Field::Word, Field::Meaning, Field::Blank],
            answer_key: true,
            ..base(Mode::Columns)
        };
        let c = page_count(&render(&entries, &with_blank).unwrap());
        assert_eq!(c, a + 1, "有默写列且勾选答案时应恰好多一页");
    }

    #[test]
    fn sentence_and_cloze_always_have_answer_page() {
        let entries = vec![
            entry_with_example("mood", "心情", "/muːd/", "Her mood improved at once."),
            entry_with_example("smile", "微笑", "/smaɪl/", "She was smiling at me."),
            entry_with_example("campus", "校园", "/ˈkæmpəs/", "The campus is very large."),
        ];
        for mode in [Mode::Sentence, Mode::Cloze] {
            let mut on = base(mode);
            on.answer_key = true;
            if mode == Mode::Cloze {
                on.pool = Some(3);
                on.blanks = Some(2);
            }
            let mut off = on.clone();
            off.answer_key = false;
            let with = page_count(&render(&entries, &on).unwrap());
            let without = page_count(&render(&entries, &off).unwrap());
            assert!(with > without, "{mode:?} 勾选答案后应多出页面");
        }
    }

    /// 列顺序必须真的影响输出：同样的列换个顺序，PDF 内容不该一样。
    #[test]
    fn column_order_changes_output() {
        let entries = vec![entry_with_example(
            "mood",
            "心情",
            "/muːd/",
            "Her mood improved at once.",
        )];
        let a = Spec {
            fields: vec![Field::Meaning, Field::Blank],
            answer_key: false,
            ..base(Mode::Columns)
        };
        let b = Spec {
            fields: vec![Field::Blank, Field::Meaning],
            ..a.clone()
        };
        let pa = render(&entries, &a).unwrap();
        let pb = render(&entries, &b).unwrap();
        assert_ne!(pa, pb, "调换列顺序后版面应发生变化");
    }

    /// 选词填空的数量关系：方框里 N+M 个选项，下面 N 个句子，
    /// 且每个句子考的词一定在选项里（否则这题无解）。
    #[test]
    fn cloze_pool_and_subset() {
        let entries: Vec<EntryView> = (0..10)
            .map(|i| {
                entry_with_example(
                    &format!("word{i}"),
                    "释义",
                    "/wɜːd/",
                    &format!("This is word{i} in a sentence."),
                )
            })
            .collect();

        for (pool, blanks) in [(8, 6), (5, 5), (4, 1), (10, 3)] {
            let spec = Spec {
                mode: Mode::Cloze,
                pool: Some(pool),
                blanks: Some(blanks),
                answer_key: false,
                ..Default::default()
            };
            let plan = plan_cloze(&entries, &spec);
            assert_eq!(plan.options.len(), pool, "选项数应为 pool");
            assert_eq!(plan.items.len(), blanks, "句子数应为 blanks");
            // 每题考的词必须出现在选项里
            for item in &plan.items {
                assert!(
                    plan.options.contains(&item.entry),
                    "第 {} 条是题目但不在选项里：{:?}",
                    item.entry,
                    plan.options
                );
            }
            // 选项不能有重复
            let uniq: std::collections::HashSet<_> = plan.options.iter().collect();
            assert_eq!(uniq.len(), plan.options.len(), "选项有重复");
        }
    }

    /// 没有例句的词不能进选词填空（否则出不了题）。
    #[test]
    fn cloze_skips_entries_without_examples() {
        let entries = vec![
            entry_with_example("mood", "心情", "/muːd/", ""),   // 无例句
            entry_with_example("smile", "微笑", "/smaɪl/", "She was smiling at me."),
            entry_with_example("campus", "校园", "/ˈkæmpəs/", "The campus is large."),
        ];
        let spec = Spec {
            mode: Mode::Cloze,
            pool: Some(3),
            blanks: Some(2),
            ..Default::default()
        };
        let plan = plan_cloze(&entries, &spec);
        assert!(!plan.options.contains(&0), "无例句的条目不该出现在选项里");
        assert!(
            !plan.items.iter().any(|i| i.entry == 0),
            "无例句的条目不该成为题目"
        );
        assert_eq!(plan.options.len(), 2);
        assert_eq!(plan.items.len(), 2);
    }

    /// 选词填空要出的句子数必须和用户设定的完全一致。
    ///
    /// 之前的 bug：pick_cloze 只判断 examples 是否为空，但有些词
    /// 在例句里根本找不到目标词（短语变体、词形变化超出规则），
    /// 渲染时被 continue 跳过，于是题号断号、题量比设定少。
    #[test]
    fn cloze_item_count_matches_request() {
        // 第 2 条例句里没有 "ghost"，挖空必然失败，必须被排除在外
        let entries = vec![
            entry_with_example("mood", "心情", "/muːd/", "Her mood improved."),
            entry_with_example("ghost", "幽灵", "/ɡəʊst/", "Nothing was there."),
            entry_with_example("smile", "微笑", "/smaɪl/", "She was smiling at me."),
            entry_with_example("campus", "校园", "/ˈkæmpəs/", "The campus is large."),
            entry_with_example("senior", "年长的", "/ˈsiːniə/", "He is a senior teacher."),
        ];

        for want in 1..=4usize {
            for pool in want..=5usize {
                let spec = Spec {
                    mode: Mode::Cloze,
                    pool: Some(pool),
                    blanks: Some(want),
                    seed: 7,
                    ..Default::default()
                };
                let plan = plan_cloze(&entries, &spec);
                assert_eq!(
                    plan.items.len(),
                    want,
                    "要 {want} 句却只准备了 {} 句（pool={pool}）",
                    plan.items.len()
                );
                // 每一句都必须真的挖了空
                for item in &plan.items {
                    assert!(
                        item.sentence.shown.contains("____"),
                        "句子没有空：{}",
                        item.sentence.shown
                    );
                }
                assert!(
                    !plan.options.contains(&1),
                    "挖不了空的词不该进选项"
                );
            }
        }
    }

    /// 同一个种子必须选出同一批词和同一句例句，
    /// 否则预览里看到的和导出的不是一份卷子。
    #[test]
    fn cloze_plan_is_reproducible() {
        let entries: Vec<EntryView> = (0..10)
            .map(|i| {
                entry_with_example(
                    &format!("word{i}"),
                    "释义",
                    "/wɜːd/",
                    &format!("This is word{i} in a sentence."),
                )
            })
            .collect();
        let spec = Spec {
            mode: Mode::Cloze,
            pool: Some(6),
            blanks: Some(4),
            seed: 42,
            ..Default::default()
        };
        let a = plan_cloze(&entries, &spec);
        let b = plan_cloze(&entries, &spec);
        assert_eq!(a.options, b.options);
        let sa: Vec<&str> = a.items.iter().map(|i| i.sentence.shown.as_str()).collect();
        let sb: Vec<&str> = b.items.iter().map(|i| i.sentence.shown.as_str()).collect();
        assert_eq!(sa, sb);
    }

    /// 一个词有多条例句时，不同种子应该选到不同的句子。
    #[test]
    fn sentence_picks_vary_by_seed() {
        use crate::db::Example;
        let mut item = e("mood", "心情", "/muːd/", "Her mood improved.");
        item.examples = vec![
            Example {
                en: "Her mood improved.".into(),
                zh: String::new(),
                source: "own".into(),
                label: String::new(),
            },
            Example {
                en: "The mood in the room was tense.".into(),
                zh: String::new(),
                source: "own".into(),
                label: String::new(),
            },
            Example {
                en: "I am in no mood for jokes.".into(),
                zh: String::new(),
                source: "own".into(),
                label: String::new(),
            },
        ];

        let mut picked = std::collections::HashSet::new();
        for seed in 0..30u64 {
            let it = sentence_item(&item, Hint::None, &[], seed).unwrap();
            picked.insert(it.original);
        }
        assert!(
            picked.len() >= 2,
            "不同种子总是选中同一句：{picked:?}"
        );
    }

    /// 笔记模式要把勾选的来源都列出来，并带上来源名。
    #[test]
    fn notes_lists_all_selected_sources() {
        let item = e("mood", "心情", "/muːd/", "Her mood improved.");
        let got = pick_zh_all(
            &item,
            &["textbook".into(), "oxford_high".into(), "collins".into()],
        );
        let sources: Vec<&str> = got.iter().map(|(s, _)| s.as_str()).collect();
        assert!(sources.contains(&"textbook"), "{sources:?}");
        assert!(sources.contains(&"oxford_high"), "{sources:?}");
        // 教材释义与词典释义都要出现，而不是只留一个
        assert!(got.len() >= 2, "应列出多个来源：{got:?}");
        // 来源名可读
        assert_eq!(SOURCE_LABEL("oxford_high"), "牛津高阶");
        assert_eq!(SOURCE_LABEL("collins"), "柯林斯");
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
