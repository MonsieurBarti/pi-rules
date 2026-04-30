import { describe, expect, it } from "vitest";
import type { Rule } from "../../../src/discovery/index.js";
import { type Matcher, compileMatcher } from "../../../src/matching/index.js";

const rule = (id: string, overrides: Partial<Rule> = {}): Rule => ({
	id: `/abs/${id}.md`,
	sourcePath: `/abs/${id}.md`,
	source: "pi",
	description: id,
	globs: [],
	alwaysApply: false,
	body: "",
	...overrides,
});

describe("compileMatcher — public surface", () => {
	it("AC1a: returns a Matcher with match()", () => {
		const m: Matcher = compileMatcher([]);
		expect(typeof m.match).toBe("function");
	});

	it("AC2: empty rules returns matcher whose match() always returns []", () => {
		const m = compileMatcher([]);
		expect(m.match("/cwd/src/a.ts", "/cwd")).toEqual([]);
	});
});

describe("compileMatcher — defensive guards", () => {
	it("AC6d: returns [] when cwd is empty string", () => {
		const r = rule("r", { alwaysApply: true });
		const m = compileMatcher([r]);
		expect(m.match("/abs/src/a.ts", "")).toEqual([]);
	});

	it("AC6e: returns [] when absPath is not absolute", () => {
		const r = rule("r", { alwaysApply: true });
		const m = compileMatcher([r]);
		expect(m.match("src/a.ts", "/cwd")).toEqual([]);
	});

	it("AC4c: alwaysApply rule still returns [] for paths outside cwd", () => {
		const r = rule("r", { alwaysApply: true });
		const m = compileMatcher([r]);
		expect(m.match("/outside/x.ts", "/cwd")).toEqual([]);
	});
});

describe("compileMatcher — matching", () => {
	it("returns matching rules for paths inside cwd", () => {
		const a = rule("a", { globs: ["src/**"] });
		const m = compileMatcher([a]);
		expect(m.match("/cwd/src/x.ts", "/cwd")).toEqual([a]);
		expect(m.match("/cwd/docs/x.md", "/cwd")).toEqual([]);
	});

	it("AC7: returns rules in input order", () => {
		const a = rule("a", { globs: ["**/*.ts"] });
		const b = rule("b", { globs: ["docs/**"] });
		const c = rule("c", { globs: ["src/**"] });
		const m = compileMatcher([a, b, c]);
		expect(m.match("/cwd/src/x.ts", "/cwd")).toEqual([a, c]);
	});
});
