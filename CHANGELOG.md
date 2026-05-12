# Changelog

## [0.1.0](https://github.com/MonsieurBarti/pi-rules/compare/pi-rules-v0.0.3...pi-rules-v0.1.0) (2026-05-12)


### ⚠ BREAKING CHANGES

* 

### Features

* align rule frontmatter with Claude Code (paths instead of globs) ([1c98484](https://github.com/MonsieurBarti/pi-rules/commit/1c98484abfc83e0865d345847ea1f60149bb4335))
* align rule frontmatter with Claude Code (paths instead of globs) ([e7962b7](https://github.com/MonsieurBarti/pi-rules/commit/e7962b7f3436199fcdb0297722597080a9cae03e))

## [Unreleased]

### Breaking Changes

* **Frontmatter aligned with Claude Code**: `globs` replaced by `paths`, `alwaysApply` removed.
  - `paths` accepts `string` (comma-separated), `string[]` (YAML array), or can be omitted for always-on rules.
  - Legacy `globs` field is still parsed with a deprecation warning.
  - Legacy `alwaysApply` field is ignored with a deprecation warning.
  - Rule files without `paths` / `globs` are now always-on (injected on every `read`/`edit`/`write`).

## [0.0.3](https://github.com/MonsieurBarti/pi-rules/compare/pi-rules-v0.0.2...pi-rules-v0.0.3) (2026-05-01)


### Features

* rule discovery expansion (M01) ([4ef2e69](https://github.com/MonsieurBarti/pi-rules/commit/4ef2e6990b827dfe51aa6c4ba884f94218ef820d))
* rule discovery expansion (M01) ([f5ab055](https://github.com/MonsieurBarti/pi-rules/commit/f5ab05553e3dd13955a79fb61a161baae1768942))

## [0.0.2](https://github.com/MonsieurBarti/pi-rules/compare/pi-rules-v0.0.1...pi-rules-v0.0.2) (2026-05-01)


### Features

* ship MVP path-scoped rule loading (M01) ([51f136d](https://github.com/MonsieurBarti/pi-rules/commit/51f136d0812fa3a96d810a1323b95d46ced03715))
* ship MVP path-scoped rule loading (M01) ([5cdf6b3](https://github.com/MonsieurBarti/pi-rules/commit/5cdf6b3b6a155ef43f8620ebaa809afb804db244))
