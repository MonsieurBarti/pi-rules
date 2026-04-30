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

## What it does

PI extension that auto-loads path-scoped rule files into the [pi-mono coding agent](https://github.com/badlogic/pi-mono), mirroring the `.claude/rules/` mechanism in Claude Code.

Two directories are supported:

- `.pi/rules/` — native location
- `.claude/rules/` — works identically, so projects already using Claude Code rules get picked up without migration

Rules are matched by path globs and injected into the agent's context when relevant files are touched.

## Status

Bootstrapping — extension entry point is scaffolded; rule discovery and matching land in the first milestone.

## Install

```bash
pi install npm:@the-forge-flow/pi-rules
```

## Development

```bash
bun install
bun run check     # biome lint + format
bun test
bun run build
```

## License

MIT
