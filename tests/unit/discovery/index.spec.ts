import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os, { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

		const { rules } = await discover(cwd);
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

		const { rules } = await discover(cwd);
		expect(rules).toHaveLength(2);
		const ids = new Set(rules.map((r) => r.id));
		expect(ids.size).toBe(2);
	});

	it("AC3: claude->pi symlink yields one rule, source pi", async () => {
		if (process.platform === "win32") return;
		const fs = await import("node:fs/promises");
		await mkdir(path.join(cwd, ".pi", "rules"), { recursive: true });
		await mkdir(path.join(cwd, ".claude", "rules"), { recursive: true });
		const target = path.join(cwd, ".pi", "rules", "x.md");
		await writeFile(target, VALID_FM);
		await fs.symlink(target, path.join(cwd, ".claude", "rules", "x.md"));

		const { rules } = await discover(cwd);
		expect(rules).toHaveLength(1);
		expect(rules[0]?.source).toBe("pi");
		expect(rules[0]?.sourcePath).toBe(target);
	});

	it("AC3 reverse: pi->claude symlink still yields source pi (pi walked first)", async () => {
		if (process.platform === "win32") return;
		const fs = await import("node:fs/promises");
		await mkdir(path.join(cwd, ".pi", "rules"), { recursive: true });
		await mkdir(path.join(cwd, ".claude", "rules"), { recursive: true });
		const target = path.join(cwd, ".claude", "rules", "x.md");
		await writeFile(target, VALID_FM);
		await fs.symlink(target, path.join(cwd, ".pi", "rules", "x.md"));

		const { rules } = await discover(cwd);
		expect(rules).toHaveLength(1);
		expect(rules[0]?.source).toBe("pi");
		expect(rules[0]?.sourcePath).toBe(path.join(cwd, ".pi", "rules", "x.md"));
	});

	it("AC9: Rule.id equals realpath(sourcePath) for every rule", async () => {
		const fs = await import("node:fs/promises");
		await mkdir(path.join(cwd, ".pi", "rules"), { recursive: true });
		await writeFile(path.join(cwd, ".pi", "rules", "a.md"), VALID_FM);
		const { rules } = await discover(cwd);
		for (const r of rules) {
			expect(r.id).toBe(await fs.realpath(r.sourcePath));
		}
	});
});

describe("discover root errors", () => {
	it("AC4: missing both roots returns [] with no stderr", async () => {
		const errors: string[] = [];
		const orig = process.stderr.write.bind(process.stderr);
		// biome-ignore lint/suspicious/noExplicitAny: stderr spy
		(process.stderr.write as any) = (chunk: string) => {
			errors.push(chunk);
			return true;
		};
		try {
			const { rules, diagnostics } = await discover(cwd);
			expect(rules).toEqual([]);
			expect(diagnostics).toEqual([]);
			expect(errors).toEqual([]);
		} finally {
			process.stderr.write = orig;
		}
	});

	it("AC11: root EACCES on .pi/rules rejects (POSIX only)", async () => {
		if (process.platform === "win32") return;
		const fs = await import("node:fs/promises");
		const root = path.join(cwd, ".pi", "rules");
		await mkdir(root, { recursive: true });
		await fs.chmod(root, 0o000);
		try {
			await expect(discover(cwd)).rejects.toThrow();
		} finally {
			await fs.chmod(root, 0o755);
		}
	});
});

describe("discover diagnostics contract (M01-S03)", () => {
	it("returns parse_error for invalid frontmatter (missing description)", async () => {
		const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-rules-diag-"));
		const dir = path.join(tmp, ".pi/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(path.join(dir, "no-desc.md"), '---\nglobs: ["**/*"]\n---\nbody\n');
		const { rules, diagnostics } = await discover(tmp, { home: "" });
		expect(rules).toEqual([]);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]).toMatchObject({
			kind: "parse_error",
			source: "pi",
			reason: "missing description",
		});
		expect(diagnostics[0].absPath.endsWith("no-desc.md")).toBe(true);
		await rm(tmp, { recursive: true });
	});

	it("returns skipped_no_frontmatter for files without frontmatter", async () => {
		const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-rules-diag-"));
		const dir = path.join(tmp, ".pi/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(path.join(dir, "plain.md"), "no frontmatter here\n");
		const { rules, diagnostics } = await discover(tmp, { home: "" });
		expect(rules).toEqual([]);
		expect(diagnostics).toEqual([
			{
				kind: "skipped_no_frontmatter",
				absPath: path.join(dir, "plain.md"),
				source: "pi",
			},
		]);
		await rm(tmp, { recursive: true });
	});

	it("returns unreadable when parseRuleFile reports unreadable: <code> (parse-side branch)", async () => {
		const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-rules-diag-"));
		const dir = path.join(tmp, ".pi/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(path.join(dir, "x.md"), '---\ndescription: a\nglobs: ["**/*"]\n---\n');
		const parseMod = await import("../../../src/discovery/parse.js");
		const spy = vi.spyOn(parseMod, "parseRuleFile").mockResolvedValueOnce({
			kind: "parse-failure",
			reason: "unreadable: EACCES",
		});
		const { rules, diagnostics } = await discover(tmp, { home: "" });
		spy.mockRestore();
		expect(rules).toEqual([]);
		expect(diagnostics).toEqual([
			{
				kind: "unreadable",
				absPath: path.join(dir, "x.md"),
				source: "pi",
				code: "EACCES",
			},
		]);
		await rm(tmp, { recursive: true });
	});

	it("returns unreadable from realpath rejection (broken symlink, realpath-side branch)", async () => {
		if (process.platform === "win32") return;
		const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-rules-diag-"));
		const dir = path.join(tmp, ".pi/rules");
		await mkdir(dir, { recursive: true });
		const fs = await import("node:fs/promises");
		await fs.symlink(path.join(tmp, "missing-target"), path.join(dir, "ghost.md"));
		const { rules, diagnostics } = await discover(tmp, { home: "" });
		expect(rules).toEqual([]);
		expect(diagnostics).toEqual([
			{
				kind: "unreadable",
				absPath: path.join(dir, "ghost.md"),
				source: "pi",
				code: "ENOENT",
			},
		]);
		await rm(tmp, { recursive: true });
	});

	it("AC3.6: preserves full rule shape ∧ ordering; diagnostics emitted alongside rules", async () => {
		const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-rules-diag-"));
		const dir = path.join(tmp, ".pi/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(
			path.join(dir, "a.md"),
			'---\ndescription: alpha\nglobs: ["src/**"]\n---\nA-body\n',
		);
		await writeFile(path.join(dir, "no-fm.md"), "no frontmatter\n");
		await writeFile(path.join(dir, "bad.md"), "---\ndescription: bad\nglobs: 99\n---\n");
		await writeFile(
			path.join(dir, "b.md"),
			"---\ndescription: beta\nalwaysApply: true\n---\nB-body\n",
		);
		const { rules, diagnostics } = await discover(tmp, { home: "" });
		const fs = await import("node:fs/promises");
		expect(rules).toHaveLength(2);
		const ruleA = rules.find((r) => r.sourcePath === path.join(dir, "a.md"));
		const ruleB = rules.find((r) => r.sourcePath === path.join(dir, "b.md"));
		expect(ruleA).toBeDefined();
		expect(ruleB).toBeDefined();
		expect(ruleA).toMatchObject({
			source: "pi",
			description: "alpha",
			globs: ["src/**"],
			alwaysApply: false,
			body: "A-body\n",
		});
		expect(ruleA?.id).toBe(await fs.realpath(path.join(dir, "a.md")));
		expect(ruleB).toMatchObject({
			source: "pi",
			description: "beta",
			globs: [],
			alwaysApply: true,
			body: "B-body\n",
		});
		expect(ruleB?.id).toBe(await fs.realpath(path.join(dir, "b.md")));
		expect(diagnostics).toHaveLength(2);
		expect(diagnostics.map((d) => d.kind).sort()).toEqual([
			"parse_error",
			"skipped_no_frontmatter",
		]);
		await rm(tmp, { recursive: true });
	});

	it("does NOT write to stderr (diagnostics are returned, not logged)", async () => {
		const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-rules-diag-"));
		const dir = path.join(tmp, ".pi/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(path.join(dir, "no-desc.md"), '---\nglobs: ["**/*"]\n---\n');
		const lines: string[] = [];
		const orig = process.stderr.write.bind(process.stderr);
		// biome-ignore lint/suspicious/noExplicitAny: stderr spy
		(process.stderr.write as any) = (chunk: string) => {
			lines.push(chunk);
			return true;
		};
		try {
			await discover(tmp, { home: "" });
		} finally {
			process.stderr.write = orig;
		}
		expect(lines.filter((l) => l.startsWith("[pi-rules]"))).toEqual([]);
		await rm(tmp, { recursive: true });
	});
});
