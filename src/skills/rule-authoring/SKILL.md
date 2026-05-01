---
name: rule-authoring
description: 'Author path-scoped rule files for pi-rules. Use when: creating/editing .pi/rules/*.md or .claude/rules/*.md | "add a project rule" | "write a pi rule" | designing always-on conventions. Triggers: "rule", "convention", "alwaysApply", "globs".'
---

# Rule Authoring

## Model

ρ := rule file ∈ {.pi/rules, .claude/rules}/**/*.md
inject(ρ, p) ⟺ tool ∈ {read,edit,write} ∧ (alwaysApply(ρ) ∨ p ∈ globs(ρ))
cost(ρ) := tokens(body(ρ)) × |matches(ρ)|
goal := min cost(ρ) — every char ships every match

## Frontmatter

| Field | Type | Required | Default |
|---|---|---|---|
| description | string | ∀ | — |
| globs | string[] (picomatch) | ¬alwaysApply | — |
| alwaysApply | bool | optional | false |

Invariants:
- ¬(globs=[] ∧ alwaysApply=false) → file skipped + stderr warn
- alwaysApply=true ⟹ globs optional; rule fires ∀ read/edit/write
- globs project-relative; symlinks dedup by realpath

## Body — ultra-compressed style

### Operators

| Sym | Meaning |
|---|---|
| ∀ ∃ | for all / exists |
| ∧ ∨ ¬ | and / or / not |
| → ⟺ | implies / iff |
| ∈ ∉ | element of |
| := | defined as |
| ≤ ≥ | bounds |

### Conventions

- imperative ¬second-person: "Use X" ¬"You should use X"
- tables > prose ∀ enumerations
- ¬filler: ¬"please" ¬"in order to" ¬restating the obvious
- code blocks ∀ templates
- target ≤ 200 tokens / rule

### Why

body ships ∀ match. n calls × m tokens = bloat. Saved tokens compound.

## Examples

### project rule

```md
---
description: TypeScript style for src/.
globs: ["src/**/*.ts"]
alwaysApply: false
---
∀ export: named ¬default. ¬any → unknown + narrow.
tests ∈ tests/unit. ¬console.log → logger.
```

### alwaysApply rule

```md
---
description: Default voice.
alwaysApply: true
---
Be terse. State result; ¬preamble. ¬filler.
```

## ¬do

- ¬ globs=[] ∧ ¬alwaysApply → file skipped
- ¬ paragraphs when table works
- ¬ "you" / "please"
- ¬ alwaysApply=true unless ∀ tool call benefits (cost > matched rules)
- ¬ duplicate bodies across files (realpath dedup catches symlinks; ¬ catches copy-paste)

## Discovery surface

roots := {cwd/.pi/rules, cwd/.claude/rules, ~/.pi/rules, ~/.claude/rules}
hot reload: edits mid-session → matcher recompiles
diagnostics: `/pi-rules doctor`
