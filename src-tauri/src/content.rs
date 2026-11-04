//! 与输出格式无关的卷面逻辑。
//!
//! PDF 是按坐标画，Word 是流式文档加表格 —— 两者的排版代码没法共用，
//! 但「怎么选释义」「怎么挖空」「什么时候出答案」必须只有一份实现，
//! 否则改一处忘一处，PDF 和 DOCX 就会给出不一样的卷子。
//!
//! 这里只放纯逻辑，不含任何绘图或文档对象。

use serde::Deserialize;

use crate::db::EntryView;

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
    pub fn label(self) -> &'static str {
        match self {
            Field::Word => "英文",
            Field::Phonetic => "音标",
            Field::Meaning => "中文",
            Field::Blank => "默写",
        }
    }

    /// 分列宽度的权重，中文列最宽
    pub fn weight(self) -> f32 {
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

#[derive(Debug, Default, Clone, Deserialize)]
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
    pub fn hint_for(&self, e: &EntryView) -> Hint {
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


pub fn title_of(m: Mode) -> &'static str {
    match m {
        Mode::Columns => "词汇默写",
        Mode::Sentence => "句子默写",
        Mode::Cloze => "选词填空",
        Mode::Notes => "词汇笔记",
    }
}

pub fn has_answer(spec: &Spec) -> bool {
    match spec.mode {
        Mode::Columns => spec.fields.contains(&Field::Blank),
        Mode::Sentence | Mode::Cloze => true,
        Mode::Notes => false,
    }
}


/// 把字符串按目标区间切成 (是否高亮, 片段)，用于答案页的凸显。
pub fn split_at_target<'a>(text: &'a str, target: (usize, usize)) -> Vec<(bool, &'a str)> {
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


/// 释义自带的括号在提示里没有信息量，出现就会变成【（…）】，一并去掉。
pub fn strip_parens(s: &str) -> String {
    s.chars()
        .filter(|c| !matches!(c, '（' | '）' | '(' | ')'))
        .collect::<String>()
        .trim()
        .to_string()
}

/// 提示文字统一用【】，彻底避开释义里自带的（），不再出现嵌套括号。
pub fn hint_mark(h: Hint, e: &EntryView, sources: &[String]) -> String {
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

pub fn blank_of(word: &str, hint: Hint) -> String {
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
pub fn fill_blank(
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
pub fn find_target(haystack: &str, needle: &str) -> Option<(usize, usize)> {
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
pub fn sentence_item(e: &EntryView, hint: Hint, sources: &[String]) -> Option<(String, String, (usize, usize))> {
    let en = e.examples.first()?.en.clone();
    let mark = hint_mark(hint, e, sources);
    let (shown, range) = fill_blank(&en, &e.word, &blank_of(&e.word, hint), &mark)?;
    Some((shown, en, range))
}


/// 选出 (选项下标, 题目下标)：候选必须有例句，题目是候选项的子集，
/// 这样每个空的答案都一定在方框里。
pub fn label_of(i: usize) -> String {
    let c = (b'A' + (i % 26) as u8) as char;
    c.to_string()
}

pub fn pick_cloze(entries: &[EntryView], spec: &Spec) -> (Vec<usize>, Vec<usize>) {
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


pub fn shuffle_slice<T>(v: &mut [T]) {
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
