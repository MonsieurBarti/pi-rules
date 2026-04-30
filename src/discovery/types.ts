export type Source = "pi" | "claude";

export type Rule = {
	id: string;
	sourcePath: string;
	source: Source;
	description: string;
	globs: string[];
	alwaysApply: boolean;
	body: string;
};

export type ParseFailure = {
	kind: "parse-failure";
	reason: string;
};

export function isParseFailure(value: Rule | ParseFailure): value is ParseFailure {
	return (value as ParseFailure).kind === "parse-failure";
}
