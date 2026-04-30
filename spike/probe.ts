/**
 * S01 spike — DELETED at slice close (AC5a).
 *
 * Goals (SPEC §"Spike Plan"):
 *   1. Log every event name pi-coding-agent emits.
 *   2. For tool_call read|edit|write — record event.input.path raw +
 *      cwd-resolved.
 *   3. For tool_result read|edit|write — prepend a marker rule body to
 *      event.content (Shape C) and record into injectionLog.
 *   4. Confirm modified content survives to next model turn (manual
 *      verification by reading the assistant's reply).
 */
import * as path from "node:path";
import {
	type ExtensionAPI,
	isEditToolResult,
	isReadToolResult,
	isToolCallEventType,
	isWriteToolResult,
} from "@mariozechner/pi-coding-agent";
import { recordInjection } from "../src/testing/injection-log.js";

const SPIKE_RULE_ID = "spike-marker";
const SPIKE_RULE_BODY = "[spike-marker] If you can read this line, Shape C survived.";

export default function spikeProbe(pi: ExtensionAPI): void {
	// The `pi.on` wrapping shim below is SPIKE-ONLY debug instrumentation
	// for goal 1 (event-name discovery). Production extension code (S02..S04)
	// MUST NOT mutate the ExtensionAPI port — that pattern is forbidden.
	const events: string[] = [];

	const piAny = pi as unknown as {
		on: (name: string, handler: (...a: unknown[]) => unknown) => void;
	};
	const originalOn = piAny.on.bind(piAny);
	piAny.on = (name: string, handler: (...a: unknown[]) => unknown) => {
		events.push(`registered:${name}`);
		return originalOn(name, handler);
	};

	pi.on("tool_call", async (event, ctx) => {
		if (
			isToolCallEventType("read", event) ||
			isToolCallEventType("edit", event) ||
			isToolCallEventType("write", event)
		) {
			const raw = event.input.path;
			const resolved = path.resolve(ctx.cwd, raw);
			console.error(
				`[spike] tool_call ${event.toolName} raw=${JSON.stringify(raw)} resolved=${JSON.stringify(resolved)}`,
			);
		}
	});

	pi.on("tool_result", async (event) => {
		const isFileTool =
			isReadToolResult(event) || isEditToolResult(event) || isWriteToolResult(event);
		if (!isFileTool) return;

		const inputPath = (event.input as { path?: string }).path ?? "<unknown>";

		recordInjection({ path: inputPath, ruleId: SPIKE_RULE_ID });
		return {
			content: [{ type: "text", text: SPIKE_RULE_BODY }, ...event.content],
		};
	});

	pi.on("session_shutdown", async () => {
		console.error(`[spike] events seen: ${events.length}`);
		for (const e of events) console.error(`[spike]   ${e}`);
	});
}
