import { realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseRuleFile } from "./parse.js";
import { type Rule, type Source, isParseFailure } from "./types.js";
import { enumerateRuleFiles } from "./walker.js";

export type { Rule, Source } from "./types.js";
export type DiscoverOptions = { home?: string };

export type RuleRootCandidate = { root: string; source: Source };

export type DiagnosticKind = "parse_error" | "skipped_no_frontmatter" | "unreadable";

export type Diagnostic =
	| { kind: "parse_error"; absPath: string; source: Source; reason: string }
	| { kind: "skipped_no_frontmatter"; absPath: string; source: Source }
	| { kind: "unreadable"; absPath: string; source: Source; code: string };

export type DiscoverResult = { rules: Rule[]; diagnostics: Diagnostic[] };

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

const UNREADABLE_PREFIX = "unreadable: ";

function classifyParseFailure(absPath: string, source: Source, reason: string): Diagnostic {
	if (reason === "missing frontmatter") {
		return { kind: "skipped_no_frontmatter", absPath, source };
	}
	if (reason.startsWith(UNREADABLE_PREFIX)) {
		return {
			kind: "unreadable",
			absPath,
			source,
			code: reason.slice(UNREADABLE_PREFIX.length),
		};
	}
	return { kind: "parse_error", absPath, source, reason };
}

export async function discover(cwd: string, opts?: DiscoverOptions): Promise<DiscoverResult> {
	const home = opts?.home !== undefined ? opts.home : os.homedir();
	const roots = ruleRootCandidates(cwd, home);

	const seen = new Set<string>();
	const rules: Rule[] = [];
	const diagnostics: Diagnostic[] = [];

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
				diagnostics.push({ kind: "unreadable", absPath, source, code });
				continue;
			}
			if (seen.has(id)) continue;
			seen.add(id);

			const result = await parseRuleFile(absPath, source);
			if (isParseFailure(result)) {
				diagnostics.push(classifyParseFailure(absPath, source, result.reason));
				continue;
			}
			rules.push({ ...result, id });
		}
	}
	return { rules, diagnostics };
}
