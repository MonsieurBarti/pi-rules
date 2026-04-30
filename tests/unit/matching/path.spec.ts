import path from "node:path";
import { describe, expect, it } from "vitest";
import { toRelativePosix, toRelativePosixWith } from "../../../src/matching/path.js";

describe("toRelativePosix", () => {
	it("returns POSIX-style relative path for cwd-rooted absolute path", () => {
		expect(toRelativePosix("/a/b/c.ts", "/a")).toBe("b/c.ts");
		expect(toRelativePosix("/a/src/x.ts", "/a")).toBe("src/x.ts");
	});

	it("AC6a: returns null when absPath equals cwd", () => {
		expect(toRelativePosix("/a", "/a")).toBeNull();
	});

	it("AC6b: returns null when absPath escapes cwd via ..", () => {
		expect(toRelativePosix("/x/y/z.ts", "/a/b")).toBeNull();
		expect(toRelativePosix("/a", "/a/b")).toBeNull();
	});

	it("AC6c: normalizes Windows backslashes to forward slashes (path.win32 fixture)", () => {
		expect(toRelativePosixWith(path.win32, "C:\\a\\b\\c.ts", "C:\\a")).toBe("b/c.ts");
		expect(toRelativePosixWith(path.win32, "C:\\a", "C:\\a")).toBeNull();
		expect(toRelativePosixWith(path.win32, "C:\\x\\y.ts", "C:\\a")).toBeNull();
	});
});
