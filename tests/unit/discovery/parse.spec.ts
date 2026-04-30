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
});
