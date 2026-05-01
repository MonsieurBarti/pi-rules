import { realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseRuleFile } from "./parse.js";
import { type Rule, type Source, isParseFailure } from "./types.js";
import { enumerateRuleFiles } from "./walker.js";

export type { Rule, Source } from "./types.js";
export type DiscoverOptions = { home?: string };

export type RuleRootCandidate = { root: string; source: Source };

export function ruleRootCandidates(cwd: string, home: string): RuleRootCandidate[] {
	const userRoots: RuleRootCandidate[] = home
		? [
				{ root: path.join(home, ".pi/rules"), source: "pi" },
				{ root: path.join(home, ".claude/rules"), source: "claude" },
			]
		: [];
	return [
		...userRoots,
		{ root: path.join(cwd, ".pi/rules"), source: "pi" },
		{ root: path.join(cwd, ".claude/rules"), source: "claude" },
	];
}

export async function discover(cwd: string, opts?: DiscoverOptions): Promise<Rule[]> {
	const home = opts?.home !== undefined ? opts.home : os.homedir();
	const roots = ruleRootCandidates(cwd, home);

	const seen = new Set<string>();
	const out: Rule[] = [];

	for (const { root, source } of roots) {
		try {
			await stat(root);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw err;
		}

		const files = await enumerateRuleFiles(root);
		for (const absPath of files) {
			let id: string;
			try {
				id = await realpath(absPath);
			} catch (err) {
				const code = (err as NodeJS.ErrnoException).code ?? "EUNKNOWN";
				warn(cwd, absPath, `unreadable: ${code}`);
				continue;
			}
			if (seen.has(id)) continue;
			seen.add(id);

			const result = await parseRuleFile(absPath, source);
			if (isParseFailure(result)) {
				if (result.reason !== "missing frontmatter") {
					warn(cwd, absPath, result.reason);
				}
				continue;
			}
			out.push({ ...result, id });
		}
	}
	return out;
}

function warn(cwd: string, absPath: string, reason: string): void {
	process.stderr.write(`[pi-rules] skipped ${path.relative(cwd, absPath)}: ${reason}\n`);
}
