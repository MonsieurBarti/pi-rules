import picomatch from "picomatch";
import type { Rule } from "../discovery/index.js";

const OPTS = { dot: true, nonegate: true } as const;

export function compileRule(rule: Rule): (rel: string) => boolean {
	if (rule.alwaysApply) return () => true;

	const survivors: string[] = [];
	for (const g of rule.globs) {
		try {
			picomatch.makeRe(g, { ...OPTS, debug: true });
			survivors.push(g);
		} catch {
			process.stderr.write(
				`[pi-rules] invalid glob in ${rule.sourcePath}: ${JSON.stringify(g)} -- never matches\n`,
			);
		}
	}

	if (survivors.length === 0) return () => false;
	return picomatch(survivors, OPTS);
}
