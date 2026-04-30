import path from "node:path";
import {
	type ExtensionAPI,
	type ExtensionContext,
	type SessionShutdownEvent,
	type SessionStartEvent,
	type ToolResultEvent,
	isEditToolResult,
	isReadToolResult,
	isWriteToolResult,
} from "@mariozechner/pi-coding-agent";
import { discover } from "./discovery/index.js";
import { toRelativePosixForLog } from "./internal/log-path.js";
import { type Matcher, compileMatcher } from "./matching/index.js";
import { recordInjection } from "./testing/injection-log.js";

export default function piRulesExtension(pi: ExtensionAPI): void {
	let matcher: Matcher | null = null;
	const injectedIds = new Set<string>();

	pi.on("session_start", async (_e: SessionStartEvent, ctx: ExtensionContext) => {
		injectedIds.clear();
		try {
			const rules = await discover(ctx.cwd);
			matcher = compileMatcher(rules);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			process.stderr.write(`[pi-rules] discovery failed: ${msg}\n`);
			matcher = compileMatcher([]);
		}
	});

	pi.on("tool_result", (e: ToolResultEvent, ctx: ExtensionContext) => {
		if (matcher === null) return;
		if (e.isError) return;
		if (!isReadToolResult(e) && !isEditToolResult(e) && !isWriteToolResult(e)) return;

		const raw: unknown = e.input.path;
		if (typeof raw !== "string" || raw.length === 0) return;

		const abs = path.resolve(ctx.cwd, raw);
		const matches = matcher.match(abs, ctx.cwd);
		if (matches.length === 0) return;

		const fresh = matches.filter((r) => !injectedIds.has(r.id));
		if (fresh.length === 0) return;

		const relPath = toRelativePosixForLog(abs, ctx.cwd);
		for (const r of fresh) {
			injectedIds.add(r.id);
			recordInjection({ path: relPath, ruleId: r.id });
		}

		return {
			content: [...fresh.map((r) => ({ type: "text" as const, text: r.body })), ...e.content],
		};
	});

	pi.on("session_shutdown", (_e: SessionShutdownEvent, _ctx: ExtensionContext) => {
		matcher = null;
		injectedIds.clear();
	});
}
