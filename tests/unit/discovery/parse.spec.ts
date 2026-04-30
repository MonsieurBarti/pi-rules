import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseRuleFile } from "../../../src/discovery/parse.js";
import { isParseFailure } from "../../../src/discovery/types.js";

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), "pi-rules-parse-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("parseRuleFile happy path", () => {
	it("parses description + globs + alwaysApply default", async () => {
		const file = path.join(dir, "r.md");
		await writeFile(
			file,
			`---\ndescription: Style for TS\nglobs: ["src/**/*.ts"]\n---\nUse strict mode.\n`,
		);
		const result = await parseRuleFile(file, "pi");
		expect(isParseFailure(result)).toBe(false);
		if (isParseFailure(result)) return;
		expect(result.description).toBe("Style for TS");
		expect(result.globs).toEqual(["src/**/*.ts"]);
		expect(result.alwaysApply).toBe(false);
		expect(result.source).toBe("pi");
		expect(result.sourcePath).toBe(file);
		expect(result.body).toBe("Use strict mode.\n");
	});

	it("AC6: alwaysApply true with no globs defaults to []", async () => {
		const file = path.join(dir, "always.md");
		await writeFile(file, "---\ndescription: Always\nalwaysApply: true\n---\nBody.\n");
		const result = await parseRuleFile(file, "pi");
		if (isParseFailure(result)) throw new Error(`unexpected: ${result.reason}`);
		expect(result.alwaysApply).toBe(true);
		expect(result.globs).toEqual([]);
	});

	it("AC13: body preserved byte-for-byte modulo single leading newline", async () => {
		const file = path.join(dir, "body.md");
		const body = "First line.\n\n```ts\n---\ninside fence\n---\n```\n\nTrailing.\n";
		await writeFile(file, `---\ndescription: B\nglobs: ["**"]\n---\n${body}`);
		const result = await parseRuleFile(file, "pi");
		if (isParseFailure(result)) throw new Error(`unexpected: ${result.reason}`);
		expect(result.body).toBe(body);
	});
});

describe("parseRuleFile failures", () => {
	it("AC7a: missing frontmatter", async () => {
		const file = path.join(dir, "no-fm.md");
		await writeFile(file, "body without delimiters\n");
		const result = await parseRuleFile(file, "pi");
		expect(isParseFailure(result)).toBe(true);
		if (!isParseFailure(result)) return;
		expect(result.reason).toBe("missing frontmatter");
	});

	it("AC7b: invalid yaml", async () => {
		const file = path.join(dir, "bad-yaml.md");
		await writeFile(file, `---\ndescription: "unterminated\n---\nbody\n`);
		const result = await parseRuleFile(file, "pi");
		expect(isParseFailure(result)).toBe(true);
		if (!isParseFailure(result)) return;
		expect(result.reason).toMatch(/^invalid yaml: /);
	});

	it("AC7c: missing description", async () => {
		const file = path.join(dir, "no-desc.md");
		await writeFile(file, `---\nglobs: ["a"]\n---\nbody\n`);
		const result = await parseRuleFile(file, "pi");
		expect(isParseFailure(result)).toBe(true);
		if (!isParseFailure(result)) return;
		expect(result.reason).toBe("missing description");
	});

	it("AC7d: empty globs with alwaysApply false", async () => {
		const file = path.join(dir, "empty-globs.md");
		await writeFile(file, "---\ndescription: D\nglobs: []\n---\nbody\n");
		const result = await parseRuleFile(file, "pi");
		expect(isParseFailure(result)).toBe(true);
		if (!isParseFailure(result)) return;
		expect(result.reason).toBe("globs required when alwaysApply is not true");
	});

	it("AC7e: globs wrong type", async () => {
		const file = path.join(dir, "wrong-globs.md");
		await writeFile(file, "---\ndescription: D\nglobs: [1, 2]\n---\nbody\n");
		const result = await parseRuleFile(file, "pi");
		expect(isParseFailure(result)).toBe(true);
		if (!isParseFailure(result)) return;
		expect(result.reason).toBe("globs must be string[]");
	});
});
