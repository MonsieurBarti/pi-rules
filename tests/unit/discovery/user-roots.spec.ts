import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discover } from "../../../src/discovery/index.js";

let cwd: string;
let home: string;
beforeEach(async () => {
	cwd = await mkdtemp(path.join(tmpdir(), "pi-rules-cwd-"));
	home = await mkdtemp(path.join(tmpdir(), "pi-rules-home-"));
});
afterEach(async () => {
	await rm(cwd, { recursive: true, force: true });
	await rm(home, { recursive: true, force: true });
});

const VALID_FM = `---\ndescription: D\nglobs: ["**"]\n---\nbody\n`;
const ALWAYS_FM = "---\ndescription: D\nalwaysApply: true\n---\nbody\n";

describe("user-root discovery (AC1)", () => {
	it("AC1a: discovers rules from ~/.pi/rules and ~/.claude/rules", async () => {
		await mkdir(path.join(home, ".pi", "rules"), { recursive: true });
		await mkdir(path.join(home, ".claude", "rules"), { recursive: true });
		await writeFile(path.join(home, ".pi", "rules", "u1.md"), VALID_FM);
		await writeFile(path.join(home, ".claude", "rules", "u2.md"), VALID_FM);

		const rules = await discover(cwd, { home });
		expect(rules).toHaveLength(2);
		expect(rules.map((r) => r.sourcePath).sort()).toEqual([
			path.join(home, ".claude", "rules", "u2.md"),
			path.join(home, ".pi", "rules", "u1.md"),
		]);
	});

	it("AC1b: user and project rules merge into one list, user first", async () => {
		await mkdir(path.join(home, ".pi", "rules"), { recursive: true });
		await mkdir(path.join(cwd, ".pi", "rules"), { recursive: true });
		await writeFile(path.join(home, ".pi", "rules", "u.md"), VALID_FM);
		await writeFile(path.join(cwd, ".pi", "rules", "p.md"), VALID_FM);

		const rules = await discover(cwd, { home });
		expect(rules).toHaveLength(2);
		expect(rules[0]?.sourcePath).toBe(path.join(home, ".pi", "rules", "u.md"));
		expect(rules[1]?.sourcePath).toBe(path.join(cwd, ".pi", "rules", "p.md"));
	});

	it("AC1c: missing user dirs do not error (home points at non-existent path)", async () => {
		const ghostHome = path.join(home, "does-not-exist");
		await mkdir(path.join(cwd, ".pi", "rules"), { recursive: true });
		await writeFile(path.join(cwd, ".pi", "rules", "p.md"), VALID_FM);

		const rules = await discover(cwd, { home: ghostHome });
		expect(rules).toHaveLength(1);
		expect(rules[0]?.sourcePath).toBe(path.join(cwd, ".pi", "rules", "p.md"));
	});

	it("AC1d: alwaysApply: true preserved on user rules", async () => {
		await mkdir(path.join(home, ".pi", "rules"), { recursive: true });
		await writeFile(path.join(home, ".pi", "rules", "always.md"), ALWAYS_FM);

		const rules = await discover(cwd, { home });
		expect(rules).toHaveLength(1);
		expect(rules[0]?.alwaysApply).toBe(true);
	});

	it("home empty string skips user roots entirely", async () => {
		await mkdir(path.join(home, ".pi", "rules"), { recursive: true });
		await writeFile(path.join(home, ".pi", "rules", "u.md"), VALID_FM);
		await mkdir(path.join(cwd, ".pi", "rules"), { recursive: true });
		await writeFile(path.join(cwd, ".pi", "rules", "p.md"), VALID_FM);

		const rules = await discover(cwd, { home: "" });
		expect(rules).toHaveLength(1);
		expect(rules[0]?.sourcePath).toBe(path.join(cwd, ".pi", "rules", "p.md"));
	});

	it("opts.home === undefined falls through to os.homedir()", async () => {
		// Smoke: omit opts entirely; behavior matches single-arg call. Asserts no throw and
		// an array result. We do NOT assert contents (developer's real ~/.pi/rules may exist).
		const rules = await discover(cwd);
		expect(Array.isArray(rules)).toBe(true);
	});

	it("cwd === home degenerate: rule appears once with user sourcePath", async () => {
		// Make cwd identical to home (single tmpdir).
		await mkdir(path.join(home, ".pi", "rules"), { recursive: true });
		await writeFile(path.join(home, ".pi", "rules", "x.md"), VALID_FM);

		const rules = await discover(home, { home });
		expect(rules).toHaveLength(1);
		expect(rules[0]?.sourcePath).toBe(path.join(home, ".pi", "rules", "x.md"));
	});

	it("foreign markdown (no frontmatter) in user root is silently skipped", async () => {
		await mkdir(path.join(home, ".claude", "rules"), { recursive: true });
		await writeFile(path.join(home, ".claude", "rules", "NOTES.md"), "# just notes\n");

		const errors: string[] = [];
		const orig = process.stderr.write.bind(process.stderr);
		// biome-ignore lint/suspicious/noExplicitAny: stderr spy
		(process.stderr.write as any) = (chunk: string) => {
			errors.push(chunk);
			return true;
		};
		try {
			const rules = await discover(cwd, { home });
			expect(rules).toEqual([]);
			expect(errors).toEqual([]);
		} finally {
			process.stderr.write = orig;
		}
	});
});
