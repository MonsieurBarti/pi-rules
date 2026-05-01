---
name: rule-authoring
description: 'Author path-scoped rule files for pi-rules. Use when: creating/editing .pi/rules/*.md or .claude/rules/*.md | "add a project rule" | "write a pi rule" | designing always-on conventions. Triggers: "rule", "convention", "alwaysApply", "globs".'
---

# Rule Authoring

A rule file under `.pi/rules/` or `.claude/rules/` injects its body into the agent's context whenever a `read`, `edit`, or `write` tool fires on a path that matches its `globs` (or unconditionally, if `alwaysApply: true`).

The body ships on every match. Every saved sentence compounds across calls — terse rules are cheap, verbose rules are expensive. Aim for clarity first, then trim.

## Frontmatter

| Field | Type | Required | Default |
|---|---|---|---|
| `description` | string | always | — |
| `globs` | `string[]` (picomatch) | unless `alwaysApply: true` | — |
| `alwaysApply` | boolean | optional | `false` |

Invariants:
- A file with `globs: []` and `alwaysApply: false` is skipped (stderr warning). Set one or the other.
- `alwaysApply: true` makes `globs` optional. The rule fires on every `read`/`edit`/`write`.
- Globs are project-relative. Symlinks dedup by realpath.

## Style — terse but readable

Write like a concise teammate, not a research paper. Plain English; trim the filler.

| Do | Don't |
|---|---|
| Imperative: "Use X" | Second-person: "You should use X" |
| Tables for enumerations | Long bullet lists or paragraphs |
| State the rule, then the reason | Repeat the rule three ways |
| Code blocks for templates | Prose describing what a template looks like |

Drop:
- "please", "in order to", "make sure to"
- Restating the obvious ("when writing TypeScript, use TypeScript syntax")
- Closing summaries that paraphrase the rule

Target: ≤ 200 tokens per rule. Most rules need fewer.

### Why bother

The rule body is prepended to the tool result for every matching call. A 400-token rule that fires 50 times a session adds 20k tokens. A 100-token rule does the same job for 5k. The savings compound.

Optimize for a human reading the rule once a month, not for character count. If a sentence earns its keep, leave it.

## Examples

### Project rule (globs-scoped)

```md
---
description: TypeScript style for src/.
globs: ["src/**/*.ts"]
alwaysApply: false
---
Prefer named exports; no default exports.
Avoid `any` — use `unknown` and narrow.
Tests live in `tests/unit/`.
```

### Always-on rule

```md
---
description: Default voice.
alwaysApply: true
---
Be terse. State the result; skip the preamble. No filler.
```

## Avoid

- `globs: []` with `alwaysApply: false` — the file is silently skipped.
- Long paragraphs when a table works.
- Second-person scolding ("you must", "you should never").
- `alwaysApply: true` for rules that only matter sometimes — every tool call pays the cost.
- Duplicating bodies across files. Realpath dedup catches symlinks; it doesn't catch copy-paste.

## Discovery surface

Roots checked, in order: `<cwd>/.pi/rules`, `<cwd>/.claude/rules`, `~/.pi/rules`, `~/.claude/rules`.

Edits during a session are picked up on the next file change (the matcher recompiles automatically).

Run `/pi-rules doctor` to see which rules are loaded and why others were skipped.
