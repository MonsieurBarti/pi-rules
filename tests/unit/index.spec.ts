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

describe("piRulesExtension — tool_result", () => {
	let cleanup: Array<() => void> = [];
	beforeEach(() => clearInjectionLog());
	afterEach(() => {
		for (const fn of cleanup) fn();
		cleanup = [];
		clearInjectionLog();
	});

	function readResult(
		input: Record<string, unknown>,
		opts: Partial<{
			isError: boolean;
			content: Array<{ type: "text"; text: string }>;
			toolName: string;
			toolCallId: string;
		}> = {},
	) {
		return {
			type: "tool_result" as const,
			toolName: opts.toolName ?? "read",
			toolCallId: opts.toolCallId ?? "tc-1",
			input,
			content: opts.content ?? [{ type: "text", text: "ORIG" }],
			isError: opts.isError ?? false,
			details: undefined,
		};
	}

	function assertPosixRelativePaths() {
		expect(injectionLog.every((e) => !/^\//.test(e.path) && !/\\/.test(e.path))).toBe(true);
	}

	it("AC2b/AC7a/AC9a/AC9b: matching rule injects with cwd-relative POSIX path", async () => {
		const dir = mkFixtureWithPiRule(["src/**"], "RULE_BODY");
		cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
		const fp = makeFakePi();
		piRulesExtension(fp as any);
		await fp.fire("session_start", {}, { cwd: dir });

		const result = await fp.fire("tool_result", readResult({ path: "src/a.ts" }), { cwd: dir });
		expect(result).toEqual({
			content: [
				{ type: "text", text: "RULE_BODY" },
				{ type: "text", text: "ORIG" },
			],
		});
		expect(injectionLog).toHaveLength(1);
		expect(injectionLog[0].path).toBe("src/a.ts");
		const { realpath } = await import("node:fs/promises");
		expect(injectionLog[0].ruleId).toBe(await realpath(path.join(dir, ".pi", "rules", "r.md")));
		assertPosixRelativePaths();
	});

	it("AC4: tool_result with isError:true skips injection and preserves dedup budget", async () => {
		const dir = mkFixtureWithPiRule(["src/**"]);
		cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
		const fp = makeFakePi();
		piRulesExtension(fp as any);
		await fp.fire("session_start", {}, { cwd: dir });

		const errResult = await fp.fire(
			"tool_result",
			readResult({ path: "src/a.ts" }, { isError: true }),
			{ cwd: dir },
		);
		expect(errResult).toBeUndefined();
		expect(injectionLog).toHaveLength(0);

		const okResult = await fp.fire("tool_result", readResult({ path: "src/a.ts" }), { cwd: dir });
		expect(okResult).not.toBeUndefined();
		expect(injectionLog).toHaveLength(1);
	});

	it.each(["bash", "grep", "find", "ls", "myCustomTool"])(
		"AC5a: tool_result for %s does not inject",
		async (toolName) => {
			const dir = mkFixtureWithPiRule(["**"]);
			cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
			const fp = makeFakePi();
			piRulesExtension(fp as any);
			await fp.fire("session_start", {}, { cwd: dir });

			const result = await fp.fire("tool_result", readResult({ path: "src/a.ts" }, { toolName }), {
				cwd: dir,
			});
			expect(result).toBeUndefined();
			expect(injectionLog).toHaveLength(0);
		},
	);

	it.each(["read", "edit", "write"] as const)(
		"AC5b: tool_result for %s injects when matched",
		async (toolName) => {
			const dir = mkFixtureWithPiRule(["src/**"]);
			cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
			const fp = makeFakePi();
			piRulesExtension(fp as any);
			await fp.fire("session_start", {}, { cwd: dir });

			const result = await fp.fire("tool_result", readResult({ path: "src/a.ts" }, { toolName }), {
				cwd: dir,
			});
			expect(result).not.toBeUndefined();
			expect(injectionLog).toHaveLength(1);
		},
	);

	it("AC6a: relative path resolves against ctx.cwd", async () => {
		const dir = mkFixtureWithPiRule(["src/**"]);
		cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
		const fp = makeFakePi();
		piRulesExtension(fp as any);
		await fp.fire("session_start", {}, { cwd: dir });
		await fp.fire("tool_result", readResult({ path: "src/a.ts" }), { cwd: dir });
		expect(injectionLog).toHaveLength(1);
		expect(injectionLog[0].path).toBe("src/a.ts");
		assertPosixRelativePaths();
	});

	it("AC6b: absolute path inside cwd matches identically", async () => {
		const dir = mkFixtureWithPiRule(["src/**"]);
		cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
		const fp = makeFakePi();
		piRulesExtension(fp as any);
		await fp.fire("session_start", {}, { cwd: dir });
		const abs = path.join(dir, "src", "a.ts");
		await fp.fire("tool_result", readResult({ path: abs }), { cwd: dir });
		expect(injectionLog).toHaveLength(1);
		expect(injectionLog[0].path).toBe("src/a.ts");
		assertPosixRelativePaths();
	});

	it("AC6c: path resolving outside cwd returns void", async () => {
		const dir = mkFixtureWithPiRule(["**"]);
		cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
		const fp = makeFakePi();
		piRulesExtension(fp as any);
		await fp.fire("session_start", {}, { cwd: dir });
		const result = await fp.fire("tool_result", readResult({ path: "/etc/hosts" }), { cwd: dir });
		expect(result).toBeUndefined();
		expect(injectionLog).toHaveLength(0);
	});

	it("AC6d: empty-string path returns void", async () => {
		const dir = mkFixtureWithPiRule(["**"]);
		cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
		const fp = makeFakePi();
		piRulesExtension(fp as any);
		await fp.fire("session_start", {}, { cwd: dir });
		const result = await fp.fire("tool_result", readResult({ path: "" }), { cwd: dir });
		expect(result).toBeUndefined();
		expect(injectionLog).toHaveLength(0);
	});

	it.each([
		["undefined", undefined],
		["number", 42],
		["object", { nested: "x" }],
	])("AC6e: non-string path (%s) returns void", async (_label, badPath) => {
		const dir = mkFixtureWithPiRule(["**"]);
		cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
		const fp = makeFakePi();
		piRulesExtension(fp as any);
		await fp.fire("session_start", {}, { cwd: dir });
		const result = await fp.fire(
			"tool_result",
			readResult({ path: badPath as unknown as string }),
			{ cwd: dir },
		);
		expect(result).toBeUndefined();
		expect(injectionLog).toHaveLength(0);
	});

	it("AC7c: zero rules matched returns undefined (not {content: e.content})", async () => {
		const dir = mkFixtureWithPiRule(["docs/**"]);
		cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
		const fp = makeFakePi();
		piRulesExtension(fp as any);
		await fp.fire("session_start", {}, { cwd: dir });
		const result = await fp.fire("tool_result", readResult({ path: "src/a.ts" }), { cwd: dir });
		expect(result).toBeUndefined();
	});

	it("AC7b: pi-source rule appears before claude-source rule in content", async () => {
		const dir = mkdtempSync(path.join(os.tmpdir(), "pi-rules-s04-mixed-"));
		cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
		mkdirSync(path.join(dir, ".pi", "rules"), { recursive: true });
		mkdirSync(path.join(dir, ".claude", "rules"), { recursive: true });
		writeFileSync(
			path.join(dir, ".pi", "rules", "p.md"),
			'---\ndescription: p\nglobs: ["**"]\n---\nPI_BODY',
		);
		writeFileSync(
			path.join(dir, ".claude", "rules", "c.md"),
			'---\ndescription: c\nglobs: ["**"]\n---\nCLAUDE_BODY',
		);
		const fp = makeFakePi();
		piRulesExtension(fp as any);
		await fp.fire("session_start", {}, { cwd: dir });
		const result = (await fp.fire("tool_result", readResult({ path: "x.ts" }), { cwd: dir })) as {
			content: Array<{ type: "text"; text: string }>;
		};
		expect(result.content[0].text).toBe("PI_BODY");
		expect(result.content[1].text).toBe("CLAUDE_BODY");
	});

	it("AC8a: rule injects once across two events on different paths", async () => {
		const dir = mkFixtureWithPiRule(["src/**"]);
		cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
		const fp = makeFakePi();
		piRulesExtension(fp as any);
		await fp.fire("session_start", {}, { cwd: dir });
		const r1 = await fp.fire("tool_result", readResult({ path: "src/a.ts" }), { cwd: dir });
		const r2 = await fp.fire("tool_result", readResult({ path: "src/b.ts" }), { cwd: dir });
		expect(r1).not.toBeUndefined();
		expect(r2).toBeUndefined();
		expect(injectionLog).toHaveLength(1);
		assertPosixRelativePaths();
	});

	it("AC8b: rule injects once across two events on the same path", async () => {
		const dir = mkFixtureWithPiRule(["src/**"]);
		cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
		const fp = makeFakePi();
		piRulesExtension(fp as any);
		await fp.fire("session_start", {}, { cwd: dir });
		const r1 = await fp.fire("tool_result", readResult({ path: "src/a.ts" }), { cwd: dir });
		const r2 = await fp.fire("tool_result", readResult({ path: "src/a.ts" }), { cwd: dir });
		expect(r1).not.toBeUndefined();
		expect(r2).toBeUndefined();
		expect(injectionLog).toHaveLength(1);
		assertPosixRelativePaths();
	});

	it("AC8c: two-rule scenario; event 2 returns undefined (not wrapped)", async () => {
		const dir = mkdtempSync(path.join(os.tmpdir(), "pi-rules-s04-2rules-"));
		cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
		mkdirSync(path.join(dir, ".pi", "rules"), { recursive: true });
		writeFileSync(
			path.join(dir, ".pi", "rules", "a.md"),
			'---\ndescription: a\nglobs: ["src/**"]\n---\nA_BODY',
		);
		writeFileSync(
			path.join(dir, ".pi", "rules", "b.md"),
			'---\ndescription: b\nglobs: ["src/a.ts"]\n---\nB_BODY',
		);
		const fp = makeFakePi();
		piRulesExtension(fp as any);
		await fp.fire("session_start", {}, { cwd: dir });

		const r1 = await fp.fire("tool_result", readResult({ path: "src/a.ts" }), { cwd: dir });
		expect(r1).not.toBeUndefined();
		expect(injectionLog).toHaveLength(2);

		const r2 = await fp.fire("tool_result", readResult({ path: "src/b.ts" }), { cwd: dir });
		expect(r2).toBeUndefined();
		expect(injectionLog).toHaveLength(2);
		assertPosixRelativePaths();
	});

	it("AC8d: dedup resets across session_shutdown + session_start", async () => {
		const dir = mkFixtureWithPiRule(["src/**"]);
		cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
		const fp = makeFakePi();
		piRulesExtension(fp as any);

		await fp.fire("session_start", {}, { cwd: dir });
		await fp.fire("tool_result", readResult({ path: "src/a.ts" }), { cwd: dir });
		await fp.fire("session_shutdown", {}, { cwd: dir });

		await fp.fire("session_start", {}, { cwd: dir });
		await fp.fire("tool_result", readResult({ path: "src/a.ts" }), { cwd: dir });

		expect(injectionLog).toHaveLength(2);
		expect(injectionLog[0].ruleId).toBe(injectionLog[1].ruleId);
		assertPosixRelativePaths();
	});

	it("AC2c: session_start clears injectedIds before re-discovering", async () => {
		const dir = mkFixtureWithPiRule(["src/**"]);
		cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
		const fp = makeFakePi();
		piRulesExtension(fp as any);
		await fp.fire("session_start", {}, { cwd: dir });
		await fp.fire("tool_result", readResult({ path: "src/a.ts" }), { cwd: dir });
		await fp.fire("session_shutdown", {}, { cwd: dir });
		await fp.fire("session_start", {}, { cwd: dir });
		await fp.fire("tool_result", readResult({ path: "src/a.ts" }), { cwd: dir });
		expect(injectionLog).toHaveLength(2);
	});
});
