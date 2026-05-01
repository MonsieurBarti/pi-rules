import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runDoctor } from "../../../src/commands/doctor.js";

type FakePi = {
	sendUserMessage: (msg: string) => void;
	__messages: string[];
};

const makeFakePi = (): FakePi => {
	const __messages: string[] = [];
	return {
		__messages,
		sendUserMessage: (msg: string) => {
			__messages.push(msg);
		},
	};
};

let tmp: string;
beforeEach(async () => {
	tmp = await mkdtemp(path.join(os.tmpdir(), "pi-rules-doctor-"));
	await mkdir(path.join(tmp, ".pi/rules"), { recursive: true });
});
afterEach(async () => {
	await rm(tmp, { recursive: true, force: true });
});

describe("runDoctor", () => {
	it("happy path: emits OK header via sendUserMessage", async () => {
		await writeFile(
			path.join(tmp, ".pi/rules/a.md"),
			'---\ndescription: a\nglobs: ["**/*"]\n---\n',
		);
		const pi = makeFakePi();
		// biome-ignore lint/suspicious/noExplicitAny: minimal pi shape for handler
		await runDoctor(pi as any, null, tmp);
		expect(pi.__messages).toHaveLength(1);
		expect(pi.__messages[0]).toMatch(/^pi-rules doctor: OK — 1 rules, 0 errors, 0 skipped\n/);
	});

	it("with parse_error: emits ERRORS header", async () => {
		await writeFile(path.join(tmp, ".pi/rules/bad.md"), '---\nglobs: ["**/*"]\n---\n');
		const pi = makeFakePi();
		// biome-ignore lint/suspicious/noExplicitAny: minimal pi shape
		await runDoctor(pi as any, null, tmp);
		expect(pi.__messages).toHaveLength(1);
		expect(pi.__messages[0]).toMatch(/^pi-rules doctor: ERRORS — 0 rules, 1 errors, 0 skipped\n/);
		expect(pi.__messages[0]).toContain("missing description");
	});

	it("skipped-only: still OK header", async () => {
		await writeFile(path.join(tmp, ".pi/rules/plain.md"), "no frontmatter\n");
		const pi = makeFakePi();
		// biome-ignore lint/suspicious/noExplicitAny: minimal pi shape
		await runDoctor(pi as any, null, tmp);
		expect(pi.__messages[0]).toMatch(/^pi-rules doctor: OK — 0 rules, 0 errors, 1 skipped\n/);
	});

	it("discover() rejection: emits FAILED header", async () => {
		const discoveryMod = await import("../../../src/discovery/index.js");
		const spy = vi.spyOn(discoveryMod, "discover").mockRejectedValueOnce(new Error("disk on fire"));
		const pi = makeFakePi();
		// biome-ignore lint/suspicious/noExplicitAny: minimal pi shape
		await runDoctor(pi as any, null, tmp);
		spy.mockRestore();
		expect(pi.__messages).toHaveLength(1);
		expect(pi.__messages[0]).toBe("pi-rules doctor: FAILED — disk on fire");
	});

	it("uiCtx with hasUI=true: notify(message, type) — type is 'error' on errored", async () => {
		await writeFile(path.join(tmp, ".pi/rules/bad.md"), '---\nglobs: ["**/*"]\n---\n');
		const pi = makeFakePi();
		const notify = vi.fn();
		const uiCtx = { hasUI: true, ui: { notify } };
		// biome-ignore lint/suspicious/noExplicitAny: partial uiCtx for handler
		await runDoctor(pi as any, uiCtx as any, tmp);
		expect(notify).toHaveBeenCalledTimes(1);
		expect(notify.mock.calls[0][0]).toMatch(/^pi-rules doctor: ERRORS — /);
		expect(notify.mock.calls[0][1]).toBe("error");
	});

	it("uiCtx with hasUI=true ∧ no errors: notify type is 'info'", async () => {
		await writeFile(
			path.join(tmp, ".pi/rules/a.md"),
			'---\ndescription: a\nglobs: ["**/*"]\n---\n',
		);
		const pi = makeFakePi();
		const notify = vi.fn();
		const uiCtx = { hasUI: true, ui: { notify } };
		// biome-ignore lint/suspicious/noExplicitAny: partial uiCtx for handler
		await runDoctor(pi as any, uiCtx as any, tmp);
		expect(notify.mock.calls[0][1]).toBe("info");
	});

	it("uiCtx with hasUI=false: does NOT call notify; sendUserMessage still fires", async () => {
		await writeFile(
			path.join(tmp, ".pi/rules/a.md"),
			'---\ndescription: a\nglobs: ["**/*"]\n---\n',
		);
		const pi = makeFakePi();
		const notify = vi.fn();
		const uiCtx = { hasUI: false, ui: { notify } };
		// biome-ignore lint/suspicious/noExplicitAny: partial uiCtx for handler
		await runDoctor(pi as any, uiCtx as any, tmp);
		expect(notify).not.toHaveBeenCalled();
		expect(pi.__messages).toHaveLength(1);
	});
});
