import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Rule } from "../../../src/discovery/index.js";
import { compileRule } from "../../../src/matching/compile.js";

const baseRule = (overrides: Partial<Rule> = {}): Rule => ({
	id: "/abs/.pi/rules/r.md",
	sourcePath: "/abs/.pi/rules/r.md",
	source: "pi",
	description: "d",
	globs: [],
	alwaysApply: false,
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

describe("compileRule — alwaysApply", () => {
	it("AC4a: alwaysApply true with empty globs matches every relative path", () => {
		const test = compileRule(baseRule({ alwaysApply: true, globs: [] }));
		expect(test("src/a.ts")).toBe(true);
		expect(test("docs/x.md")).toBe(true);
		expect(test("anything")).toBe(true);
	});

	it("AC4b: alwaysApply true ignores globs entirely", () => {
		const test = compileRule(baseRule({ alwaysApply: true, globs: ["src/**"] }));
		expect(test("docs/x.md")).toBe(true);
	});
});

describe("compileRule — globs (alwaysApply false)", () => {
	it("AC5a: globs match exact pattern, do not match other extensions", () => {
		const test = compileRule(baseRule({ globs: ["src/**/*.ts"] }));
		expect(test("src/a/b.ts")).toBe(true);
		expect(test("src/a/b.js")).toBe(false);
		expect(test("tests/a.ts")).toBe(false);
	});

	it("AC5b: array globs OR-join", () => {
		const test = compileRule(baseRule({ globs: ["src/**", "tests/**"] }));
		expect(test("src/a.ts")).toBe(true);
		expect(test("tests/a.ts")).toBe(true);
		expect(test("docs/a.md")).toBe(false);
	});

	it("AC5c: dot:true is set", () => {
		const test = compileRule(baseRule({ globs: [".pi/**"] }));
		expect(test(".pi/rules/x.md")).toBe(true);
	});

	it("AC5d: nonegate:true treats leading ! as literal, not negation", () => {
		const test = compileRule(baseRule({ globs: ["!src/legacy/**"] }));
		expect(test("src/app/x.ts")).toBe(false);
		expect(test("src/legacy/x.ts")).toBe(false);
	});
});

describe("compileRule — malformed globs", () => {
	it("AC3a + AC3b: !( does not throw, emits one stderr line, never matches", () => {
		const sourcePath = "/abs/.pi/rules/bad.md";
		const test = compileRule(baseRule({ sourcePath, globs: ["!("] }));
		expect(test("anything")).toBe(false);
		expect(stderr).toBe(`[pi-rules] invalid glob in ${sourcePath}: "!(" -- never matches\n`);
	});

	it("AC3c: one bad glob does not poison other globs", () => {
		const sourcePath = "/abs/.pi/rules/mixed.md";
		const test = compileRule(baseRule({ sourcePath, globs: ["src/**", "!("] }));
		expect(test("src/a.ts")).toBe(true);
		expect(stderr).toBe(`[pi-rules] invalid glob in ${sourcePath}: "!(" -- never matches\n`);
	});

	it("AC3d: literal-pattern globs (e.g. [unclosed) emit no warning", () => {
		const test = compileRule(baseRule({ globs: ["[unclosed"] }));
		expect(stderr).toBe("");
		expect(test("[unclosed")).toBe(true);
	});

	it("empty-string glob is treated as malformed (warned, dropped)", () => {
		const sourcePath = "/abs/.pi/rules/empty.md";
		const test = compileRule(baseRule({ sourcePath, globs: [""] }));
		expect(test("anything")).toBe(false);
		expect(stderr).toBe(`[pi-rules] invalid glob in ${sourcePath}: "" -- never matches\n`);
	});
});
