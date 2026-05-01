import { describe, expect, it } from "vitest";
import { format, hasErrors } from "../../../src/commands/doctor-format.js";
import type { Diagnostic } from "../../../src/discovery/index.js";
import type { Rule } from "../../../src/discovery/types.js";

const rule = (overrides: Partial<Rule> = {}): Rule => ({
	id: "/abs/.pi/rules/a.md",
	sourcePath: "/abs/.pi/rules/a.md",
	source: "pi",
	description: "d",
	globs: ["**/*.ts"],
	alwaysApply: false,
	body: "B",
	...overrides,
});

describe("format(DiscoverResult)", () => {
	it("empty: header only", () => {
		const out = format({ rules: [], diagnostics: [] });
		expect(out).toBe(
			"pi-rules doctor: OK — 0 rules, 0 errors, 0 skipped\n\n" +
				"Coverage:\n" +
				"  total rules:    0\n" +
				"  alwaysApply:    0\n" +
				"  glob-scoped:    0\n" +
				"  sources:        pi=0, claude=0",
		);
	});

	it("rules-only: header + Rules + Coverage; no Errors, no Skipped", () => {
		const out = format({
			rules: [
				rule({ id: "/abs/.pi/rules/a.md", sourcePath: "/abs/.pi/rules/a.md" }),
				rule({
					id: "/abs/.claude/rules/b.md",
					sourcePath: "/abs/.claude/rules/b.md",
					source: "claude",
					alwaysApply: true,
					globs: [],
				}),
			],
			diagnostics: [],
		});
		expect(out).toBe(
			"pi-rules doctor: OK — 2 rules, 0 errors, 0 skipped\n\n" +
				"Rules:\n" +
				"  [pi] /abs/.pi/rules/a.md\n" +
				"             globs: **/*.ts\n" +
				"             alwaysApply: false\n" +
				"  [claude] /abs/.claude/rules/b.md\n" +
				"             globs: (none)\n" +
				"             alwaysApply: true\n\n" +
				"Coverage:\n" +
				"  total rules:    2\n" +
				"  alwaysApply:    1\n" +
				"  glob-scoped:    1\n" +
				"  sources:        pi=1, claude=1",
		);
	});

	it("rules with realpath ≠ absPath: prints → <realpath> line", () => {
		const out = format({
			rules: [
				rule({
					id: "/real/target.md",
					sourcePath: "/abs/.pi/rules/link.md",
				}),
			],
			diagnostics: [],
		});
		expect(out).toContain("  [pi] /abs/.pi/rules/link.md\n");
		expect(out).toContain("             → /real/target.md\n");
	});

	it("errors-only: header ERRORS + Errors section + Coverage zeroed", () => {
		const diags: Diagnostic[] = [
			{
				kind: "parse_error",
				absPath: "/abs/.pi/rules/bad.md",
				source: "pi",
				reason: "invalid yaml: bad indent",
			},
			{
				kind: "unreadable",
				absPath: "/abs/.claude/rules/x.md",
				source: "claude",
				code: "EACCES",
			},
		];
		const out = format({ rules: [], diagnostics: diags });
		expect(out).toBe(
			"pi-rules doctor: ERRORS — 0 rules, 2 errors, 0 skipped\n\n" +
				"Errors:\n" +
				"  /abs/.pi/rules/bad.md\n" +
				"    invalid yaml: bad indent\n" +
				"  /abs/.claude/rules/x.md\n" +
				"    unreadable: EACCES\n\n" +
				"Coverage:\n" +
				"  total rules:    0\n" +
				"  alwaysApply:    0\n" +
				"  glob-scoped:    0\n" +
				"  sources:        pi=0, claude=0",
		);
	});

	it("skipped-only: header OK + Skipped section + Coverage zeroed", () => {
		const out = format({
			rules: [],
			diagnostics: [
				{
					kind: "skipped_no_frontmatter",
					absPath: "/abs/.pi/rules/plain.md",
					source: "pi",
				},
			],
		});
		expect(out).toBe(
			"pi-rules doctor: OK — 0 rules, 0 errors, 1 skipped\n\n" +
				"Skipped (no frontmatter):\n" +
				"  /abs/.pi/rules/plain.md\n\n" +
				"Coverage:\n" +
				"  total rules:    0\n" +
				"  alwaysApply:    0\n" +
				"  glob-scoped:    0\n" +
				"  sources:        pi=0, claude=0",
		);
	});

	it("mixed: rules + errors + skipped — all sections present, header ERRORS", () => {
		const out = format({
			rules: [rule()],
			diagnostics: [
				{
					kind: "parse_error",
					absPath: "/abs/x.md",
					source: "pi",
					reason: "missing description",
				},
				{ kind: "skipped_no_frontmatter", absPath: "/abs/y.md", source: "claude" },
			],
		});
		expect(out.startsWith("pi-rules doctor: ERRORS — 1 rules, 1 errors, 1 skipped\n")).toBe(true);
		expect(out).toContain("Rules:\n");
		expect(out).toContain("Errors:\n");
		expect(out).toContain("Skipped (no frontmatter):\n");
		expect(out).toContain("Coverage:\n");
	});
});

describe("hasErrors(DiscoverResult)", () => {
	it("false when no parse_error and no unreadable", () => {
		expect(hasErrors({ rules: [], diagnostics: [] })).toBe(false);
		expect(
			hasErrors({
				rules: [],
				diagnostics: [{ kind: "skipped_no_frontmatter", absPath: "/x", source: "pi" }],
			}),
		).toBe(false);
	});

	it("true when at least one parse_error", () => {
		expect(
			hasErrors({
				rules: [],
				diagnostics: [{ kind: "parse_error", absPath: "/x", source: "pi", reason: "y" }],
			}),
		).toBe(true);
	});

	it("true when at least one unreadable", () => {
		expect(
			hasErrors({
				rules: [],
				diagnostics: [{ kind: "unreadable", absPath: "/x", source: "pi", code: "EACCES" }],
			}),
		).toBe(true);
	});

	it("true when at least one symlink_escape", () => {
		expect(
			hasErrors({
				rules: [],
				diagnostics: [
					{
						kind: "symlink_escape",
						absPath: "/abs/.pi/rules/link.md",
						source: "pi",
						targetPath: "/etc/passwd",
					},
				],
			}),
		).toBe(true);
	});
});

describe("format(DiscoverResult) — symlink_escape", () => {
	it("symlink_escape: rendered under Errors with 'symlink escape: <targetPath>'", () => {
		const out = format({
			rules: [],
			diagnostics: [
				{
					kind: "symlink_escape",
					absPath: "/abs/.pi/rules/link.md",
					source: "pi",
					targetPath: "/etc/passwd",
				},
			],
		});
		expect(out).toBe(
			"pi-rules doctor: ERRORS — 0 rules, 1 errors, 0 skipped\n\n" +
				"Errors:\n" +
				"  /abs/.pi/rules/link.md\n" +
				"    symlink escape: /etc/passwd\n\n" +
				"Coverage:\n" +
				"  total rules:    0\n" +
				"  alwaysApply:    0\n" +
				"  glob-scoped:    0\n" +
				"  sources:        pi=0, claude=0",
		);
	});
});
