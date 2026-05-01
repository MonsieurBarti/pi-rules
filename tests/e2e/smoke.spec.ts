import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("e2e smoke", () => {
	it.skipIf(process.env.RUN_E2E !== "1")("injects matching rules under live pi binary", () => {
		const tmp = mkdtempSync(path.join(tmpdir(), "pi-rules-e2e-"));
		const logPath = path.join(tmp, "log.json");
		const sessionDir = path.join(tmp, "sessions");
		try {
			const fixture = path.resolve("tests/e2e/fixture");
			const harness = path.resolve("tests/e2e/harness.ts");
			const pi = path.resolve("node_modules/.bin/pi");
			const r = spawnSync(
				pi,
				[
					"-e",
					harness,
					"-p",
					"Use the read tool on src/app.ts.",
					"--no-session",
					"--session-dir",
					sessionDir,
				],
				{
					cwd: fixture,
					env: { ...process.env, PI_RULES_E2E_LOG: logPath },
					encoding: "utf8",
					timeout: 60_000,
				},
			);
			expect(r.status, `pi stderr: ${r.stderr}`).toBe(0);
			const log = JSON.parse(readFileSync(logPath, "utf8")) as Array<{
				path: string;
				ruleId: string;
			}>;
			// Suffix-match tolerates path-normalization differences
			// ("./src/app.ts" vs "src/app.ts" etc.).
			const ruleIds = log
				.filter((e) => e.path.endsWith("src/app.ts"))
				.map((e) => e.ruleId)
				.sort();
			expect(ruleIds, `injectionLog: ${JSON.stringify(log)}`).toHaveLength(2);
			expect(ruleIds.some((id) => id.endsWith("/pi-rule.md"))).toBe(true);
			expect(ruleIds.some((id) => id.endsWith("/always.md"))).toBe(true);
			expect(ruleIds.some((id) => id.endsWith("/claude-rule.md"))).toBe(false);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});
});
