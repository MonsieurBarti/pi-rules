import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discover } from "../../../src/discovery/index.js";
import { compileMatcher } from "../../../src/matching/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cwd: string;
beforeEach(async () => {
	cwd = await mkdtemp(path.join(tmpdir(), "pi-rules-match-"));
});
afterEach(async () => {
	await rm(cwd, { recursive: true, force: true });
});

describe("S02 → S03 integration", () => {
	it("AC9: discover() output drives compileMatcher correctly", async () => {
		await mkdir(path.join(cwd, ".pi", "rules"), { recursive: true });
		await writeFile(
			path.join(cwd, ".pi", "rules", "src.md"),
			'---\ndescription: src rule\nglobs: ["src/**"]\nalwaysApply: false\n---\nbody-src\n',
		);
		await writeFile(
			path.join(cwd, ".pi", "rules", "always.md"),
			"---\ndescription: always rule\nalwaysApply: true\n---\nbody-always\n",
		);

		const { rules } = await discover(cwd);
		const m = compileMatcher(rules);

		const srcRule = rules.find((r) => r.description === "src rule");
		const alwaysRule = rules.find((r) => r.description === "always rule");
		expect(srcRule).toBeDefined();
		expect(alwaysRule).toBeDefined();

		const srcMatch = m.match(path.join(cwd, "src", "a.ts"), cwd);
		expect(srcMatch).toContain(srcRule);
		expect(srcMatch).toContain(alwaysRule);
		expect(srcMatch).toHaveLength(2);

		const docsMatch = m.match(path.join(cwd, "docs", "a.md"), cwd);
		expect(docsMatch).toEqual([alwaysRule]);
	});
});

describe("hygiene", () => {
	it("AC8c: package.json declares picomatch deps with caret pin", async () => {
		const repoRoot = path.resolve(__dirname, "..", "..", "..");
		const pkg = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf-8"));
		expect(pkg.dependencies?.picomatch).toMatch(/^\^4\./);
		expect(pkg.devDependencies?.["@types/picomatch"]).toMatch(/^\^4\./);
	});

	it("AC1c: src/matching/index.ts imports Rule from src/discovery/, does not redefine it", async () => {
		const repoRoot = path.resolve(__dirname, "..", "..", "..");
		const source = await readFile(path.join(repoRoot, "src", "matching", "index.ts"), "utf-8");
		expect(source).toContain("../discovery/index.js");
		expect(source).toContain("Rule");
		expect(source).not.toMatch(/^\s*(?:export\s+)?type\s+Rule\s*=/m);
		expect(source).not.toMatch(/^\s*(?:export\s+)?interface\s+Rule\b/m);
	});
});
