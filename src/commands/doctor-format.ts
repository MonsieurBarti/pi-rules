import type { Diagnostic, DiscoverResult } from "../discovery/index.js";
import type { Rule } from "../discovery/types.js";

type ErrorDiagnostic = Extract<
	Diagnostic,
	{ kind: "parse_error" } | { kind: "unreadable" } | { kind: "symlink_escape" }
>;

export function hasErrors(result: DiscoverResult): boolean {
	return result.diagnostics.some(
		(d) => d.kind === "parse_error" || d.kind === "unreadable" || d.kind === "symlink_escape",
	);
}

export function format(result: DiscoverResult): string {
	const errors = result.diagnostics.filter(
		(d): d is ErrorDiagnostic =>
			d.kind === "parse_error" || d.kind === "unreadable" || d.kind === "symlink_escape",
	);
	const skipped = result.diagnostics.filter(
		(d): d is Extract<Diagnostic, { kind: "skipped_no_frontmatter" }> =>
			d.kind === "skipped_no_frontmatter",
	);

	const status = errors.length === 0 ? "OK" : "ERRORS";
	const header = `pi-rules doctor: ${status} — ${result.rules.length} rules, ${errors.length} errors, ${skipped.length} skipped`;

	const sections: string[] = [];
	if (result.rules.length > 0) sections.push(formatRules(result.rules));
	if (errors.length > 0) sections.push(formatErrors(errors));
	if (skipped.length > 0) sections.push(formatSkipped(skipped));
	sections.push(formatCoverage(result));

	return [header, ...sections].join("\n\n");
}

function formatRules(rules: Rule[]): string {
	const lines: string[] = ["Rules:"];
	for (const r of rules) {
		lines.push(`  [${r.source}] ${r.sourcePath}`);
		lines.push(`             globs: ${r.globs.length === 0 ? "(none)" : r.globs.join(",")}`);
		lines.push(`             alwaysApply: ${r.alwaysApply}`);
		if (r.id !== r.sourcePath) {
			lines.push(`             → ${r.id}`);
		}
	}
	return lines.join("\n");
}

function formatErrors(errors: ErrorDiagnostic[]): string {
	const lines: string[] = ["Errors:"];
	for (const e of errors) {
		lines.push(`  ${e.absPath}`);
		lines.push(`    ${errorReason(e)}`);
	}
	return lines.join("\n");
}

function errorReason(e: ErrorDiagnostic): string {
	if (e.kind === "unreadable") return `unreadable: ${e.code}`;
	if (e.kind === "symlink_escape") return `symlink escape: ${e.targetPath}`;
	return e.reason;
}

function formatSkipped(
	skipped: Array<Extract<Diagnostic, { kind: "skipped_no_frontmatter" }>>,
): string {
	const lines: string[] = ["Skipped (no frontmatter):"];
	for (const s of skipped) lines.push(`  ${s.absPath}`);
	return lines.join("\n");
}

function formatCoverage(result: DiscoverResult): string {
	const total = result.rules.length;
	const always = result.rules.filter((r) => r.alwaysApply).length;
	const piCount = result.rules.filter((r) => r.source === "pi").length;
	const claudeCount = result.rules.filter((r) => r.source === "claude").length;
	return [
		"Coverage:",
		`  total rules:    ${total}`,
		`  alwaysApply:    ${always}`,
		`  glob-scoped:    ${total - always}`,
		`  sources:        pi=${piCount}, claude=${claudeCount}`,
	].join("\n");
}
