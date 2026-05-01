import nodePath, { type PlatformPath } from "node:path";

export function toRelativePosixForLog(absPath: string, cwd: string): string {
	return toRelativePosixForLogWith(nodePath, absPath, cwd);
}

export function toRelativePosixForLogWith(p: PlatformPath, absPath: string, cwd: string): string {
	const rel = p.relative(cwd, absPath);
	return p.sep === "/" ? rel : rel.split(p.sep).join("/");
}
