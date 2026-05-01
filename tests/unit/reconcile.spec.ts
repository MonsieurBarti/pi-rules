import { describe, expect, it } from "vitest";
import { reconcileInjectedIds } from "../../src/discovery/reconcile.js";
import type { Rule } from "../../src/discovery/types.js";

const rule = (id: string, body: string): Rule => ({
	id,
	sourcePath: id,
	source: "pi",
	description: "t",
	globs: ["**/*"],
	alwaysApply: false,
	body,
});

describe("reconcileInjectedIds", () => {
	it("keeps tracked id when rule body unchanged", () => {
		const prev = [rule("/a", "X")];
		const next = [rule("/a", "X")];
		const ids = new Set(["/a"]);
		reconcileInjectedIds(prev, next, ids);
		expect([...ids]).toEqual(["/a"]);
	});

	it("drops tracked id when rule body changed", () => {
		const prev = [rule("/a", "X")];
		const next = [rule("/a", "Y")];
		const ids = new Set(["/a"]);
		reconcileInjectedIds(prev, next, ids);
		expect([...ids]).toEqual([]);
	});

	it("drops tracked id when rule no longer present (deleted)", () => {
		const prev = [rule("/a", "X")];
		const next: Rule[] = [];
		const ids = new Set(["/a"]);
		reconcileInjectedIds(prev, next, ids);
		expect([...ids]).toEqual([]);
	});

	it("rename: old id dropped, new id absent (next match will inject)", () => {
		const prev = [rule("/a", "X")];
		const next = [rule("/b", "X")];
		const ids = new Set(["/a"]);
		reconcileInjectedIds(prev, next, ids);
		expect([...ids]).toEqual([]);
	});

	it("ignores ids in the set that have no prev/next rule (defensive)", () => {
		const prev: Rule[] = [];
		const next: Rule[] = [];
		const ids = new Set(["/ghost"]);
		reconcileInjectedIds(prev, next, ids);
		expect([...ids]).toEqual([]);
	});
});
