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

	it("AC3: claude->pi symlink yields one rule, source pi", async () => {
		if (process.platform === "win32") return;
		const fs = await import("node:fs/promises");
		await mkdir(path.join(cwd, ".pi", "rules"), { recursive: true });
		await mkdir(path.join(cwd, ".claude", "rules"), { recursive: true });
		const target = path.join(cwd, ".pi", "rules", "x.md");
		await writeFile(target, VALID_FM);
		await fs.symlink(target, path.join(cwd, ".claude", "rules", "x.md"));

		const rules = await discover(cwd);
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

		const rules = await discover(cwd);
		expect(rules).toHaveLength(1);
		expect(rules[0]?.source).toBe("pi");
		expect(rules[0]?.sourcePath).toBe(path.join(cwd, ".pi", "rules", "x.md"));
	});

	it("AC9: Rule.id equals realpath(sourcePath) for every rule", async () => {
		const fs = await import("node:fs/promises");
		await mkdir(path.join(cwd, ".pi", "rules"), { recursive: true });
		await writeFile(path.join(cwd, ".pi", "rules", "a.md"), VALID_FM);
		const rules = await discover(cwd);
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
			const rules = await discover(cwd);
			expect(rules).toEqual([]);
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

describe("discover stderr contract", () => {
	function captureStderr(): { lines: string[]; restore: () => void } {
		const lines: string[] = [];
		const orig = process.stderr.write.bind(process.stderr);
		// biome-ignore lint/suspicious/noExplicitAny: stderr spy
		(process.stderr.write as any) = (chunk: string) => {
			lines.push(chunk);
			return true;
		};
		return {
			lines,
			restore: () => {
				process.stderr.write = orig;
			},
		};
	}

	it("AC7a-e: full-line equality across mixed-fixture failures", async () => {
		const root = path.join(cwd, ".pi", "rules");
		await mkdir(root, { recursive: true });
		await writeFile(path.join(root, "valid.md"), VALID_FM);
		await writeFile(path.join(root, "miss-fm.md"), "body without delimiters\n");
		await writeFile(path.join(root, "bad-yaml.md"), `---\ndescription: "unterm\n---\nbody\n`);
		await writeFile(path.join(root, "no-desc.md"), `---\nglobs: ["a"]\n---\nbody\n`);
		await writeFile(
			path.join(root, "empty-globs.md"),
			"---\ndescription: D\nglobs: []\n---\nbody\n",
		);
		await writeFile(
			path.join(root, "wrong-globs.md"),
			"---\ndescription: D\nglobs: [1, 2]\n---\nbody\n",
		);

		const spy = captureStderr();
		try {
			const rules = await discover(cwd);
			expect(rules).toHaveLength(1);
			expect(spy.lines).toContain("[pi-rules] skipped .pi/rules/miss-fm.md: missing frontmatter\n");
			expect(spy.lines).toContain("[pi-rules] skipped .pi/rules/no-desc.md: missing description\n");
			expect(spy.lines).toContain(
				"[pi-rules] skipped .pi/rules/empty-globs.md: globs required when alwaysApply is not true\n",
			);
			expect(spy.lines).toContain(
				"[pi-rules] skipped .pi/rules/wrong-globs.md: globs must be string[]\n",
			);
			expect(
				spy.lines.some((l) =>
					l.startsWith("[pi-rules] skipped .pi/rules/bad-yaml.md: invalid yaml: "),
				),
			).toBe(true);
			expect(spy.lines).toHaveLength(5);
		} finally {
			spy.restore();
		}
	});

	it("AC7f: broken symlink emits unreadable: ENOENT (POSIX only)", async () => {
		if (process.platform === "win32") return;
		const fs = await import("node:fs/promises");
		await mkdir(path.join(cwd, ".pi", "rules"), { recursive: true });
		await fs.symlink(
			path.join(cwd, "nonexistent-target"),
			path.join(cwd, ".pi", "rules", "broken.md"),
		);

		const spy = captureStderr();
		try {
			const rules = await discover(cwd);
			expect(rules).toEqual([]);
			expect(spy.lines).toEqual(["[pi-rules] skipped .pi/rules/broken.md: unreadable: ENOENT\n"]);
		} finally {
			spy.restore();
		}
	});

	it("AC8: one valid + one invalid → 1 rule, 1 stderr line, no throw", async () => {
		const root = path.join(cwd, ".pi", "rules");
		await mkdir(root, { recursive: true });
		await writeFile(path.join(root, "valid.md"), VALID_FM);
		await writeFile(path.join(root, "no-desc.md"), `---\nglobs: ["a"]\n---\nbody\n`);

		const spy = captureStderr();
		try {
			const rules = await discover(cwd);
			expect(rules).toHaveLength(1);
			expect(spy.lines).toHaveLength(1);
		} finally {
			spy.restore();
		}
	});
});
