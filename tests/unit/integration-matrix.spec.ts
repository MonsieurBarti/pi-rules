import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
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
		async fire(name: string, e: unknown, ctx: unknown): Promise<unknown> {
			const list = handlers.get(name) ?? [];
			let last: unknown = undefined;
			for (const h of list) last = await h(e, ctx);
			return last;
		},
	};
}

function readResult(input: Record<string, unknown>) {
	return {
		type: "tool_result" as const,
		toolName: "read",
		toolCallId: "tc-1",
		input,
		content: [{ type: "text", text: "ORIG" }],
		isError: false,
		details: undefined,
	};
}

function mkTmp(prefix: string): string {
	return mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("integration matrix — gap fillers (S02–S04)", () => {
	let cleanup: Array<() => void> = [];
	beforeEach(() => clearInjectionLog());
	afterEach(() => {
		for (const fn of cleanup) fn();
		cleanup = [];
		clearInjectionLog();
	});

	// M1 — Symlink dedup across .pi/rules ↔ .claude/rules.
	// Discriminator: a regression keying dedup off the readable path (not
	// realpath) would produce length 2 instead of 1.
	it.skipIf(process.platform === "win32")(
		"M1: symlinked rule across .pi/rules and .claude/rules dedups by realpath",
		async () => {
			const dir = mkTmp("pi-rules-s05-m1-");
			cleanup.push(() => rmSync(dir, { recursive: true, force: true }));

			mkdirSync(path.join(dir, ".pi", "rules"), { recursive: true });
			mkdirSync(path.join(dir, ".claude", "rules"), { recursive: true });
			writeFileSync(
				path.join(dir, ".pi", "rules", "shared.md"),
				'---\ndescription: shared\nglobs: ["src/**"]\n---\nSHARED_BODY',
			);
			// Relative target so the symlink resolves regardless of where tmpdir lives.
			symlinkSync(
				path.join("..", "..", ".pi", "rules", "shared.md"),
				path.join(dir, ".claude", "rules", "shared.md"),
			);

			const fp = makeFakePi();
			// biome-ignore lint/suspicious/noExplicitAny: fake pi shape
			piRulesExtension(fp as any);
			await fp.fire("session_start", { type: "session_start", reason: "startup" }, { cwd: dir });
			await fp.fire("tool_result", readResult({ path: "src/a.ts" }), { cwd: dir });

			expect(injectionLog).toHaveLength(1);
			const sharedRealpath = await realpath(path.join(dir, ".pi", "rules", "shared.md"));
			expect(injectionLog[0]).toEqual({ path: "src/a.ts", ruleId: sharedRealpath });
		},
	);

	// M2 — Parse error file alongside valid. Discriminator: an "abort on
	// first parse error" regression would produce length 0.
	it("M2: parse-error file is skipped with stderr warning; valid file still injects", async () => {
		const dir = mkTmp("pi-rules-s05-m2-");
		cleanup.push(() => rmSync(dir, { recursive: true, force: true }));

		mkdirSync(path.join(dir, ".pi", "rules"), { recursive: true });
		writeFileSync(
			path.join(dir, ".pi", "rules", "valid.md"),
			'---\ndescription: ok\nglobs: ["src/**"]\n---\nVALID',
		);
		// Malformed YAML — unclosed sequence — surfaces a parse failure.
		writeFileSync(
			path.join(dir, ".pi", "rules", "invalid.md"),
			"---\ndescription: bad\nglobs: [unclosed\n---\nBODY",
		);

		const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
		try {
			const fp = makeFakePi();
			// biome-ignore lint/suspicious/noExplicitAny: fake pi shape
			piRulesExtension(fp as any);
			await fp.fire("session_start", { type: "session_start", reason: "startup" }, { cwd: dir });
			await fp.fire("tool_result", readResult({ path: "src/a.ts" }), { cwd: dir });

			expect(injectionLog).toHaveLength(1);
			const validRealpath = await realpath(path.join(dir, ".pi", "rules", "valid.md"));
			expect(injectionLog[0]).toEqual({ path: "src/a.ts", ruleId: validRealpath });

			const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
			expect(calls.some((s) => s.includes("invalid.md"))).toBe(true);
		} finally {
			stderrSpy.mockRestore();
		}
	});

	// M3 — Single-directory fixtures (S04's AC12 has both together; this
	// isolates each). Discriminator: a regression hard-coding both paths to
	// be present would fail one of these.
	describe("M3: per-directory standalone", () => {
		it("M3a: only .pi/rules present — discovery + matching work", async () => {
			const dir = mkTmp("pi-rules-s05-m3a-");
			cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
			mkdirSync(path.join(dir, ".pi", "rules"), { recursive: true });
			writeFileSync(
				path.join(dir, ".pi", "rules", "x.md"),
				'---\ndescription: pi\nglobs: ["src/**"]\n---\nX_BODY',
			);

			const fp = makeFakePi();
			// biome-ignore lint/suspicious/noExplicitAny: fake pi shape
			piRulesExtension(fp as any);
			await fp.fire("session_start", { type: "session_start", reason: "startup" }, { cwd: dir });
			await fp.fire("tool_result", readResult({ path: "src/a.ts" }), { cwd: dir });

			expect(injectionLog).toHaveLength(1);
		});

		it("M3b: only .claude/rules present — discovery + matching work", async () => {
			const dir = mkTmp("pi-rules-s05-m3b-");
			cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
			mkdirSync(path.join(dir, ".claude", "rules"), { recursive: true });
			writeFileSync(
				path.join(dir, ".claude", "rules", "y.md"),
				'---\ndescription: cl\nglobs: ["src/**"]\n---\nY_BODY',
			);

			const fp = makeFakePi();
			// biome-ignore lint/suspicious/noExplicitAny: fake pi shape
			piRulesExtension(fp as any);
			await fp.fire("session_start", { type: "session_start", reason: "startup" }, { cwd: dir });
			await fp.fire("tool_result", readResult({ path: "src/a.ts" }), { cwd: dir });

			expect(injectionLog).toHaveLength(1);
		});
	});
});
