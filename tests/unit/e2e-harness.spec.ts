import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discover } from "../../src/discovery/index.js";
import {
	clearInjectionLog,
	injectionLog,
	recordInjection,
} from "../../src/testing/injection-log.js";
import harness from "../e2e/harness.js";

// NOTE on import paths: this spec lives at tests/unit/e2e-harness.spec.ts.
// The harness lives at tests/e2e/harness.ts. The relative-from-spec import
// is `../e2e/harness.js` (one `..` to escape `unit/`, then `e2e/harness.js`
// — the `.js` suffix is rewritten to `.ts` by jiti at runtime). The
// `src/...` imports use `../../src/...` (two `..` to escape `tests/unit/`).

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

describe("e2e harness — side-channel write contract (AC2b)", () => {
	let tmp: string;
	let logPath: string;
	beforeEach(() => {
		clearInjectionLog();
		tmp = mkdtempSync(path.join(os.tmpdir(), "pi-rules-s05-harness-"));
		logPath = path.join(tmp, "log.json");
	});
	afterEach(() => {
		rmSync(tmp, { recursive: true, force: true });
		clearInjectionLog();
		// biome-ignore lint/performance/noDelete: env var must be unset, not assigned undefined (process.env coerces to "undefined" string)
		delete process.env.PI_RULES_E2E_LOG;
	});

	it("writes JSON.stringify(injectionLog) to PI_RULES_E2E_LOG on session_shutdown", async () => {
		const fp = makeFakePi();
		// biome-ignore lint/suspicious/noExplicitAny: fake pi shape
		harness(fp as any);

		// Seed the in-memory log directly — proves the harness reads the live
		// module export and serializes it on shutdown, independent of whether
		// tool_result happens to fire in this test.
		recordInjection({ path: "src/a.ts", ruleId: "/abs/.pi/rules/r.md" });
		process.env.PI_RULES_E2E_LOG = logPath;

		await fp.fire("session_shutdown", { type: "session_shutdown", reason: "quit" }, { cwd: tmp });

		const written = readFileSync(logPath, "utf8");
		expect(written).toBe(JSON.stringify(injectionLog));
		expect(JSON.parse(written)).toEqual([{ path: "src/a.ts", ruleId: "/abs/.pi/rules/r.md" }]);
	});

	it("is a no-op when PI_RULES_E2E_LOG is unset", async () => {
		const fp = makeFakePi();
		// biome-ignore lint/suspicious/noExplicitAny: fake pi shape
		harness(fp as any);
		// biome-ignore lint/performance/noDelete: env var must be unset, not assigned undefined
		delete process.env.PI_RULES_E2E_LOG;
		recordInjection({ path: "src/a.ts", ruleId: "/abs/r.md" });

		// No throw, no file written.
		await expect(
			fp.fire("session_shutdown", { type: "session_shutdown", reason: "quit" }, { cwd: tmp }),
		).resolves.toBeUndefined();
	});
});

describe("discover() parse probes (AC3b, AC6c)", () => {
	it("AC3b: tests/e2e/fixture/ parses to three rules with no stderr warnings", async () => {
		const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
		try {
			const rules = await discover(path.resolve("tests/e2e/fixture"));
			expect(rules).toHaveLength(3);
			const ids = rules.map((r) => r.id).sort();
			expect(ids.some((id) => id.endsWith("/pi-rule.md"))).toBe(true);
			expect(ids.some((id) => id.endsWith("/always.md"))).toBe(true);
			expect(ids.some((id) => id.endsWith("/claude-rule.md"))).toBe(true);

			const piRulesWarnings = stderrSpy.mock.calls
				.map((c) => String(c[0]))
				.filter((s) => s.startsWith("[pi-rules]"));
			expect(piRulesWarnings).toEqual([]);
		} finally {
			stderrSpy.mockRestore();
		}
	});

	it("AC6c: examples/ parses to two rules with no stderr warnings", async () => {
		const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
		try {
			const rules = await discover(path.resolve("examples"));
			expect(rules).toHaveLength(2);
			const ids = rules.map((r) => r.id).sort();
			expect(ids.some((id) => id.endsWith("/examples/.pi/rules/typescript-style.md"))).toBe(true);
			expect(ids.some((id) => id.endsWith("/examples/.claude/rules/always-be-terse.md"))).toBe(
				true,
			);

			const piRulesWarnings = stderrSpy.mock.calls
				.map((c) => String(c[0]))
				.filter((s) => s.startsWith("[pi-rules]"));
			expect(piRulesWarnings).toEqual([]);
		} finally {
			stderrSpy.mockRestore();
		}
	});
});
