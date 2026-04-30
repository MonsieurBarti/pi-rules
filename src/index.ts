import type {
	ExtensionAPI,
	ExtensionContext,
	SessionShutdownEvent,
	SessionStartEvent,
	ToolResultEvent,
} from "@mariozechner/pi-coding-agent";
import { discover } from "./discovery/index.js";
import { type Matcher, compileMatcher } from "./matching/index.js";

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

	pi.on("tool_result", (_e: ToolResultEvent, _ctx: ExtensionContext) => {
		// T03 fills in the body. For T02 the handler exists (AC2a) but is a no-op.
		return undefined;
	});

	pi.on("session_shutdown", (_e: SessionShutdownEvent, _ctx: ExtensionContext) => {
		matcher = null;
		injectedIds.clear();
	});
}
