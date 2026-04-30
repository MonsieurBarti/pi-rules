import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discover } from "../../../src/discovery/index.js";

let cwd: string;
beforeEach(async () => {
	cwd = await mkdtemp(path.join(tmpdir(), "pi-rules-discover-"));
});
afterEach(async () => {
	await rm(cwd, { recursive: true, force: true });
});

const VALID_FM = `---\ndescription: D\nglobs: ["**"]\n---\nbody\n`;

describe("discover happy path", () => {
	it("AC2a: returns rules from both roots, tagged by source", async () => {
		await mkdir(path.join(cwd, ".pi", "rules"), { recursive: true });
		await mkdir(path.join(cwd, ".claude", "rules"), { recursive: true });
		await writeFile(path.join(cwd, ".pi", "rules", "foo.md"), VALID_FM);
		await writeFile(path.join(cwd, ".claude", "rules", "bar.md"), VALID_FM);

		const rules = await discover(cwd);
		expect(rules).toHaveLength(2);
		expect(rules.find((r) => r.source === "pi")?.sourcePath).toBe(
			path.join(cwd, ".pi", "rules", "foo.md"),
		);
		expect(rules.find((r) => r.source === "claude")?.sourcePath).toBe(
			path.join(cwd, ".claude", "rules", "bar.md"),
		);
	});

	it("AC2b: twin files at same relative path are two distinct rules", async () => {
		await mkdir(path.join(cwd, ".pi", "rules"), { recursive: true });
		await mkdir(path.join(cwd, ".claude", "rules"), { recursive: true });
		await writeFile(path.join(cwd, ".pi", "rules", "x.md"), VALID_FM);
		await writeFile(path.join(cwd, ".claude", "rules", "x.md"), VALID_FM);

		const rules = await discover(cwd);
		expect(rules).toHaveLength(2);
		const ids = new Set(rules.map((r) => r.id));
		expect(ids.size).toBe(2);
	});
});
