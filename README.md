<div align="center">
  <img src="https://raw.githubusercontent.com/MonsieurBarti/The-Forge-Flow-CC/refs/heads/main/assets/forge-banner.png" alt="The Forge Flow" width="100%">

  <h1>📐 @the-forge-flow/pi-rules</h1>

  <p>
    <strong>Auto-load path-scoped rule files for the PI coding agent</strong>
  </p>

  <p>
    <a href="https://github.com/MonsieurBarti/pi-rules/actions/workflows/ci.yml">
      <img src="https://img.shields.io/github/actions/workflow/status/MonsieurBarti/pi-rules/ci.yml?label=CI&style=flat-square" alt="CI Status">
    </a>
    <a href="https://www.npmjs.com/package/@the-forge-flow/pi-rules">
      <img src="https://img.shields.io/npm/v/@the-forge-flow/pi-rules?style=flat-square" alt="npm version">
    </a>
    <a href="LICENSE">
      <img src="https://img.shields.io/github/license/MonsieurBarti/pi-rules?style=flat-square" alt="License">
    </a>
  </p>
</div>

---

PI extension that auto-loads path-scoped rule files from `.pi/rules/` and `.claude/rules/`. When the agent reads, edits, or writes a file, every rule whose `globs` match that path is injected into the context for that turn.

## Install

```bash
pi install npm:@the-forge-flow/pi-rules
```

## Quickstart

1. Create `.pi/rules/style.md`:

```md
---
description: TypeScript style for src/.
globs: ["src/**/*.ts"]
alwaysApply: false
---
Prefer named exports. Avoid `any`.
```

2. Run `pi -p "Read src/index.ts"`.
3. The rule body now prefaces the tool's read result.

## Rule format

```yaml
---
description: Short summary
globs: ["src/**/*.ts"]
alwaysApply: false
---
Body markdown here. Injected verbatim when the rule fires.
```

- `description` — required string.
- `globs` — required `string[]` of picomatch-compatible, project-relative patterns, **unless** `alwaysApply: true`.
- `alwaysApply` — optional boolean, default `false`.

## Matching & injection

When `read` / `edit` / `write` fires on a path, every matching rule (or `alwaysApply: true` rule) prepends its body to the tool's result for the next model turn. No precedence: all matching rules apply, in discovery order. Once-per-session dedup keyed by realpath.

## Two directories, one format

`.pi/rules/` and `.claude/rules/` are both first-class. They behave identically and may both be present. A rule symlinked between them counts once (realpath identity).

## Limitations

- Compaction-survival: if pi-coding-agent compacts the conversation, injected text is dropped. Not re-injected.
- Hot reload: rule edits during a session take effect at the next `session_start`.
- Once-per-session dedup is by realpath. Two independent files with identical bodies inject twice.
- No precedence / conflict resolution. All matching rules apply, in input order.
- Per-user rules (`~/.pi/rules`, `~/.claude/rules`) are not supported.
- Parse errors (invalid YAML, missing `description`, `globs: []` with `alwaysApply: false`) skip the file with a stderr warning. Discovery does not abort.
- Custom tools (`bash`, `grep`, `find`, `ls`, custom) do not trigger injection. Only `read` / `edit` / `write`.

## Migrating from `.claude/rules/`

Already have `.claude/rules/`? Install the package — same files, same matching, no migration needed. The format on this page is the one used in `.pi/rules/`. If your existing files use a different convention (no frontmatter, etc.), they'll be skipped with a stderr warning until you add the frontmatter shown above.

## Development

```bash
bun install
bun run check     # biome lint + format
bun test
bun run build
```

`bun run test:e2e` exercises the extension under the live `pi` binary. Requires a working `pi` provider config (e.g., `FIREWORKS_API_KEY`) and the `pi` binary on disk via `bun install`. Costs a few cents per run. Not run in CI. If the test fails because the model declined to call the `read` tool (rare, but cheap fast models occasionally ask for clarification), re-run.

## License

MIT
