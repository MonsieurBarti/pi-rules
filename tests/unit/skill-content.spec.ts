import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discover } from "../../src/discovery/index.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("examples — content parses cleanly under discover()", () => {
	let tmp: string;
	beforeEach(() => {
		tmp = mkdtempSync(path.join(os.tmpdir(), "pi-rules-s04-examples-"));
		mkdirSync(path.join(tmp, ".pi", "rules"), { recursive: true });
		mkdirSync(path.join(tmp, ".claude", "rules"), { recursive: true });
		copyFileSync(
			path.join(REPO_ROOT, "examples/.pi/rules/typescript-style.md"),
			path.join(tmp, ".pi", "rules", "typescript-style.md"),
		);
		copyFileSync(
			path.join(REPO_ROOT, "examples/.claude/rules/always-be-terse.md"),
			path.join(tmp, ".claude", "rules", "always-be-terse.md"),
		);
	});
	afterEach(() => rmSync(tmp, { recursive: true, force: true }));

	it("AC4.7: both rewritten examples discover cleanly and use symbolic style", async () => {
		const { rules, diagnostics } = await discover(tmp);
		expect(diagnostics).toEqual([]);
		expect(rules).toHaveLength(2);
		for (const r of rules) {
			expect(r.body).toContain("¬");
		}
	});
});
