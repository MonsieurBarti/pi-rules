import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import piRulesExtension from "../../src/index.js";
import { clearInjectionLog } from "../../src/testing/injection-log.js";
import { makeFakePi } from "../_helpers/fake-pi.js";

const RUN_E2E = process.env.RUN_E2E === "1";
const d = RUN_E2E ? describe : describe.skip;

function readResult(filePath: string) {
	return {
		type: "tool_result" as const,
		toolName: "read",
		toolCallId: "tc-1",
		input: { path: filePath },
		content: [{ type: "text" as const, text: "FILE" }],
		isError: false,
		details: undefined,
	};
}

function writeRule(dir: string, name: string, globs: string[], body: string): void {
	const front = `---\ndescription: t\nglobs: ${JSON.stringify(globs)}\n---\n`;
	writeFileSync(path.join(dir, ".pi", "rules", name), front + body);
}

async function waitForBody(
	// biome-ignore lint/suspicious/noExplicitAny: test fake
	fp: any,
	cwd: string,
	filePath: string,
	expectedBody: string | null,
	timeoutMs = 2000,
): Promise<void> {
	const start = Date.now();
	let last: unknown;
	while (Date.now() - start < timeoutMs) {
		clearInjectionLog();
		// biome-ignore lint/suspicious/noExplicitAny: test fake
		const r: any = await fp.fire("tool_result", readResult(filePath), { cwd });
		last = r;
		if (expectedBody === null && r === undefined) return;
		if (expectedBody !== null && r?.content?.[0]?.text === expectedBody) return;
		await new Promise((res) => setTimeout(res, 50));
	}
	throw new Error(
		`timeout waiting for body=${expectedBody} (last=${JSON.stringify(last)?.slice(0, 200)})`,
	);
}

d("e2e: hot reload via real fs.watch", () => {
	let dir = "";
	beforeEach(() => {
		clearInjectionLog();
		dir = mkdtempSync(path.join(os.tmpdir(), "pi-rules-s02-e2e-"));
		mkdirSync(path.join(dir, ".pi", "rules"), { recursive: true });
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("create + modify + delete all reflect in subsequent tool_results", async () => {
		const fp = makeFakePi();
		// biome-ignore lint/suspicious/noExplicitAny: test fake
		piRulesExtension(fp as any);
		await fp.fire("session_start", { type: "session_start" }, { cwd: dir });

		writeRule(dir, "r.md", ["src/**"], "BODY_V1");
		await waitForBody(fp, dir, "src/a.ts", "BODY_V1");

		writeRule(dir, "r.md", ["src/**"], "BODY_V2");
		await waitForBody(fp, dir, "src/b.ts", "BODY_V2");

		rmSync(path.join(dir, ".pi", "rules", "r.md"));
		await waitForBody(fp, dir, "src/c.ts", null);

		await fp.fire("session_shutdown", { type: "session_shutdown" }, { cwd: dir });
	});
});
