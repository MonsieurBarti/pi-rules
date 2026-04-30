import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import piRulesExtension from "../../src/index.js";
import { clearInjectionLog, injectionLog } from "../../src/testing/injection-log.js";

type Handler = (e: unknown, ctx: unknown) => unknown | Promise<unknown>;

function makeFakePi() {
	const handlers = new Map<string, Handler[]>();
	return {
		on(name: string, h: Handler) {
			const list = handlers.get(name) ?? [];
			list.push(h);
			handlers.set(name, list);
		},
		registeredNames(): string[] {
			return [...handlers.keys()].sort();
		},
		registrationCount(): number {
			return [...handlers.values()].reduce((sum, list) => sum + list.length, 0);
		},
		async fire(name: string, e: unknown, ctx: unknown): Promise<unknown> {
			const list = handlers.get(name) ?? [];
			let last: unknown = undefined;
			for (const h of list) last = await h(e, ctx);
			return last;
		},
	};
}

function mkFixtureWithPiRule(globs: string[], body = "RULE_BODY"): string {
	const dir = mkdtempSync(path.join(os.tmpdir(), "pi-rules-s04-"));
	mkdirSync(path.join(dir, ".pi", "rules"), { recursive: true });
	const front = `---\ndescription: t\nglobs: ${JSON.stringify(globs)}\n---\n`;
	writeFileSync(path.join(dir, ".pi", "rules", "r.md"), front + body);
	return dir;
}

describe("piRulesExtension — registration & lifecycle", () => {
	let cleanup: Array<() => void> = [];
	beforeEach(() => clearInjectionLog());
	afterEach(() => {
		for (const fn of cleanup) fn();
		cleanup = [];
	});

	it("AC1a: default export is a 1-arg function", () => {
		expect(typeof piRulesExtension).toBe("function");
		expect(piRulesExtension.length).toBe(1);
	});

	it("AC1b: module exports only `default` (no other named exports)", async () => {
		const mod = await import("../../src/index.js");
		expect(Object.keys(mod)).toEqual(["default"]);
	});

	it("AC2a: registers exactly three handlers (session_start, tool_result, session_shutdown)", () => {
		const fp = makeFakePi();
		piRulesExtension(fp as any);
		expect(fp.registeredNames()).toEqual(["session_shutdown", "session_start", "tool_result"]);
		expect(fp.registrationCount()).toBe(3);
	});

	it("AC2d: session_shutdown nulls the matcher (subsequent tool_result returns void)", async () => {
		const fp = makeFakePi();
		piRulesExtension(fp as any);
		const dir = mkFixtureWithPiRule(["src/**"]);
		cleanup.push(() => rmSync(dir, { recursive: true, force: true }));

		await fp.fire("session_start", { type: "session_start", reason: "startup" }, { cwd: dir });
		await fp.fire("session_shutdown", { type: "session_shutdown", reason: "quit" }, { cwd: dir });

		const result = await fp.fire(
			"tool_result",
			{
				type: "tool_result",
				toolName: "read",
				toolCallId: "x",
				input: { path: "src/a.ts" },
				content: [{ type: "text", text: "ORIG" }],
				isError: false,
				details: undefined,
			},
			{ cwd: dir },
		);
		expect(result).toBeUndefined();
		expect(injectionLog).toHaveLength(0);
	});

	it("AC3a/AC3b: discover() throwing is caught + exactly one stderr line", async () => {
		const fp = makeFakePi();
		piRulesExtension(fp as any);
		const dir = mkdtempSync(path.join(os.tmpdir(), "pi-rules-s04-fail-"));
		cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
		// .pi/rules as a regular file (not a directory) — stat() resolves, then
		// walker.enumerateRuleFiles() calls readdir() on a non-directory → throws.
		mkdirSync(path.join(dir, ".pi"), { recursive: true });
		writeFileSync(path.join(dir, ".pi", "rules"), "not a directory");

		const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
		try {
			await fp.fire("session_start", { type: "session_start", reason: "startup" }, { cwd: dir });
			const piRulesLines = stderrSpy.mock.calls
				.map((c) => String(c[0]))
				.filter((s) => s.startsWith("[pi-rules] discovery failed: "));
			expect(piRulesLines).toHaveLength(1);
			expect(piRulesLines[0]).toMatch(/^\[pi-rules\] discovery failed: .+\n$/);
		} finally {
			stderrSpy.mockRestore();
		}

		const result = await fp.fire(
			"tool_result",
			{
				type: "tool_result",
				toolName: "read",
				toolCallId: "x",
				input: { path: "src/a.ts" },
				content: [],
				isError: false,
				details: undefined,
			},
			{ cwd: dir },
		);
		expect(result).toBeUndefined();
		expect(injectionLog).toHaveLength(0);
	});
});
