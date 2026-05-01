import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import piRulesExtension from "../../src/index.js";
import { makeFakePi } from "../_helpers/fake-pi.js";

describe("piRulesExtension — resources_discover", () => {
	it("AC4.6: returns { skillPaths: [<dir>] } pointing at rule-authoring/SKILL.md on disk", async () => {
		const fp = makeFakePi();
		piRulesExtension(fp as any);
		const result = (await fp.fire(
			"resources_discover",
			{ type: "resources_discover", cwd: process.cwd(), reason: "startup" },
			{ cwd: process.cwd() },
		)) as { skillPaths: string[] } | undefined;

		expect(result).toBeDefined();
		if (!result) return;
		expect(Array.isArray(result.skillPaths)).toBe(true);
		expect(result.skillPaths).toHaveLength(1);
		const dir = result.skillPaths[0];
		expect(path.isAbsolute(dir)).toBe(true);
		expect(existsSync(path.join(dir, "rule-authoring", "SKILL.md"))).toBe(true);
	});
});
