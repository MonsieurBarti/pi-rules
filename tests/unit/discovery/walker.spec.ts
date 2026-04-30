import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { enumerateRuleFiles } from "../../../src/discovery/walker.js";

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), "pi-rules-walker-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("enumerateRuleFiles", () => {
	it("returns [] when root is missing", async () => {
		const out = await enumerateRuleFiles(path.join(dir, "nope"));
		expect(out).toEqual([]);
	});

	it("AC5: discovers nested *.md files recursively, ignores non-md", async () => {
		const root = path.join(dir, "rules");
		await mkdir(path.join(root, "nested", "deep"), { recursive: true });
		await writeFile(path.join(root, "top.md"), "x");
		await writeFile(path.join(root, "nested", "deep", "r.md"), "y");
		await writeFile(path.join(root, "ignore.txt"), "z");

		const out = await enumerateRuleFiles(root);
		expect(out.sort()).toEqual(
			[path.join(root, "nested", "deep", "r.md"), path.join(root, "top.md")].sort(),
		);
	});

	it("propagates EACCES on root (POSIX only)", async () => {
		if (process.platform === "win32") return;
		const root = path.join(dir, "rules");
		await mkdir(root);
		await chmod(root, 0o000);
		try {
			await expect(enumerateRuleFiles(root)).rejects.toThrow();
		} finally {
			await chmod(root, 0o755);
		}
	});
});
