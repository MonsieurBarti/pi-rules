import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import piRulesExtension, { makeExtension } from "../../src/index.js";
import { clearInjectionLog, injectionLog } from "../../src/testing/injection-log.js";
import { makeFakePi } from "../_helpers/fake-pi.js";

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

	it("AC1b: module exports `default` and `makeExtension` (DI seam, no others)", async () => {
		const mod = await import("../../src/index.js");
		expect(Object.keys(mod).sort()).toEqual(["default", "makeExtension"]);
	});

	it("AC2a: registers exactly four handlers (resources_discover, session_start, tool_result, session_shutdown)", () => {
		const fp = makeFakePi();
		piRulesExtension(fp as any);
		expect(fp.registeredNames()).toEqual([
			"resources_discover",
			"session_shutdown",
			"session_start",
			"tool_result",
		]);
		expect(fp.registrationCount()).toBe(4);
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

describe("piRulesExtension — integration smoke (AC12)", () => {
	let dir: string;
	beforeEach(() => {
		clearInjectionLog();
		dir = mkdtempSync(path.join(os.tmpdir(), "pi-rules-s04-int-"));
		mkdirSync(path.join(dir, ".pi", "rules"), { recursive: true });
		mkdirSync(path.join(dir, ".claude", "rules"), { recursive: true });
		writeFileSync(
			path.join(dir, ".pi", "rules", "pi-rule.md"),
			'---\ndescription: pi\nglobs: ["src/**"]\n---\nPI_BODY',
		);
		writeFileSync(
			path.join(dir, ".pi", "rules", "always.md"),
			"---\ndescription: a\nalwaysApply: true\n---\nALWAYS_BODY",
		);
		writeFileSync(
			path.join(dir, ".claude", "rules", "claude-rule.md"),
			'---\ndescription: cl\nglobs: ["docs/**"]\n---\nCLAUDE_BODY',
		);
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
		clearInjectionLog();
	});

	function readResult(
		input: Record<string, unknown>,
		opts: Partial<{ toolName: string; toolCallId: string }> = {},
	) {
		return {
			type: "tool_result" as const,
			toolName: opts.toolName ?? "read",
			toolCallId: opts.toolCallId ?? "tc-1",
			input,
			content: [{ type: "text", text: "ORIG" }],
			isError: false,
			details: undefined,
		};
	}

	it("AC12: real discover → compileMatcher → three tool_results produces expected injection log", async () => {
		const fp = makeFakePi();
		piRulesExtension(fp as any);
		await fp.fire("session_start", {}, { cwd: dir });

		// Event 1: read src/a.ts → pi-rule + always inject (length 2)
		await fp.fire("tool_result", readResult({ path: "src/a.ts" }), { cwd: dir });
		// Event 2: edit docs/a.md → claude-rule injects (always already deduped)
		await fp.fire("tool_result", readResult({ path: "docs/a.md" }, { toolName: "edit" }), {
			cwd: dir,
		});
		// Event 3: write any.ts → no rule matches (always already deduped, others don't match)
		await fp.fire("tool_result", readResult({ path: "any.ts" }, { toolName: "write" }), {
			cwd: dir,
		});

		const { realpath } = await import("node:fs/promises");
		const piRuleId = await realpath(path.join(dir, ".pi", "rules", "pi-rule.md"));
		const alwaysId = await realpath(path.join(dir, ".pi", "rules", "always.md"));
		const claudeId = await realpath(path.join(dir, ".claude", "rules", "claude-rule.md"));

		expect(injectionLog).toHaveLength(3);
		expect(injectionLog).toEqual(
			expect.arrayContaining([
				{ path: "src/a.ts", ruleId: piRuleId },
				{ path: "src/a.ts", ruleId: alwaysId },
				{ path: "docs/a.md", ruleId: claudeId },
			]),
		);
	});
});

type FakeRuntimeWatcher = { emitChange: () => void; close: () => void; closed: boolean };
function makeFakeWatchFactory() {
	const created: FakeRuntimeWatcher[] = [];
	// biome-ignore lint/suspicious/noExplicitAny: test fake
	const factory: any = (_p: string, _opts: unknown, listener?: any) => {
		const lst = typeof _opts === "function" ? _opts : listener;
		const w: FakeRuntimeWatcher & {
			on: (n: string, h: (...a: unknown[]) => void) => unknown;
		} = {
			closed: false,
			close() {
				this.closed = true;
			},
			on() {
				return this;
			},
			emitChange() {
				lst?.("change", "r.md");
			},
		};
		created.push(w);
		return w;
	};
	return { factory, created };
}

describe("runtime stderr parity (M01-S03)", () => {
	it("session_start: emits warn lines for parse_error, silent for skipped_no_frontmatter", async () => {
		const tmp = mkdtempSync(path.join(os.tmpdir(), "pi-rules-rt-"));
		const dir = path.join(tmp, ".pi/rules");
		mkdirSync(dir, { recursive: true });
		writeFileSync(path.join(dir, "no-desc.md"), '---\nglobs: ["**/*"]\n---\n');
		writeFileSync(path.join(dir, "plain.md"), "no frontmatter\n");

		const lines: string[] = [];
		const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
			lines.push(String(chunk));
			return true;
		});
		try {
			const fp = makeFakePi();
			const { factory } = makeFakeWatchFactory();
			// biome-ignore lint/suspicious/noExplicitAny: test fake
			makeExtension({ watchFactory: factory, debounceMs: 10 })(fp as any);
			await fp.fire("session_start", { type: "session_start", reason: "startup" }, { cwd: tmp });
		} finally {
			stderrSpy.mockRestore();
		}
		const piRulesLines = lines.filter((l) => l.startsWith("[pi-rules] skipped"));
		expect(piRulesLines).toEqual([
			"[pi-rules] skipped .pi/rules/no-desc.md: missing description\n",
		]);
		rmSync(tmp, { recursive: true, force: true });
	});

	it("session_start: emits unreadable: <code> when realpath fails (broken symlink)", async () => {
		if (process.platform === "win32") return;
		const tmp = mkdtempSync(path.join(os.tmpdir(), "pi-rules-rt-"));
		const dir = path.join(tmp, ".pi/rules");
		mkdirSync(dir, { recursive: true });
		const fs = await import("node:fs/promises");
		await fs.symlink(path.join(tmp, "missing-target"), path.join(dir, "ghost.md"));
		const lines: string[] = [];
		const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
			lines.push(String(chunk));
			return true;
		});
		try {
			const fp = makeFakePi();
			const { factory } = makeFakeWatchFactory();
			// biome-ignore lint/suspicious/noExplicitAny: test fake
			makeExtension({ watchFactory: factory, debounceMs: 10 })(fp as any);
			await fp.fire("session_start", { type: "session_start", reason: "startup" }, { cwd: tmp });
		} finally {
			stderrSpy.mockRestore();
		}
		expect(lines.filter((l) => l.startsWith("[pi-rules] skipped"))).toEqual([
			"[pi-rules] skipped .pi/rules/ghost.md: unreadable: ENOENT\n",
		]);
		rmSync(tmp, { recursive: true, force: true });
	});

	it("session_start: emits 'symlink escape: <target>' for symlink resolving outside rule roots", async () => {
		if (process.platform === "win32") return;
		const tmp = mkdtempSync(path.join(os.tmpdir(), "pi-rules-rt-"));
		const dir = path.join(tmp, ".pi/rules");
		mkdirSync(dir, { recursive: true });
		const fs = await import("node:fs/promises");
		const outsideTarget = path.join(tmp, "outside.md");
		writeFileSync(outsideTarget, '---\ndescription: x\nglobs: ["**/*"]\n---\n');
		await fs.symlink(outsideTarget, path.join(dir, "escape.md"));
		const realTarget = await fs.realpath(outsideTarget);
		const lines: string[] = [];
		const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
			lines.push(String(chunk));
			return true;
		});
		try {
			const fp = makeFakePi();
			const { factory } = makeFakeWatchFactory();
			// biome-ignore lint/suspicious/noExplicitAny: test fake
			makeExtension({ watchFactory: factory, debounceMs: 10 })(fp as any);
			await fp.fire("session_start", { type: "session_start", reason: "startup" }, { cwd: tmp });
		} finally {
			stderrSpy.mockRestore();
		}
		expect(lines.filter((l) => l.startsWith("[pi-rules] skipped"))).toEqual([
			`[pi-rules] skipped .pi/rules/escape.md: symlink escape: ${realTarget}\n`,
		]);
		rmSync(tmp, { recursive: true, force: true });
	});

	it("scheduleReload (mid-session): re-emits warn lines after watcher fires", async () => {
		const tmp = mkdtempSync(path.join(os.tmpdir(), "pi-rules-rt-"));
		const dir = path.join(tmp, ".pi/rules");
		mkdirSync(dir, { recursive: true });
		writeFileSync(path.join(dir, "good.md"), '---\ndescription: g\nglobs: ["**/*"]\n---\n');
		const fp = makeFakePi();
		const { factory, created } = makeFakeWatchFactory();
		// biome-ignore lint/suspicious/noExplicitAny: test fake
		makeExtension({ watchFactory: factory, debounceMs: 10 })(fp as any);
		await fp.fire("session_start", { type: "session_start", reason: "startup" }, { cwd: tmp });

		writeFileSync(path.join(dir, "bad.md"), '---\nglobs: ["**/*"]\n---\n');
		const lines: string[] = [];
		const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
			lines.push(String(chunk));
			return true;
		});
		try {
			created[0]?.emitChange();
			const deadline = Date.now() + 1000;
			while (Date.now() < deadline) {
				if (lines.some((l) => l.includes("bad.md: missing description"))) break;
				await new Promise((r) => setTimeout(r, 5));
			}
		} finally {
			stderrSpy.mockRestore();
		}
		expect(lines.filter((l) => l.startsWith("[pi-rules] skipped"))).toEqual([
			"[pi-rules] skipped .pi/rules/bad.md: missing description\n",
		]);
		rmSync(tmp, { recursive: true, force: true });
	});
});

describe("pi-rules slash command (M01-S03)", () => {
	it("registers exactly one command named pi-rules with description mentioning doctor", () => {
		const fp = makeFakePi();
		const { factory } = makeFakeWatchFactory();
		// biome-ignore lint/suspicious/noExplicitAny: test fake
		makeExtension({ watchFactory: factory })(fp as any);
		const reg = fp.__registeredCommands.filter((c) => c.name === "pi-rules");
		expect(reg).toHaveLength(1);
		// biome-ignore lint/suspicious/noExplicitAny: options is unknown in fake
		expect((reg[0]?.options as any).description).toMatch(/doctor/i);
	});

	it("getArgumentCompletions returns doctor for empty/partial prefix", () => {
		const fp = makeFakePi();
		const { factory } = makeFakeWatchFactory();
		// biome-ignore lint/suspicious/noExplicitAny: test fake
		makeExtension({ watchFactory: factory })(fp as any);
		// biome-ignore lint/suspicious/noExplicitAny: options is unknown
		const opts = fp.__registeredCommands.find((c) => c.name === "pi-rules")?.options as any;
		expect(opts.getArgumentCompletions("")).toEqual([{ value: "doctor", label: "doctor" }]);
		expect(opts.getArgumentCompletions("doc")).toEqual([{ value: "doctor", label: "doctor" }]);
		expect(opts.getArgumentCompletions("xyz")).toEqual([]);
	});

	it("handler dispatches doctor subcommand to runDoctor (verified via emitted message)", async () => {
		const tmp = mkdtempSync(path.join(os.tmpdir(), "pi-rules-cmd-"));
		mkdirSync(path.join(tmp, ".pi/rules"), { recursive: true });
		const fp = makeFakePi();
		const { factory } = makeFakeWatchFactory();
		// biome-ignore lint/suspicious/noExplicitAny: test fake
		makeExtension({ watchFactory: factory })(fp as any);
		await fp.fire("session_start", { type: "session_start", reason: "startup" }, { cwd: tmp });
		// biome-ignore lint/suspicious/noExplicitAny: options is unknown
		const opts = fp.__registeredCommands.find((c) => c.name === "pi-rules")?.options as any;
		const fakeUiCtx = { hasUI: false, ui: { notify: () => {} } };
		await opts.handler("doctor", fakeUiCtx);
		expect(fp.__userMessages.some((m) => m.startsWith("pi-rules doctor: OK"))).toBe(true);
		rmSync(tmp, { recursive: true, force: true });
	});

	it("handler with unknown subcommand emits usage line, does NOT run doctor", async () => {
		const fp = makeFakePi();
		const { factory } = makeFakeWatchFactory();
		// biome-ignore lint/suspicious/noExplicitAny: test fake
		makeExtension({ watchFactory: factory })(fp as any);
		// biome-ignore lint/suspicious/noExplicitAny: options is unknown
		const opts = fp.__registeredCommands.find((c) => c.name === "pi-rules")?.options as any;
		const fakeUiCtx = { hasUI: false, ui: { notify: () => {} } };
		await opts.handler("frobnicate", fakeUiCtx);
		expect(fp.__userMessages).toHaveLength(1);
		expect(fp.__userMessages[0]).toContain("Unknown");
		expect(fp.__userMessages[0]).toContain("doctor");
		expect(fp.__userMessages.some((m) => m.startsWith("pi-rules doctor:"))).toBe(false);
	});

	it("handler with empty input emits usage line", async () => {
		const fp = makeFakePi();
		const { factory } = makeFakeWatchFactory();
		// biome-ignore lint/suspicious/noExplicitAny: test fake
		makeExtension({ watchFactory: factory })(fp as any);
		// biome-ignore lint/suspicious/noExplicitAny: options is unknown
		const opts = fp.__registeredCommands.find((c) => c.name === "pi-rules")?.options as any;
		const fakeUiCtx = { hasUI: false, ui: { notify: () => {} } };
		await opts.handler("", fakeUiCtx);
		expect(fp.__userMessages).toHaveLength(1);
		expect(fp.__userMessages[0]).toMatch(/doctor/);
	});
});
