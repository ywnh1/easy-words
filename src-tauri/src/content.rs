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
    /// 随机种子：决定取哪条例句、选词填空挑哪些词。
    /// 0 表示按时间取，前端可以传同一个种子让预览与导出一致。
    #[serde(default)]
    pub seed: u64,
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
/// 笔记模式里每个来源最多列几条释义。
///
/// 牛津双解是同义词词典，一个词能抽出十几条碎片（大 / 老 / 上级 / 中学…），
/// 全列出来会把一个词撑成二十行，反而看不出重点。三条足够覆盖主要义项。
pub const MAX_SENSES_PER_SOURCE: usize = 3;

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
        let mut picked: Vec<String> = Vec::new();
        for s in e.senses.iter().filter(|s| &s.source == src && !s.zh.is_empty()) {
            if picked.len() >= MAX_SENSES_PER_SOURCE {
                break;
            }
            // 只在同一来源内部去重：「级别高」「级别高的」留一条。
            // 不同来源之间不去重 —— 牛津和柯林斯说法相近恰恰可以互相对照。
            if picked.iter().any(|prev| similar(prev, &s.zh)) {
                continue;
            }
            picked.push(s.zh.clone());
            out.push((src.clone(), s.zh.clone()));
        }
    }
    out
}

/// 两条释义是不是几乎重复：去掉「的」和标点后相同，或一方包含另一方。
fn similar(a: &str, b: &str) -> bool {
    let norm = |t: &str| {
        t.chars()
            .filter(|c| !matches!(c, '的' | '；' | ';' | '，' | ',' | ' '))
            .collect::<String>()
    };
    let (a, b) = (norm(a), norm(b));
    if a.is_empty() || b.is_empty() {
        return false;
    }
    a == b || a.contains(&b) || b.contains(&a)
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
/// 一道准备好的句子题。题面与答案共用同一句，不会出现两边挑不同句的情况。
#[derive(Debug, Clone)]
pub struct SentenceItem {
    /// 挖空后的题面（含提示标记）
    pub shown: String,
    /// 原句，答案页用
    pub original: String,
    /// 目标词在原句中的字节区间，答案页用来高亮
    pub range: (usize, usize),
}

/// 一个词条里"能用来出题"的例句：必须真的能挖到目标词。
///
/// 之前只看 examples 是否为空，导致 pick_cloze 选进来的词在渲染时
/// 挖空失败被跳过，题号就断号、题量也对不上。
pub fn usable_examples<'a>(e: &'a EntryView, hint: Hint) -> Vec<&'a crate::db::Example> {
    let blank = blank_of(&e.word, hint);
    e.examples
        .iter()
        .filter(|x| fill_blank(&x.en, &e.word, &blank, "").is_some())
        .collect()
}

/// 从可用例句里按种子挑一条。同一个种子必得同一句，
/// 所以预览与导出一致；换种子就换句子。
pub fn pick_example<'a>(
    e: &'a EntryView,
    hint: Hint,
    seed: u64,
) -> Option<&'a crate::db::Example> {
    let usable = usable_examples(e, hint);
    if usable.is_empty() {
        return None;
    }
    let idx = (mix_seed(seed ^ hash_word(&e.word)) % usable.len() as u64) as usize;
    Some(usable[idx])
}

/// FNV-1a：把词形摊成一个数，让不同词落在不同的例句上
fn hash_word(word: &str) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in word.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x1000_0000_01b3);
    }
    h
}

/// splitmix64 的最后一轮，用来打散相邻种子
pub fn mix_seed(seed: u64) -> u64 {
    let mut x = seed.wrapping_add(0x9E37_79B9_7F4A_7C15);
    x = (x ^ (x >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    x ^ (x >> 31)
}

/// Spec 里的种子；0 表示按时间取
pub fn spec_seed(spec: &Spec) -> u64 {
    if spec.seed != 0 {
        spec.seed
    } else {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0x9E37_79B9_7F4A_7C15)
    }
}

/// 准备一道句子题：随机取一条可用例句并挖空。
pub fn sentence_item(
    e: &EntryView,
    hint: Hint,
    sources: &[String],
    seed: u64,
) -> Option<SentenceItem> {
    let ex = pick_example(e, hint, seed)?;
    let mark = hint_mark(hint, e, sources);
    let (shown, range) = fill_blank(&ex.en, &e.word, &blank_of(&e.word, hint), &mark)?;
    Some(SentenceItem {
        shown,
        original: ex.en.clone(),
        range,
    })
}


/// 选出 (选项下标, 题目下标)：候选必须有例句，题目是候选项的子集，
/// 这样每个空的答案都一定在方框里。
pub fn label_of(i: usize) -> String {
    let c = (b'A' + (i % 26) as u8) as char;
    c.to_string()
}

/// 一道选词填空题：条目下标 + 已准备好的句子。
pub struct ClozeItem {
    pub entry: usize,
    pub sentence: SentenceItem,
}

/// 一次选词填空的完整方案。
///
/// 题面与答案页都从这里取，所以「选项数」「句子数」「答案顺序」
/// 天然一致 —— 之前渲染和答案各自调 pick_cloze，两边洗牌结果不同，
/// 答案和题号对不上。
pub struct ClozePlan {
    /// 方框里的选项（entries 下标），含干扰项
    pub options: Vec<usize>,
    /// 下面的句子，顺序即题号
    pub items: Vec<ClozeItem>,
}

/// 规划一次选词填空。
///
/// 关键点：候选必须真的能挖空。之前只判断 examples 是否为空，
/// 结果某些词渲染时挖空失败被跳过，题号断号、题量比用户设定的少。
pub fn plan_cloze(entries: &[EntryView], spec: &Spec) -> ClozePlan {
    let pool = spec.pool.unwrap_or(8).max(2);
    let want = spec.blanks.unwrap_or(6).clamp(1, pool);
    let seed = spec_seed(spec);

    // 只有真能挖空的词才配进选项
    let mut usable: Vec<usize> = entries
        .iter()
        .enumerate()
        .filter(|(_, e)| !usable_examples(e, Hint::None).is_empty())
        .map(|(i, _)| i)
        .collect();

    // 先用种子打散，再按顺序取，避免总是前几个词（教材前几页的）
    shuffle_with_seed(&mut usable, mix_seed(seed));

    // 选项取前 pool 个；题目从选项里再取 want 个
    let options: Vec<usize> = usable.iter().copied().take(pool).collect();
    let mut quiz: Vec<usize> = options.clone();
    shuffle_with_seed(&mut quiz, mix_seed(seed ^ 0x5DEE_CE66_D1CE_4E5B));

    let mut items = Vec::new();
    for idx in quiz.into_iter().take(want) {
        let e = &entries[idx];
        // 用同一个种子挑例句，题面与答案共用
        if let Some(sentence) = sentence_item(e, Hint::None, &[], seed ^ hash_word(&e.word)) {
            items.push(ClozeItem {
                entry: idx,
                sentence,
            });
        }
    }

    ClozePlan { options, items }
}

/// 用给定种子洗牌（同种子必得同一结果）
pub fn shuffle_with_seed<T>(v: &mut [T], seed: u64) {
    let mut s = mix_seed(seed) | 1;
    for i in (1..v.len()).rev() {
        s ^= s << 13;
        s ^= s >> 7;
        s ^= s << 17;
        let j = (s % (i as u64 + 1)) as usize;
        v.swap(i, j);
    }
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
