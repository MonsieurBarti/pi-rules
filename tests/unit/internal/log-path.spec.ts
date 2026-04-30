import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	toRelativePosixForLog,
	toRelativePosixForLogWith,
} from "../../../src/internal/log-path.js";

describe("toRelativePosixForLog", () => {
	it("returns relative path under POSIX semantics (path.posix injection)", () => {
		// Inject path.posix explicitly so the test exercises the `sep === "/"`
		// identity branch regardless of host platform. Using the host `path`
		// module would mean POSIX hosts never see the conversion code at all
		// and Windows hosts always see it — neither is a useful discriminator.
		expect(toRelativePosixForLogWith(path.posix, "/proj/src/app.ts", "/proj")).toBe("src/app.ts");
		expect(toRelativePosixForLogWith(path.posix, "/proj/a/b/c.ts", "/proj")).toBe("a/b/c.ts");
	});

	it("AC9c: normalizes win32 backslashes to forward slashes (path.win32 injection)", () => {
		expect(toRelativePosixForLogWith(path.win32, "C:\\proj\\src\\app.ts", "C:\\proj")).toBe(
			"src/app.ts",
		);
		expect(toRelativePosixForLogWith(path.win32, "C:\\proj\\a\\b\\c.ts", "C:\\proj")).toBe(
			"a/b/c.ts",
		);
	});

	it("default no-arg variant binds to host nodePath", () => {
		// Smoke check that `toRelativePosixForLog` (no PlatformPath arg)
		// forwards correctly to `…With(nodePath, …)`. Asserting against the
		// host's actual cwd shape exercises whichever branch matches the host.
		const cwd = process.cwd();
		const abs = path.join(cwd, "src", "app.ts");
		expect(toRelativePosixForLog(abs, cwd)).toBe("src/app.ts");
	});
});
