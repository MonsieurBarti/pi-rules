import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Rule } from "../../../src/discovery/index.js";
import { compileRule } from "../../../src/matching/compile.js";

const baseRule = (overrides: Partial<Rule> = {}): Rule => ({
	id: "/abs/.pi/rules/r.md",
	sourcePath: "/abs/.pi/rules/r.md",
	source: "pi",
	description: "d",
	paths: [],
	body: "",
	...overrides,
});

let stderr: string;
beforeEach(() => {
	stderr = "";
	vi.spyOn(process.stderr, "write").mockImplementation(((chunk: string | Uint8Array) => {
		stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
		return true;
	}) as never);
});
afterEach(() => vi.restoreAllMocks());

describe("compileRule — always-on (empty paths)", () => {
	it("AC4a: empty paths matches every relative path", () => {
		const test = compileRule(baseRule({ paths: [] }));
		expect(test("src/a.ts")).toBe(true);
		expect(test("docs/x.md")).toBe(true);
		expect(test("anything")).toBe(true);
	});
});

describe("compileRule — paths (scoped)", () => {
	it("AC5a: paths match exact pattern, do not match other extensions", () => {
		const test = compileRule(baseRule({ paths: ["src/**/*.ts"] }));
		expect(test("src/a/b.ts")).toBe(true);
		expect(test("src/a/b.js")).toBe(false);
		expect(test("tests/a.ts")).toBe(false);
	});

	it("AC5b: array paths OR-join", () => {
		const test = compileRule(baseRule({ paths: ["src/**", "tests/**"] }));
		expect(test("src/a.ts")).toBe(true);
		expect(test("tests/a.ts")).toBe(true);
		expect(test("docs/a.md")).toBe(false);
	});

	it("AC5c: dot:true is set", () => {
		const test = compileRule(baseRule({ paths: [".pi/**"] }));
		expect(test(".pi/rules/x.md")).toBe(true);
	});

	it("AC5d: nonegate:true treats leading ! as literal, not negation", () => {
		const test = compileRule(baseRule({ paths: ["!src/legacy/**"] }));
		expect(test("src/app/x.ts")).toBe(false);
		expect(test("src/legacy/x.ts")).toBe(false);
	});
});

describe("compileRule — malformed paths", () => {
	it("AC3a + AC3b: !( does not throw, emits one stderr line, never matches", () => {
		const sourcePath = "/abs/.pi/rules/bad.md";
		const test = compileRule(baseRule({ sourcePath, paths: ["!("] }));
		expect(test("anything")).toBe(false);
		expect(stderr).toBe(`[pi-rules] invalid glob in "${sourcePath}": "!(" -- never matches\n`);
	});

	it("AC3c: one bad path does not poison other paths", () => {
		const sourcePath = "/abs/.pi/rules/mixed.md";
		const test = compileRule(baseRule({ sourcePath, paths: ["src/**", "!("] }));
		expect(test("src/a.ts")).toBe(true);
		expect(stderr).toBe(`[pi-rules] invalid glob in "${sourcePath}": "!(" -- never matches\n`);
	});

	it("AC3d: literal-pattern paths (e.g. [unclosed) emit no warning", () => {
		const test = compileRule(baseRule({ paths: ["[unclosed"] }));
		expect(stderr).toBe("");
		expect(test("[unclosed")).toBe(true);
	});

	it("empty-string path is treated as malformed (warned, dropped)", () => {
		const sourcePath = "/abs/.pi/rules/empty.md";
		const test = compileRule(baseRule({ sourcePath, paths: [""] }));
		expect(test("anything")).toBe(false);
		expect(stderr).toBe(`[pi-rules] invalid glob in "${sourcePath}": "" -- never matches\n`);
	});

	it("AC3e: malicious sourcePath with newline/escape chars cannot forge log lines", () => {
		const sourcePath = "/abs/.pi/rules/foo\n[pi-rules] FORGED: bar.md";
		const test = compileRule(baseRule({ sourcePath, paths: ["!("] }));
		expect(test("anything")).toBe(false);
		// Embedded newline and escapes are JSON-quoted, so the warning remains a single line.
		expect(stderr.split("\n").filter((l) => l.length > 0)).toHaveLength(1);
		expect(stderr).toBe(
			`[pi-rules] invalid glob in ${JSON.stringify(sourcePath)}: "!(" -- never matches\n`,
		);
	});
});
