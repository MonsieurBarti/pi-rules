import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type { ParseFailure, Rule, Source } from "./types.js";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export async function parseRuleFile(absPath: string, source: Source): Promise<Rule | ParseFailure> {
	let content: string;
	try {
		content = await readFile(absPath, "utf-8");
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code ?? "EUNKNOWN";
		return { kind: "parse-failure", reason: `unreadable: ${code}` };
	}

	const match = content.match(FRONTMATTER_RE);
	if (!match) return { kind: "parse-failure", reason: "missing frontmatter" };

	let fm: unknown;
	try {
		fm = parseYaml(match[1]);
	} catch (err) {
		return { kind: "parse-failure", reason: `invalid yaml: ${(err as Error).message}` };
	}
	if (typeof fm !== "object" || fm === null) {
		return { kind: "parse-failure", reason: "invalid yaml: not an object" };
	}
	const rec = fm as Record<string, unknown>;

	if (typeof rec.description !== "string" || rec.description.length === 0) {
		return { kind: "parse-failure", reason: "missing description" };
	}

	const alwaysApply = rec.alwaysApply === true;

	let globs: string[];
	if (rec.globs === undefined) {
		if (alwaysApply) {
			globs = [];
		} else {
			return {
				kind: "parse-failure",
				reason: "globs required when alwaysApply is not true",
			};
		}
	} else if (!Array.isArray(rec.globs) || !rec.globs.every((g) => typeof g === "string")) {
		return { kind: "parse-failure", reason: "globs must be string[]" };
	} else if (rec.globs.length === 0 && !alwaysApply) {
		return {
			kind: "parse-failure",
			reason: "globs required when alwaysApply is not true",
		};
	} else {
		globs = rec.globs as string[];
	}

	const body = content.slice(match[0].length).replace(/^\n/, "");

	return {
		id: absPath,
		sourcePath: absPath,
		source,
		description: rec.description,
		globs,
		alwaysApply,
		body,
	};
}
