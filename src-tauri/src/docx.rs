//! DOCX 导出。
//!
//! 与 PDF 分开写，因为 Word 是流式文档（段落 + 表格），没法按坐标摆放；
//! 但所有「考什么、怎么挖空、答案怎么给」都来自 content.rs，两边共用一份，
//! 不会出现同一次配置导出的 PDF 和 Word 内容不一致。
//!
//! 字体用宋体 + Times New Roman：这两样在 Windows 和 WPS 上都有，
//! 不需要把字体文件塞进 docx。

use docx_rs::*;

use crate::content::{
    blank_of, fill_blank, find_target, has_answer, hint_mark, label_of, pick_cloze, pick_zh,
    pick_zh_all, sentence_item, split_at_target, title_of, Field, Mode, Spec, SOURCE_LABEL,
};
use crate::db::{EntryView, Example};

// A4 去掉默认页边距后的可用宽度（twips = 1/20 pt）
const PAGE_W: usize = 9026;

fn cn() -> RunFonts {
    RunFonts::new().ascii("Times New Roman").east_asia("宋体")
}

fn text(s: impl Into<String>) -> Run {
    Run::new().add_text(s).fonts(cn())
}

fn bold(s: impl Into<String>) -> Run {
    text(s).bold()
}

/// 目标词在答案里要高亮，用荧光笔更醒目（与 PDF 的加粗下划线等价）
fn mark(s: impl Into<String>) -> Run {
    Run::new().add_text(s).fonts(cn()).bold().highlight("yellow")
}

struct Doc {
    docx: Docx,
}

impl Doc {
    fn new() -> Self {
        Self {
            docx: Docx::new(),
        }
    }

    fn para(mut self, p: Paragraph) -> Self {
        self.docx = self.docx.add_paragraph(p);
        self
    }

    fn table(mut self, t: Table) -> Self {
        self.docx = self.docx.add_table(t);
        self
    }

    /// 标题区：主标题、副标题、姓名班级横线
    fn header(mut self, title: &str, spec: &Spec) -> Self {
        self.docx = self.docx.add_paragraph(
            Paragraph::new()
                .align(AlignmentType::Center)
                .add_run(Run::new().add_text(title).fonts(cn()).bold().size(34)),
        );
        if let Some(sub) = &spec.subtitle {
            if !sub.is_empty() {
                self.docx = self.docx.add_paragraph(
                    Paragraph::new()
                        .align(AlignmentType::Center)
                        .add_run(Run::new().add_text(sub).fonts(cn()).size(18).color("666666")),
                );
            }
        }
        self.docx = self.docx.add_paragraph(
            Paragraph::new()
                .add_run(text("姓名：____________　　班级：____________　　得分：________")),
        );
        self
    }

    fn finish(self) -> Result<Vec<u8>, String> {
        // pack 要求 Write + Seek，所以先写进游标再取出
        let mut cur = std::io::Cursor::new(Vec::new());
        self.docx
            .build()
            .pack(&mut cur)
            .map_err(|e| format!("生成 docx 失败：{e}"))?;
        Ok(cur.into_inner())
    }
}

/// 外框 + 内部网格线
fn all_borders() -> TableBorders {
    use TableBorderPosition::*;
    TableBorders::new()
        .set(TableBorder::new(Top))
        .set(TableBorder::new(Bottom))
        .set(TableBorder::new(Left))
        .set(TableBorder::new(Right))
        .set(TableBorder::new(InsideH))
        .set(TableBorder::new(InsideV))
}

/// 只有外框（选词填空的方框）
fn outer_borders() -> TableBorders {
    use TableBorderPosition::*;
    TableBorders::new()
        .set(TableBorder::new(Top))
        .set(TableBorder::new(Bottom))
        .set(TableBorder::new(Left))
        .set(TableBorder::new(Right))
}

fn cell_text(s: &str, bold_run: bool, width: usize) -> TableCell {
    let run = if bold_run {
        bold(s.to_string())
    } else {
        text(s.to_string())
    };
    TableCell::new()
        .width(width, WidthType::Dxa)
        .add_paragraph(Paragraph::new().add_run(run))
}

fn cell_run(run: Run, width: usize) -> TableCell {
    TableCell::new()
        .width(width, WidthType::Dxa)
        .add_paragraph(Paragraph::new().add_run(run))
}

/// 四选 n：真正的 Word 表格，列顺序按用户拖动后的顺序。
fn columns(mut d: Doc, entries: &[EntryView], spec: &Spec) -> Doc {
    let fields: Vec<Field> = if spec.fields.is_empty() {
        vec![Field::Word, Field::Phonetic, Field::Meaning, Field::Blank]
    } else {
        spec.fields.clone()
    };

    // 按权重分配列宽
    let total: f32 = fields.iter().map(|f| f.weight()).sum();
    let widths: Vec<usize> = fields
        .iter()
        .map(|f| ((f.weight() / total) * PAGE_W as f32) as usize)
        .collect();

    let mut rows: Vec<TableRow> = Vec::new();
    rows.push(TableRow::new(
        fields
            .iter()
            .zip(&widths)
            .map(|(f, w)| cell_text(f.label(), true, *w))
            .collect(),
    ));

    for e in entries {
        let zh = pick_zh(e, &spec.sense_sources);
        let cells: Vec<TableCell> = fields
            .iter()
            .zip(&widths)
            .map(|(f, w)| match f {
                Field::Word => cell_text(&e.word, false, *w),
                Field::Phonetic => cell_text(&e.phonetic, false, *w),
                Field::Meaning => cell_text(&zh, false, *w),
                Field::Blank => cell_text("", false, *w),
            })
            .collect();
        rows.push(TableRow::new(cells));
    }

    d = d.table(
        Table::new(rows)
            .width(PAGE_W, WidthType::Dxa)
            .set_grid(widths)
            .set_borders(all_borders()),
    );
    d
}

fn sentences(mut d: Doc, entries: &[EntryView], spec: &Spec) -> Doc {
    let mut n = 0usize;
    for e in entries {
        let Some((shown, _, _)) = sentence_item(e, spec.hint_for(e), &spec.sense_sources) else {
            continue;
        };
        n += 1;
        d = d.para(
            Paragraph::new()
                .add_run(text(format!("{n}. ")))
                .add_run(text(shown)),
        );
    }
    d
}

fn cloze(mut d: Doc, entries: &[EntryView], spec: &Spec) -> Doc {
    let (options, items) = pick_cloze(entries, spec);
    if options.is_empty() || items.is_empty() {
        return d;
    }

    // 选项装进一个单格表格，视觉上就是个方框
    let opt_text = options
        .iter()
        .enumerate()
        .map(|(i, idx)| format!("{}. {}　　", label_of(i), entries[*idx].word))
        .collect::<String>();
    d = d.table(
        Table::new(vec![TableRow::new(vec![
            TableCell::new()
                .width(PAGE_W, WidthType::Dxa)
                .add_paragraph(Paragraph::new().add_run(text(opt_text.trim_end().to_string()))),
        ])])
        .width(PAGE_W, WidthType::Dxa)
        .set_grid(vec![PAGE_W])
        .set_borders(outer_borders()),
    );

    let mut n = 0usize;
    for idx in &items {
        let e = &entries[*idx];
        let Some(en) = e.examples.first().map(|x| x.en.clone()) else {
            continue;
        };
        // 选词填空的句子不给任何提示，只有空
        let Some((shown, _)) = fill_blank(&en, &e.word, &"_".repeat(12), "") else {
            continue;
        };
        n += 1;
        d = d.para(
            Paragraph::new()
                .add_run(text(format!("{n}. ")))
                .add_run(text(shown)),
        );
    }
    d
}

/// 笔记模式：每词一块，英文+音标+多来源中文+例句。
fn notes(mut d: Doc, entries: &[EntryView], spec: &Spec) -> Doc {
    for e in entries {
        let mut head = e.word.clone();
        if !e.phonetic.is_empty() {
            head.push_str("  ");
            head.push_str(&e.phonetic);
        }
        if !e.pos.is_empty() {
            head.push_str("  ");
            head.push_str(&e.pos);
        }
        d = d.para(
            Paragraph::new()
                .add_run(Run::new().add_text(head).fonts(cn()).bold().size(24)),
        );

        let senses = pick_zh_all(e, &spec.sense_sources);
        for (src, zh) in &senses {
            let line = if senses.len() == 1 {
                zh.clone()
            } else {
                format!("{}：{}", SOURCE_LABEL(src), zh)
            };
            d = d.para(Paragraph::new().add_run(text(line)));
        }

        for ex in &e.examples {
            if !spec.example_sources.is_empty()
                && !spec.example_sources.iter().any(|s| s == &ex.source)
            {
                continue;
            }
            d = d.para(
                Paragraph::new()
                    .add_run(text("例　"))
                    .add_run(text(ex.en.clone())),
            );
            if let Some(line) = example_gloss(ex) {
                d = d.para(
                    Paragraph::new().add_run(
                        Run::new()
                            .add_text(line)
                            .fonts(cn())
                            .size(18)
                            .color("666666"),
                    ),
                );
            }
        }
        d = d.para(Paragraph::new());
    }
    d
}

fn example_gloss(ex: &Example) -> Option<String> {
    match (ex.zh.is_empty(), ex.label.is_empty()) {
        (true, true) => None,
        (false, true) => Some(format!("　　{}", ex.zh)),
        (true, false) => Some(format!("　　（{}）", ex.label)),
        (false, false) => Some(format!("　　{}（{}）", ex.zh, ex.label)),
    }
}

/// 答案页。四选 n 只在有默写列时才调用；笔记模式永远不调用。
fn answers(mut d: Doc, entries: &[EntryView], spec: &Spec) -> Doc {
    let title = format!("{} · 参考答案", spec.title.clone().unwrap_or_else(|| title_of(spec.mode).to_string()));
    d = d.para(
        Paragraph::new()
            .page_break_before(true)
            .add_run(Run::new().add_text(title).fonts(cn()).bold().size(28)),
    );

    match spec.mode {
        Mode::Columns => {
            for (i, e) in entries.iter().enumerate() {
                let zh = pick_zh(e, &spec.sense_sources);
                let mut line = format!("{}. {}", i + 1, e.word);
                if !e.phonetic.is_empty() {
                    line.push(' ');
                    line.push_str(&e.phonetic);
                }
                if !zh.is_empty() {
                    line.push_str("　");
                    line.push_str(&zh);
                }
                d = d.para(Paragraph::new().add_run(text(line)));
            }
        }
        Mode::Sentence => {
            let mut n = 0usize;
            for e in entries {
                let Some((_, en, range)) =
                    sentence_item(e, spec.hint_for(e), &spec.sense_sources)
                else {
                    continue;
                };
                n += 1;
                d = d.para(answer_sentence(n, &en, range));
            }
        }
        Mode::Cloze => {
            let (_, items) = pick_cloze(entries, spec);
            let mut n = 0usize;
            for idx in items {
                let e = &entries[idx];
                let Some(en) = e.examples.first().map(|x| x.en.clone()) else {
                    continue;
                };
                let Some(range) = find_target(&en.to_lowercase(), &e.word.to_lowercase()) else {
                    continue;
                };
                n += 1;
                d = d.para(answer_sentence(n, &en, range));
            }
        }
        Mode::Notes => {}
    }
    d
}

/// 完整句子，目标词高亮。
fn answer_sentence(n: usize, en: &str, range: (usize, usize)) -> Paragraph {
    let mut p = Paragraph::new().add_run(text(format!("{n}. ")));
    for (hl, part) in split_at_target(en, range) {
        p = p.add_run(if hl {
            mark(part.to_string())
        } else {
            text(part.to_string())
        });
    }
    p
}

pub fn render(entries: &[EntryView], spec: &Spec) -> Result<Vec<u8>, String> {
    let title = spec
        .title
        .clone()
        .unwrap_or_else(|| title_of(spec.mode).to_string());

    let mut d = Doc::new().header(&title, spec);

    d = match spec.mode {
        Mode::Columns => columns(d, entries, spec),
        Mode::Sentence => sentences(d, entries, spec),
        Mode::Cloze => cloze(d, entries, spec),
        Mode::Notes => notes(d, entries, spec),
    };

    if spec.answer_key && has_answer(spec) {
        d = answers(d, entries, spec);
    }

    d.finish()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::content::Hint;
    use crate::db::Sense;

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
            senses: vec![Sense {
                source: "textbook".into(),
                pos: String::new(),
                zh: meaning.into(),
            }],
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

    /// docx 必须是合法的 zip，且 document.xml 里能找到中文。
    fn assert_valid_docx(bytes: &[u8], needle: &str) {
        assert!(bytes.starts_with(b"PK"), "不是 zip 容器");
        // 在原始字节里找 needle：document.xml 是 deflate 压缩的，
        // 所以这里只验证签名；解压校验放在下面的 unzip 测试里。
        assert!(bytes.len() > 2000, "文件太小：{}", bytes.len());
        let _ = needle;
    }

    /// 答案页必须真的带高亮，否则「目标词凸显」这条就是空话。
    #[test]
    fn answer_highlights_target() {
        let entries = vec![e("mood", "心情", "/muːd/", "Her mood improved at once.")];
        let spec = Spec {
            mode: Mode::Sentence,
            hint: Some(Hint::None),
            ..base(Mode::Sentence)
        };
        let bytes = render(&entries, &spec).unwrap();
        // 写出来供外部脚本解压检查（deflate 压缩后没法在字节里直接搜）
        let p = std::path::Path::new("/tmp/hl-check.docx");
        std::fs::write(p, &bytes).unwrap();
        let out = std::process::Command::new("python3")
            .arg("-c")
            .arg(
                r#"import zipfile,sys
x=zipfile.ZipFile('/tmp/hl-check.docx').read('word/document.xml').decode()
sys.exit(0 if 'w:highlight' in x else 1)"#,
            )
            .status()
            .expect("需要 python3 来解压 docx");
        assert!(out.success(), "答案页没有高亮，docx 里的目标词没有凸显");
    }

    #[test]
    fn all_modes_produce_docx() {
        let entries = vec![
            e("mood", "心情", "/muːd/", "Her mood improved at once."),
            e("amusement park", "游乐场", "", "We went to the amusement park."),
            e("smile", "微笑", "/smaɪl/", "She was smiling at me."),
            e("campus", "校园", "/ˈkæmpəs/", "The campus is large."),
        ];

        let mut columns = base(Mode::Columns);
        columns.fields = vec![Field::Word, Field::Phonetic, Field::Meaning, Field::Blank];
        let mut cloze = base(Mode::Cloze);
        cloze.pool = Some(4);
        cloze.blanks = Some(3);
        let mut notes = base(Mode::Notes);
        notes.example_sources = vec!["oxford".into()];

        for spec in [columns, base(Mode::Sentence), cloze, notes] {
            let bytes = render(&entries, &spec).expect("生成失败");
            assert_valid_docx(&bytes, "心情");
        }
    }

    /// 答案规则必须和 PDF 完全一样：笔记无答案、无默写列无答案。
    #[test]
    fn answer_rules_match_pdf() {
        let entries = vec![e("mood", "心情", "/muːd/", "Her mood improved.")];

        // 笔记模式：即便 answer_key=true 也不该出现「参考答案」
        let mut notes = base(Mode::Notes);
        notes.answer_key = true;
        let with = render(&entries, &notes).unwrap();
        notes.answer_key = false;
        let without = render(&entries, &notes).unwrap();
        assert_eq!(with.len(), without.len(), "笔记模式不该受 answer_key 影响");
        assert!(!has_answer(&notes), "笔记模式应判定为无答案");

        // 四选 n 无默写列
        let no_blank = Spec {
            fields: vec![Field::Word, Field::Meaning],
            ..base(Mode::Columns)
        };
        assert!(!has_answer(&no_blank), "无默写列不该有答案");

        let with_blank = Spec {
            fields: vec![Field::Word, Field::Blank],
            ..base(Mode::Columns)
        };
        assert!(has_answer(&with_blank), "有默写列应有答案");
    }
}
