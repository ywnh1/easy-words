//! 词库查询层。
//!
//! 设计约束：
//!   * 内嵌一份 seed.sqlite（构建时生成），首次启动拷到应用数据目录。
//!   * 之后所有查询走 SQLite，不把整库读进内存。
//!   * 表结构见 scripts/build_db.py，加新书/四六级/词典只需扩充数据，不改这里。

use rusqlite::{params_from_iter, Connection};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;

pub const SEED: &[u8] = include_bytes!("../resources/seed.sqlite");
const SCHEMA_VERSION: i64 = 3;

#[derive(Debug, Serialize)]
pub struct Bucket {
    pub key: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct BookInfo {
    pub id: String,
    pub title: String,
    pub volume: String,
    pub kind: String,
    pub sort_order: i64,
    pub total: i64,
    pub units: Vec<Bucket>,
    pub pages: Vec<Bucket>,
    pub initials: Vec<Bucket>,
    pub markers: BTreeMap<String, i64>,
    pub sources: BTreeMap<String, i64>,
    pub with_examples: i64,
}

#[derive(Debug, Default, Clone, Deserialize)]
#[serde(default)]
pub struct Filter {
    pub book_ids: Vec<String>,
    pub units: Vec<i64>,
    pub pages: Vec<i64>,
    pub initials: Vec<String>,
    /// none / star / box
    pub markers: Vec<String>,
    /// textbook / extra
    pub sources: Vec<String>,
    /// 指定单词，逗号/空格/换行分隔
    pub query: String,
    pub shuffle: bool,
    /// 中译英 / 单词表需要中文题干，跳过只有英文的扩充短语
    pub needs_meaning: bool,
    /// word / phrase —— 只出单词或只出短语
    pub kinds: Vec<String>,
    /// book（书后顺序）/ initial（首字母）/ random
    pub order: Option<String>,
    /// 随机抽取的条数；None 表示全取（配合 order=random 时生效）
    pub limit: Option<usize>,
    /// 随机种子。同一个种子 + 同样的筛选条件必得同样一批词，
    /// 这样预览里看到的、和真正导出的是同一批（逐词提示覆盖才有意义）。
    pub seed: Option<u64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct Example {
    pub en: String,
    pub zh: String,
    pub source: String,
    pub label: String,
}

/// 一条中文释义，带来源，供前端按优先级挑用。
#[derive(Debug, Serialize, Clone)]
pub struct Sense {
    pub source: String,
    pub pos: String,
    pub zh: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct EntryView {
    pub word: String,
    pub phonetic: String,
    pub pos: String,
    /// 合并后的中文释义（同形词全部列出）
    pub meaning: String,
    pub is_phrase: bool,
    pub marker: String,
    pub book: String,
    pub unit_no: i64,
    pub page: Option<i64>,
    pub examples: Vec<Example>,
    /// 所有来源的中文释义
    pub senses: Vec<Sense>,
}

/// 保证应用数据目录里有一份可用的库；版本不符就重新拷贝。
pub fn ensure_db(path: &Path) -> rusqlite::Result<()> {
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let ok = match Connection::open(path) {
        Ok(con) => con
            .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .map(|v| v >= SCHEMA_VERSION)
            .unwrap_or(false),
        Err(_) => false,
    };
    if !ok {
        // 先写临时文件再改名，避免中途崩溃留下半个库；
        // 文件名带 pid，防止两个进程同时初始化时互相踩踏
        let tmp = path.with_extension(format!("tmp{}", std::process::id()));
        std::fs::write(&tmp, SEED).map_err(|e| {
            rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CANTOPEN),
                Some(format!("写入种子库失败: {e}")),
            )
        })?;
        std::fs::rename(&tmp, path).map_err(|e| {
            rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CANTOPEN),
                Some(format!("替换种子库失败: {e}")),
            )
        })?;
    }
    Ok(())
}

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let con = Connection::open(path)?;
    con.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE;")?;
    Ok(con)
}

/// 一次把书 / 单元 / 页码 / 首字母的统计拉全，供前端做筛选面板。
pub fn catalog(con: &Connection) -> rusqlite::Result<Vec<BookInfo>> {
    let mut books = Vec::new();
    let mut st = con.prepare(
        "SELECT id,title,COALESCE(volume,''),kind,sort_order FROM books ORDER BY sort_order,title",
    )?;
    let rows = st
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, i64>(4)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    for (id, title, volume, kind, sort_order) in rows {
        let mut b = BookInfo {
            total: 0,
            units: vec![],
            pages: vec![],
            initials: vec![],
            markers: BTreeMap::new(),
            sources: BTreeMap::new(),
            with_examples: 0,
            id: id.clone(),
            title,
            volume,
            kind,
            sort_order,
        };
        b.total = con.query_row(
            "SELECT COUNT(*) FROM entries WHERE book_id=?1",
            [&id],
            |r| r.get(0),
        )?;
        b.units = buckets(con, "unit_no", &id)?;
        b.pages = buckets(con, "page", &id)?;
        b.initials = buckets(con, "initial", &id)?;
        for (k, c) in group_counts(con, "marker", &id)? {
            b.markers.insert(k, c);
        }
        for (k, c) in group_counts(con, "source_kind", &id)? {
            b.sources.insert(k, c);
        }
        b.with_examples = con.query_row(
            "SELECT COUNT(DISTINCT e.id) FROM entries e
             JOIN examples x ON x.entry_id = e.id WHERE e.book_id=?1",
            [&id],
            |r| r.get(0),
        )?;
        books.push(b);
    }
    Ok(books)
}

fn buckets(con: &Connection, col: &str, book: &str) -> rusqlite::Result<Vec<Bucket>> {
    // ponytail: col 来自本文件内的常量字面量，不接受外部输入，因此直接拼接
    let sql = format!(
        "SELECT CAST({col} AS TEXT) k, COUNT(*) FROM entries
         WHERE book_id=?1 AND {col} IS NOT NULL GROUP BY {col} ORDER BY {col}"
    );
    let mut st = con.prepare(&sql)?;
    let v = st
        .query_map([book], |r| {
            Ok(Bucket {
                key: r.get(0)?,
                count: r.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

fn group_counts(
    con: &Connection,
    col: &str,
    book: &str,
) -> rusqlite::Result<Vec<(String, i64)>> {
    let sql = format!(
        "SELECT {col}, COUNT(*) FROM entries WHERE book_id=?1 GROUP BY {col} ORDER BY {col}"
    );
    let mut st = con.prepare(&sql)?;
    let v = st
        .query_map([book], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(v)
}

/// 按筛选条件取词条，同形词合并中文释义。
pub fn query(con: &Connection, f: &Filter, limit: Option<usize>) -> rusqlite::Result<Vec<EntryView>> {
    let mut sql = String::from(
        "SELECT e.word_lower, e.word, e.phonetic, e.pos, e.meaning, e.is_phrase, e.marker,
                COALESCE(b.volume, b.title) AS book, e.unit_no, e.page, e.id, e.seq
         FROM entries e JOIN books b ON b.id = e.book_id WHERE 1=1",
    );
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if !f.book_ids.is_empty() {
        let ph = placeholders(f.book_ids.len());
        sql.push_str(&format!(" AND e.book_id IN ({ph})"));
        for v in &f.book_ids {
            args.push(Box::new(v.clone()));
        }
    }
    if !f.units.is_empty() {
        let ph = placeholders(f.units.len());
        sql.push_str(&format!(" AND e.unit_no IN ({ph})"));
        for v in &f.units {
            args.push(Box::new(*v));
        }
    }
    if !f.pages.is_empty() {
        let ph = placeholders(f.pages.len());
        sql.push_str(&format!(" AND e.page IN ({ph})"));
        for v in &f.pages {
            args.push(Box::new(*v));
        }
    }
    if !f.initials.is_empty() {
        let ph = placeholders(f.initials.len());
        sql.push_str(&format!(" AND e.initial IN ({ph})"));
        for v in &f.initials {
            args.push(Box::new(v.to_lowercase()));
        }
    }
    if !f.markers.is_empty() {
        let ph = placeholders(f.markers.len());
        sql.push_str(&format!(" AND e.marker IN ({ph})"));
        for v in &f.markers {
            args.push(Box::new(v.clone()));
        }
    }
    if !f.sources.is_empty() {
        let ph = placeholders(f.sources.len());
        sql.push_str(&format!(" AND e.source_kind IN ({ph})"));
        for v in &f.sources {
            args.push(Box::new(v.clone()));
        }
    }
    if f.needs_meaning {
        // 中文字典来源可以来自任意词典，所以看 senses 而不是教材释义
        sql.push_str(" AND EXISTS(SELECT 1 FROM senses s WHERE s.entry_id = e.id AND s.zh <> '')");
    }
    if !f.kinds.is_empty() {
        // kinds 只认 word / phrase，映射到 is_phrase
        let vals: Vec<i64> = f
            .kinds
            .iter()
            .filter_map(|k| match k.as_str() {
                "word" => Some(0),
                "phrase" => Some(1),
                _ => None,
            })
            .collect();
        if !vals.is_empty() {
            let ph = placeholders(vals.len());
            sql.push_str(&format!(" AND e.is_phrase IN ({ph})"));
            for v in vals {
                args.push(Box::new(v));
            }
        }
    }
    let needles = split_query(&f.query);
    if !needles.is_empty() {
        let ph = placeholders(needles.len());
        sql.push_str(&format!(
            " AND (e.word_lower IN ({ph}) OR e.word_lower LIKE ?)"
        ));
        for v in &needles {
            args.push(Box::new(v.clone()));
        }
        args.push(Box::new(format!("% {}%", needles.join(" "))));
    }

    // 排序在合并同形词之后才准确（随机尤其如此），这里只给它一个稳定基准
    match f.order.as_deref() {
        Some("initial") => sql.push_str(" ORDER BY e.initial, e.word_lower, e.id"),
        _ => sql.push_str(" ORDER BY b.sort_order, e.unit_no, e.seq, e.id"),
    }

    let mut st = con.prepare(&sql)?;
    let refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|b| b.as_ref()).collect();
    let raw = st
        .query_map(params_from_iter(refs), |r| {
            Ok((
                r.get::<_, String>(0)?,          // word_lower
                r.get::<_, String>(1)?,          // word
                r.get::<_, String>(2)?,          // phonetic
                r.get::<_, String>(3)?,          // pos
                r.get::<_, String>(4)?,          // meaning
                r.get::<_, i64>(5)?,             // is_phrase
                r.get::<_, String>(6)?,          // marker
                r.get::<_, String>(7)?,          // book
                r.get::<_, i64>(8)?,             // unit_no
                r.get::<_, Option<i64>>(9)?,     // page
                r.get::<_, i64>(10)?,            // id
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    // 同形词合并：英文相同、中文不同 → 全部列出
    let mut order: Vec<String> = Vec::new();
    let mut map: std::collections::HashMap<String, EntryView> = std::collections::HashMap::new();
    let mut ids: std::collections::HashMap<String, Vec<i64>> = std::collections::HashMap::new();
    for (low, word, phonetic, pos, meaning, is_phrase, marker, book, unit_no, page, id) in raw {
        ids.entry(low.clone()).or_default().push(id);
        match map.get_mut(&low) {
            Some(v) => {
                if v.phonetic.is_empty() && !phonetic.is_empty() {
                    v.phonetic = phonetic;
                }
                if !pos.is_empty() && v.pos.is_empty() {
                    v.pos = pos;
                }
                if !meaning.is_empty() && !v.meaning.split('；').any(|s| s == meaning) {
                    v.meaning.push('；');
                    v.meaning.push_str(&meaning);
                }
            }
            None => {
                order.push(low.clone());
                map.insert(
                    low,
                    EntryView {
                        word,
                        phonetic,
                        pos,
                        meaning,
                        is_phrase: is_phrase == 1,
                        marker,
                        book,
                        unit_no,
                        page,
                        examples: vec![],
                        senses: vec![],
                    },
                );
            }
        }
    }

    // 例句：一次查完选中的词条，避免 N+1
    let all_ids: Vec<i64> = ids.values().flatten().copied().collect();
    if !all_ids.is_empty() {
        let mut by_entry: std::collections::HashMap<i64, Vec<Example>> = Default::default();
        for chunk in all_ids.chunks(400) {
            let ph = placeholders(chunk.len());
            let sql = format!(
                "SELECT entry_id, en, zh, source, label FROM examples WHERE entry_id IN ({ph})"
            );
            let mut st = con.prepare(&sql)?;
            let rows = st.query_map(params_from_iter(chunk.iter()), |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    Example {
                        en: r.get(1)?,
                        zh: r.get(2)?,
                        source: r.get(3)?,
                        label: r.get(4)?,
                    },
                ))
            })?;
            for row in rows {
                let (id, ex) = row?;
                by_entry.entry(id).or_default().push(ex);
            }
        }
        for (low, entry_ids) in &ids {
            if let Some(v) = map.get_mut(low) {
                for id in entry_ids {
                    if let Some(list) = by_entry.get(id) {
                        v.examples.extend(list.iter().cloned());
                    }
                }
                v.examples.truncate(2);
            }
        }
    }

    // 各来源的中文释义：同样批量取，供前端按优先级挑选
    if !all_ids.is_empty() {
        let mut by_entry: std::collections::HashMap<i64, Vec<Sense>> = Default::default();
        for chunk in all_ids.chunks(400) {
            let ph = placeholders(chunk.len());
            let sql = format!(
                "SELECT entry_id, source, pos, zh FROM senses WHERE entry_id IN ({ph})"
            );
            let mut st = con.prepare(&sql)?;
            let rows = st.query_map(params_from_iter(chunk.iter()), |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    Sense {
                        source: r.get(1)?,
                        pos: r.get(2)?,
                        zh: r.get(3)?,
                    },
                ))
            })?;
            for row in rows {
                let (id, sn) = row?;
                by_entry.entry(id).or_default().push(sn);
            }
        }
        for (low, entry_ids) in &ids {
            if let Some(v) = map.get_mut(low) {
                for id in entry_ids {
                    if let Some(list) = by_entry.get(id) {
                        v.senses.extend(list.iter().cloned());
                    }
                }
            }
        }
    }

    let mut out: Vec<EntryView> = order.into_iter().filter_map(|k| map.remove(&k)).collect();

    // 顺序：首字母 / 书后顺序在 SQL 里已排好；随机在合并后打乱才公平
    if f.order.as_deref() == Some("random") {
        shuffle(&mut out, f.seed.unwrap_or_else(|| time_seed()));
    }
    // 出题条数：随机时截断到 n 个；不给就是全取
    if let Some(n) = f.limit {
        if f.order.as_deref() == Some("random") {
            out.truncate(n);
        }
    }
    if let Some(n) = limit {
        out.truncate(n);
    }
    Ok(out)
}

/// 匿名占位符：多组条件各自展开，靠位置绑定参数。
fn placeholders(n: usize) -> String {
    vec!["?"; n].join(",")
}

fn split_query(q: &str) -> Vec<String> {
    q.split([',', '，', ';', '；', '\n', '\r', '\t', ' '])
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect()
}

fn time_seed() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0x9E3779B97F4A7C15)
        | 1
}

/// xorshift：不引入 rand 依赖。给定同一个 seed 结果固定可复现。
fn shuffle<T>(v: &mut Vec<T>, seed: u64) {
    // 先做一次 splitmix 混合：相邻的小种子（1/2/3…）如果不打散，
    // xorshift 前几轮会算出相同的下标，换种子等于没换。
    let mut seed = seed.wrapping_add(0x9E3779B97F4A7C15);
    seed = (seed ^ (seed >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    seed = (seed ^ (seed >> 27)).wrapping_mul(0x94D049BB133111EB);
    seed ^= seed >> 31;
    seed |= 1;
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

    /// 每个测试一份独立的库，避免并行测试互删。
    fn seed_conn(tag: &str) -> Connection {
        let dir = std::env::temp_dir().join(format!("easywords-test-{}-{tag}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("t.sqlite");
        ensure_db(&p).unwrap();
        open(&p).unwrap()
    }

    /// 手工生成各类样例卷子，供肉眼和 pdftotext 检查。
    /// cargo test -- --ignored sample_pdfs
    #[test]
    #[ignore]
    fn sample_pdfs() {
        use crate::pdf::{Field, Hint, Mode, Spec};
        let con = seed_conn("samples");
        let f = Filter {
            book_ids: vec!["waiyanshe-required-1".into()],
            units: vec![1],
            ..Default::default()
        };
        let entries = query(&con, &f, None).unwrap();
        let out = std::path::Path::new("/tmp/samples");
        std::fs::create_dir_all(out).unwrap();

        let spec = |mode: Mode| Spec {
            mode,
            answer_key: true,
            subtitle: Some("外研社 必修第一册 · UNIT 1".into()),
            ..Default::default()
        };

        // 四选 n 的三种典型组合
        let mut cases: Vec<(String, Spec)> = Vec::new();
        let mut s = spec(Mode::Columns);
        s.fields = vec![Field::Meaning, Field::Blank];
        cases.push(("四选2-中译英".into(), s));

        let mut s = spec(Mode::Columns);
        s.fields = vec![Field::Word, Field::Phonetic, Field::Blank];
        cases.push(("四选3-英译中".into(), s));

        let mut s = spec(Mode::Columns);
        s.fields = vec![Field::Word, Field::Phonetic, Field::Meaning, Field::Blank];
        cases.push(("四选4-单词表".into(), s));

        // 句子：五种提示
        for (name, hint) in [
            ("句子-只挖空", Hint::None),
            ("句子-中文", Hint::Zh),
            ("句子-英文", Hint::En),
            ("句子-音标", Hint::Phonetic),
            ("句子-首字母", Hint::Initial),
        ] {
            let mut s = spec(Mode::Sentence);
            s.hint = Some(hint);
            cases.push((name.into(), s));
        }

        // 选词填空
        let mut s = spec(Mode::Cloze);
        s.pool = Some(8);
        s.blanks = Some(6);
        cases.push(("选词填空".into(), s));

        // 笔记模式（多个中文来源 + 例句）
        let mut s = spec(Mode::Notes);
        s.sense_sources = vec!["textbook".into(), "oxford_high".into(), "collins".into()];
        s.example_sources = vec!["oxford".into(), "own".into()];
        cases.push(("笔记".into(), s));

        for (name, sp) in cases {
            let bytes = crate::pdf::render(&entries, &sp).unwrap();
            std::fs::write(out.join(format!("{name}.pdf")), bytes).unwrap();
        }
    }

    #[test]
    fn catalog_has_books() {
        let con = seed_conn("catalog");
        let books = catalog(&con).unwrap();
        assert!(books.len() >= 4, "应有 4 本教材，实际 {}", books.len());
        for b in &books {
            assert!(b.total > 0, "{} 无词条", b.id);
            assert!(!b.units.is_empty(), "{} 无单元", b.id);
        }
    }

    #[test]
    fn same_word_merges_meanings() {
        let con = seed_conn("merge");
        let f = Filter {
            book_ids: vec!["waiyanshe-selective-1".into()],
            ..Default::default()
        };
        let v = query(&con, &f, None).unwrap();
        assert!(!v.is_empty());
        // 合并后不应残留重复词形
        let mut seen = std::collections::HashSet::new();
        for e in &v {
            assert!(seen.insert(e.word.to_lowercase()), "{} 重复出现", e.word);
        }
    }

    /// 同一个种子 + 同样的条件必须得到同一批词，
    /// 否则预览里设的逐词提示会在导出时落空。
    #[test]
    fn random_is_reproducible_for_same_seed() {
        let con = seed_conn("seed");
        let f = Filter {
            book_ids: vec!["waiyanshe-required-1".into()],
            order: Some("random".into()),
            limit: Some(6),
            seed: Some(42),
            ..Default::default()
        };
        let a: Vec<String> = query(&con, &f, None).unwrap().into_iter().map(|e| e.word).collect();
        let b: Vec<String> = query(&con, &f, Some(40)).unwrap().into_iter().map(|e| e.word).collect();
        assert_eq!(a.len(), 6, "应随机抽 6 个");
        assert_eq!(a, b, "预览与导出必须是同一批：{a:?} vs {b:?}");

        let g = Filter { seed: Some(43), ..f.clone() };
        let c: Vec<String> = query(&con, &g, None).unwrap().into_iter().map(|e| e.word).collect();
        assert_ne!(a, c, "换种子应该换一批");
        assert_eq!(c.len(), 6);
    }

    /// 随机抽取要能从指定书/单元/页码的范围内取。
    #[test]
    fn random_respects_scope() {
        let con = seed_conn("scope");

        // 指定书
        let f = Filter {
            book_ids: vec!["waiyanshe-required-2".into()],
            order: Some("random".into()),
            limit: Some(5),
            seed: Some(7),
            ..Default::default()
        };
        let v = query(&con, &f, None).unwrap();
        assert_eq!(v.len(), 5);
        assert!(v.iter().all(|e| e.book.contains("第二册")));

        // 指定单元
        let f = Filter {
            book_ids: vec!["waiyanshe-required-1".into()],
            units: vec![3],
            order: Some("random".into()),
            limit: Some(4),
            seed: Some(7),
        ..Default::default()
        };
        let v = query(&con, &f, None).unwrap();
        assert_eq!(v.len(), 4);
        assert!(v.iter().all(|e| e.unit_no == 3), "应只来自 UNIT 3");

        // 指定页码
        let f = Filter {
            book_ids: vec!["waiyanshe-required-1".into()],
            pages: vec![5],
            order: Some("random".into()),
            limit: Some(3),
            seed: Some(7),
            ..Default::default()
        };
        let v = query(&con, &f, None).unwrap();
        assert!(v.len() <= 3);
        assert!(v.iter().all(|e| e.page == Some(5)));
    }

    /// 只单词 / 只短语。
    #[test]
    fn kinds_split_words_and_phrases() {
        let con = seed_conn("kinds");
        for (kind, want_phrase) in [("word", false), ("phrase", true)] {
            let f = Filter {
                book_ids: vec!["waiyanshe-required-1".into()],
                kinds: vec![kind.into()],
                ..Default::default()
            };
            let v = query(&con, &f, None).unwrap();
            assert!(!v.is_empty(), "{kind} 应有结果");
            assert!(
                v.iter().all(|e| e.is_phrase == want_phrase),
                "{kind} 过滤后混进了别的类型"
            );
        }
    }

    /// 首字母排列 = 按首字母升序。
    #[test]
    fn order_by_initial_sorts() {
        let con = seed_conn("order");
        let f = Filter {
            book_ids: vec!["waiyanshe-required-1".into()],
            order: Some("initial".into()),
            ..Default::default()
        };
        let v = query(&con, &f, None).unwrap();
        let initials: Vec<char> = v
            .iter()
            .map(|e| e.word.chars().next().unwrap().to_ascii_lowercase())
            .collect();
        let mut sorted = initials.clone();
        sorted.sort();
        assert_eq!(initials, sorted, "首字母顺序不对");
    }

    #[test]
    fn filter_by_initial_and_marker() {
        let con = seed_conn("initial");
        let f = Filter {
            initials: vec!["m".into()],
            markers: vec!["star".into()],
            ..Default::default()
        };
        let v = query(&con, &f, None).unwrap();
        assert!(!v.is_empty());
        for e in &v {
            assert!(e.word.to_lowercase().starts_with('m'));
            assert_eq!(e.marker, "star");
        }
    }
}
