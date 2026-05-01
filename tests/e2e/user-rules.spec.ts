// RUN_E2E-gated. Mirrors tests/e2e/smoke.spec.ts pattern: spawn the live `pi`
// binary with the bundled e2e harness extension, override HOME to point at a
// fixture user-home tree, and assert on the injectionLog JSON written by
// tests/e2e/harness.ts on session_shutdown.
//
// If a case fails because the model declined to call the read tool (rare —
// see README "Development" section), re-run. Do not add automatic retry.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type LogEntry = { path: string; ruleId: string };

const RUN_E2E = process.env.RUN_E2E === "1";
const d = RUN_E2E ? describe : describe.skip;

const PI = path.resolve("node_modules/.bin/pi");
const HARNESS = path.resolve("tests/e2e/harness.ts");
const FIXTURE_ROOT = path.resolve("tests/e2e/fixture-user-rules");

function runCase(opts: { project: string; home: string }): LogEntry[] {
	const tmp = mkdtempSync(path.join(tmpdir(), "pi-rules-s05-"));
	const logPath = path.join(tmp, "log.json");
	const sessionDir = path.join(tmp, "sessions");
	try {
		const r = spawnSync(
			PI,
			[
				"-e",
				HARNESS,
				"-p",
				"Use the read tool on src/app.ts.",
				"--no-session",
				"--session-dir",
				sessionDir,
			],
			{
				cwd: opts.project,
				env: {
					...process.env,
					HOME: opts.home,
					PI_RULES_E2E_LOG: logPath,
				},
				encoding: "utf8",
				timeout: 60_000,
			},
		);
		expect(r.status, `pi stderr: ${r.stderr}`).toBe(0);
		const log = JSON.parse(readFileSync(logPath, "utf8")) as LogEntry[];
		return log;
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

function entriesForApp(log: LogEntry[]): LogEntry[] {
	return log.filter((e) => e.path.endsWith("src/app.ts"));
}

d("e2e: per-user rule discovery", () => {
	it("AC5.6 — discovers user rule under ~/.pi/rules", () => {
		const log = runCase({
			project: path.join(FIXTURE_ROOT, "pi-only/project"),
			home: path.join(FIXTURE_ROOT, "pi-only/home"),
		});
		const entries = entriesForApp(log);
		expect(entries, JSON.stringify(log)).toHaveLength(1);
		expect(entries[0].ruleId.endsWith("/.pi/rules/pi-only.md")).toBe(true);
	});

	it("AC5.7 — discovers user rule under ~/.claude/rules", () => {
		const log = runCase({
			project: path.join(FIXTURE_ROOT, "claude-only/project"),
			home: path.join(FIXTURE_ROOT, "claude-only/home"),
		});
		const entries = entriesForApp(log);
		expect(entries, JSON.stringify(log)).toHaveLength(1);
		expect(entries[0].ruleId.endsWith("/.claude/rules/claude-only.md")).toBe(true);
	});

	it("AC5.8 — merges project and user rules for the same target", () => {
		const log = runCase({
			project: path.join(FIXTURE_ROOT, "merge/project"),
			home: path.join(FIXTURE_ROOT, "merge/home"),
		});
		const entries = entriesForApp(log);
		expect(entries, JSON.stringify(log)).toHaveLength(2);
		const suffixes = entries.map((e) => e.ruleId).sort();
		expect(suffixes.some((id) => id.endsWith("/.pi/rules/user.md"))).toBe(true);
		expect(suffixes.some((id) => id.endsWith("/.pi/rules/project.md"))).toBe(true);
	});
});

d("e2e: realpath dedup across user and project sources", () => {
	const symlinkSrc = path.join(FIXTURE_ROOT, "symlink-dedup/home/.pi/rules/shared.md");
	const symlinkDst = path.join(FIXTURE_ROOT, "symlink-dedup/project/.pi/rules/shared.md");

	beforeAll(() => {
		try {
			unlinkSync(symlinkDst);
		} catch {
			// not present — fine
		}
		symlinkSync(symlinkSrc, symlinkDst);
	});

	afterAll(() => {
		try {
			unlinkSync(symlinkDst);
		} catch {
			// tolerate cleanup noise
		}
	});

	it("AC5.9 — symlinked rule resolves once via realpath dedup", () => {
		const log = runCase({
			project: path.join(FIXTURE_ROOT, "symlink-dedup/project"),
			home: path.join(FIXTURE_ROOT, "symlink-dedup/home"),
		});
		const entries = entriesForApp(log);
		expect(entries, JSON.stringify(log)).toHaveLength(1);
		expect(entries[0].ruleId.endsWith("shared.md")).toBe(true);
	});
});

d("e2e: missing user dirs tolerated", () => {
	it("AC5.10 — empty HOME with no .pi/rules and no .claude/rules", () => {
		const home = mkdtempSync(path.join(tmpdir(), "pi-rules-s05-empty-home-"));
		try {
			const log = runCase({
				project: path.join(FIXTURE_ROOT, "empty-home/project"),
				home,
			});
			expect(log).toEqual([]);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});
