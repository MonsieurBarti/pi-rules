import { afterEach, describe, expect, it, vi } from "vitest";
import spikeProbe from "../../../spike/probe.js";
import { clearInjectionLog, injectionLog } from "../../../src/testing/injection-log.js";

type Handler = (event: unknown, ctx?: unknown) => unknown;

function makeFakeApi() {
	const handlers = new Map<string, Handler>();
	const api = {
		on: vi.fn((name: string, h: Handler) => {
			handlers.set(name, h);
		}),
		registerTool: vi.fn(),
		registerCommand: vi.fn(),
	};
	return { api, handlers };
}

afterEach(() => clearInjectionLog());

describe("spike/probe — synthetic smoke (deleted in T05)", () => {
	it("registers tool_call, tool_result, and session_shutdown handlers", () => {
		const { api, handlers } = makeFakeApi();
		spikeProbe(api as never);
		expect(handlers.has("tool_call")).toBe(true);
		expect(handlers.has("tool_result")).toBe(true);
		expect(handlers.has("session_shutdown")).toBe(true);
	});

	it("tool_result handler returns a content patch with the rule body prepended", async () => {
		const { api, handlers } = makeFakeApi();
		spikeProbe(api as never);
		const handler = handlers.get("tool_result");
		if (!handler) throw new Error("tool_result handler not registered");
		const original = [
			{
				type: "text" as const,
				text: 'export const PROBE_MARKER = "probe-target-v1";',
			},
		];
		const patch = (await handler(
			{
				type: "tool_result",
				toolCallId: "t1",
				toolName: "read",
				input: { path: "tests/fixtures/probe-target.ts" },
				content: original,
				isError: false,
				details: undefined,
			},
			{},
		)) as { content: { type: string; text: string }[] };
		expect(patch.content[0]?.text).toContain("[spike-marker]");
		expect(patch.content.slice(1)).toEqual(original);
	});

	it("tool_result handler records the injection in injectionLog", async () => {
		const { api, handlers } = makeFakeApi();
		spikeProbe(api as never);
		const handler = handlers.get("tool_result");
		if (!handler) throw new Error("tool_result handler not registered");
		await handler(
			{
				type: "tool_result",
				toolCallId: "t1",
				toolName: "edit",
				input: { path: "src/app.ts" },
				content: [],
				isError: false,
				details: undefined,
			},
			{},
		);
		expect(injectionLog).toEqual([{ path: "src/app.ts", ruleId: "spike-marker" }]);
	});
});
