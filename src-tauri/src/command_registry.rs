//! Keeps the Tauri command surface honest.
//!
//! A command exists in two places that the compiler never compares: the
//! `generate_handler!` list in `lib.rs`, and the `invoke("…")` call sites in
//! the frontend. Renaming one side leaves the other pointing at nothing, and
//! the failure only shows up at runtime as "command not found".
//!
//! These tests derive both sets from source rather than from a hand-kept list,
//! so there is no third copy to drift.

use std::{collections::BTreeSet, path::Path};

/// This file's own crate source, so the registered list is read from the real
/// `generate_handler!` invocation rather than a duplicate of it.
const LIB_SOURCE: &str = include_str!("lib.rs");

/// The command names passed to `tauri::generate_handler!` in `lib.rs`.
fn registered_commands() -> BTreeSet<String> {
    let (_, after) = LIB_SOURCE
        .split_once("generate_handler![")
        .expect("lib.rs no longer calls generate_handler!");
    let (list, _) = after
        .split_once(']')
        .expect("unterminated generate_handler! list");
    list.split(',')
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(String::from)
        .collect()
}

/// The command names the frontend passes to `invoke`.
///
/// Test files are skipped: they name commands they are mocking, including ones
/// deliberately never registered.
fn invoked_commands() -> BTreeSet<String> {
    let frontend = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri has no parent")
        .join("src");
    let mut sources = Vec::new();
    collect_sources(&frontend, &mut sources);
    assert!(
        !sources.is_empty(),
        "found no frontend sources under {}",
        frontend.display()
    );
    sources
        .iter()
        .flat_map(|source| invoked_in(source))
        .collect()
}

fn collect_sources(dir: &Path, out: &mut Vec<String>) {
    let entries = std::fs::read_dir(dir).unwrap_or_else(|e| panic!("{}: {e}", dir.display()));
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_sources(&path, out);
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_source = name.ends_with(".ts") || name.ends_with(".tsx");
        // `*.test.ts(x)` mock commands rather than calling them.
        if is_source && !name.contains(".test.") {
            out.push(std::fs::read_to_string(&path).expect("unreadable frontend source"));
        }
    }
}

/// Pulls the command name out of every `invoke("name")` — including the
/// `invoke<T>("name")` form, whose type argument may span lines.
///
/// The name must sit immediately inside the call parens. Anything looser also
/// matches `import { invoke } from "…"` and prose like `// invoke() rejects …`,
/// which then captures whatever string literal happens to come next.
fn invoked_in(source: &str) -> Vec<String> {
    let bytes = source.as_bytes();
    let mut names = Vec::new();
    for (index, _) in source.match_indices("invoke") {
        let mut cursor = index + "invoke".len();
        if bytes.get(cursor) == Some(&b'<') {
            let Some(close) = type_argument_end(bytes, cursor) else {
                continue;
            };
            cursor = close + 1;
        }
        cursor = skip_whitespace(bytes, cursor);
        if bytes.get(cursor) != Some(&b'(') {
            continue;
        }
        cursor = skip_whitespace(bytes, cursor + 1);
        if bytes.get(cursor) != Some(&b'"') {
            continue;
        }
        let after_quote = &source[cursor + 1..];
        let Some(end) = after_quote.find('"') else {
            continue;
        };
        names.push(after_quote[..end].to_string());
    }
    names
}

/// Index of the `>` closing the type argument that starts at `open`.
fn type_argument_end(bytes: &[u8], open: usize) -> Option<usize> {
    let mut depth = 0usize;
    for (offset, byte) in bytes[open..].iter().enumerate() {
        match byte {
            b'<' => depth += 1,
            b'>' => {
                depth -= 1;
                if depth == 0 {
                    return Some(open + offset);
                }
            }
            _ => {}
        }
    }
    None
}

fn skip_whitespace(bytes: &[u8], from: usize) -> usize {
    let mut cursor = from;
    while bytes.get(cursor).is_some_and(u8::is_ascii_whitespace) {
        cursor += 1;
    }
    cursor
}

#[cfg(test)]
mod tests {
    use super::{invoked_commands, registered_commands};

    #[test]
    fn every_command_the_frontend_invokes_is_registered() {
        let registered = registered_commands();

        let missing: Vec<_> = invoked_commands()
            .into_iter()
            .filter(|name| !registered.contains(name))
            .collect();

        assert!(
            missing.is_empty(),
            "frontend invokes commands that `generate_handler!` does not register: {missing:?}"
        );
    }

    #[test]
    fn every_registered_command_is_reachable_from_the_frontend() {
        let invoked = invoked_commands();

        let unused: Vec<_> = registered_commands()
            .into_iter()
            .filter(|name| !invoked.contains(name))
            .collect();

        // A registered command nothing calls is either dead or evidence that a
        // call site was renamed and its command left behind.
        assert!(
            unused.is_empty(),
            "registered commands no frontend code invokes: {unused:?}"
        );
    }

    #[test]
    fn the_command_surface_is_read_from_real_source() {
        // Guards the parsers themselves: if either stops finding anything, the
        // two tests above would pass vacuously.
        assert!(registered_commands().contains("close_browsers"));
        assert!(invoked_commands().contains("close_browsers"));
    }
}
