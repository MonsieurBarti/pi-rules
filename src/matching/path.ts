import nodePath, { type PlatformPath } from "node:path";

export function toRelativePosix(absPath: string, cwd: string): string | null {
	return toRelativePosixWith(nodePath, absPath, cwd);
}

export function toRelativePosixWith(p: PlatformPath, absPath: string, cwd: string): string | null {
	const rel = p.relative(cwd, absPath);
	if (rel === "") return null;
	if (rel === ".." || rel.startsWith(`..${p.sep}`)) return null;
	return p.sep === "/" ? rel : rel.split(p.sep).join("/");
}
