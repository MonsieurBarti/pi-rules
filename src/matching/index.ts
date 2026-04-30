import path from "node:path";
import type { Rule } from "../discovery/index.js";
import { compileRule } from "./compile.js";
import { toRelativePosix } from "./path.js";

export type Matcher = {
	match(absPath: string, cwd: string): Rule[];
};

export function compileMatcher(rules: Rule[]): Matcher {
	const compiled = rules.map((rule) => ({ rule, test: compileRule(rule) }));
	return {
		match(absPath: string, cwd: string): Rule[] {
			if (!cwd || !path.isAbsolute(absPath)) return [];
			const rel = toRelativePosix(absPath, cwd);
			if (rel === null) return [];
			return compiled.filter((c) => c.test(rel)).map((c) => c.rule);
		},
	};
}
