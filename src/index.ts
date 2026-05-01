import { stat } from "node:fs/promises";
import os from "node:os";
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
import { runDoctor } from "./commands/doctor.js";
import { type Diagnostic, discover, ruleRootCandidates } from "./discovery/index.js";
import { reconcileInjectedIds } from "./discovery/reconcile.js";
import type { Rule } from "./discovery/types.js";
import { type Watcher, type WatcherOptions, startWatcher } from "./discovery/watcher.js";
import { toRelativePosixForLog } from "./internal/log-path.js";
import { type Matcher, compileMatcher } from "./matching/index.js";
import { recordInjection } from "./testing/injection-log.js";

export type ExtensionDeps = {
	watchFactory?: WatcherOptions["watchFactory"];
	debounceMs?: number;
};

export function makeExtension(deps: ExtensionDeps = {}): (pi: ExtensionAPI) => void {
	return (pi: ExtensionAPI) => {
		let matcher: Matcher | null = null;
		let lastRules: Rule[] = [];
		const injectedIds = new Set<string>();
		let watcher: Watcher | null = null;
		let reloadInFlight = false;
		let pendingReload = false;
		let currentReload: Promise<void> = Promise.resolve();
		let activeCwd: string | null = null;

		const computeRoots = async (cwd: string): Promise<string[]> => {
			const home = os.homedir();
			const candidates = ruleRootCandidates(cwd, home).map((c) => c.root);
			const existing: string[] = [];
			for (const d of candidates) {
				try {
					await stat(d);
					existing.push(d);
				} catch {
					// dir absent at session_start → not watched
				}
			}
			return existing;
		};

		const scheduleReload = (): void => {
			if (activeCwd === null) return;
			if (reloadInFlight) {
				pendingReload = true;
				return;
			}
			reloadInFlight = true;
			const cwd = activeCwd;
			currentReload = (async () => {
				try {
					const { rules: next, diagnostics } = await discover(cwd);
					for (const d of diagnostics) emitDiagnostic(cwd, d);
					const nextMatcher = compileMatcher(next);
					reconcileInjectedIds(lastRules, next, injectedIds);
					matcher = nextMatcher;
					lastRules = next;
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					process.stderr.write(`[pi-rules] reload failed: ${msg}\n`);
				} finally {
					reloadInFlight = false;
					if (pendingReload) {
						pendingReload = false;
						queueMicrotask(scheduleReload);
					}
				}
			})();
		};

		pi.on("session_start", async (_e: SessionStartEvent, ctx: ExtensionContext) => {
			injectedIds.clear();
			activeCwd = ctx.cwd;
			try {
				const { rules, diagnostics } = await discover(ctx.cwd);
				for (const d of diagnostics) emitDiagnostic(ctx.cwd, d);
				matcher = compileMatcher(rules);
				lastRules = rules;
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				process.stderr.write(`[pi-rules] discovery failed: ${msg}\n`);
				matcher = compileMatcher([]);
				lastRules = [];
			}
			const roots = await computeRoots(ctx.cwd);
			watcher = startWatcher({
				roots,
				onChange: scheduleReload,
				debounceMs: deps.debounceMs,
				watchFactory: deps.watchFactory,
			});
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

		pi.on("session_shutdown", async (_e: SessionShutdownEvent, _ctx: ExtensionContext) => {
			if (watcher !== null) {
				await watcher.stop();
				watcher = null;
			}
			await currentReload;
			matcher = null;
			injectedIds.clear();
			lastRules = [];
			activeCwd = null;
		});

		pi.registerCommand("pi-rules", {
			description: "pi-rules — rule discovery diagnostics. Subcommands: doctor",
			getArgumentCompletions: (prefix: string) => {
				const sub = prefix.trim().split(/\s+/)[0] ?? "";
				return SUBCOMMANDS.filter((c) => c.startsWith(sub)).map((c) => ({
					value: c,
					label: c,
				}));
			},
			handler: async (input, uiCtx) => {
				const parts = input.trim().split(/\s+/).filter(Boolean);
				const sub = parts[0] ?? "";
				if (sub === "doctor") {
					await runDoctor(pi, uiCtx, activeCwd ?? process.cwd());
					return;
				}
				pi.sendUserMessage(
					sub ? `Unknown /pi-rules subcommand: ${sub}. Try: doctor` : "/pi-rules — try: doctor",
				);
			},
		});
	};
}

const SUBCOMMANDS = ["doctor"] as const;

export default makeExtension();

function emitDiagnostic(cwd: string, d: Diagnostic): void {
	if (d.kind === "skipped_no_frontmatter") return;
	const reason =
		d.kind === "unreadable"
			? `unreadable: ${d.code}`
			: d.kind === "symlink_escape"
				? `symlink escape: ${d.targetPath}`
				: d.reason;
	process.stderr.write(`[pi-rules] skipped ${path.relative(cwd, d.absPath)}: ${reason}\n`);
}
