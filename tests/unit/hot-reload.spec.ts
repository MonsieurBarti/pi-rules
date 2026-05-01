import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeExtension } from "../../src/index.js";
import { clearInjectionLog, injectionLog } from "../../src/testing/injection-log.js";
import { makeFakePi } from "../_helpers/fake-pi.js";

type FakeWatcher = {
	emitChange: () => void;
	emitError: (err: Error) => void;
	close: () => void;
	closed: boolean;
};

function makeFakeWatchFactory() {
	const created: FakeWatcher[] = [];
	// biome-ignore lint/suspicious/noExplicitAny: test fake
	const factory: any = (_p: string, _opts: unknown, listener?: any) => {
		const lst = typeof _opts === "function" ? _opts : listener;
		let errH: ((err: Error) => void) | undefined;
		const w: FakeWatcher & { on: (n: string, h: (...a: unknown[]) => void) => unknown } = {
			closed: false,
			close() {
				this.closed = true;
			},
			on(name, h) {
				if (name === "error") errH = h as (err: Error) => void;
				return this;
			},
			emitChange() {
				lst?.("change", "r.md");
			},
			emitError(err) {
				errH?.(err);
			},
		};
		created.push(w);
		return w;
	};
	return { factory, created };
}

function writeRule(dir: string, name: string, globs: string[], body: string): void {
	const front = `---\ndescription: t\nglobs: ${JSON.stringify(globs)}\n---\n`;
	writeFileSync(path.join(dir, ".pi", "rules", name), front + body);
}

function tmpProject(): string {
	const dir = mkdtempSync(path.join(os.tmpdir(), "pi-rules-s02-"));
	mkdirSync(path.join(dir, ".pi", "rules"), { recursive: true });
	return dir;
}

function readResult(filePath: string, body = "FILE") {
	return {
		type: "tool_result" as const,
		toolName: "read",
		toolCallId: "tc-1",
		input: { path: filePath },
		content: [{ type: "text" as const, text: body }],
		isError: false,
		details: undefined,
	};
}

describe("hot-reload extension wiring", () => {
	let cleanups: Array<() => void> = [];
	let homeSpy: ReturnType<typeof vi.spyOn>;
	let fakeHome: string;
	beforeEach(() => {
		clearInjectionLog();
		fakeHome = mkdtempSync(path.join(os.tmpdir(), "pi-rules-s02-home-"));
		cleanups.push(() => rmSync(fakeHome, { recursive: true, force: true }));
		homeSpy = vi.spyOn(os, "homedir").mockReturnValue(fakeHome);
	});
	afterEach(() => {
		homeSpy.mockRestore();
		for (const fn of cleanups) fn();
		cleanups = [];
	});

	// Real timers: each fake-watcher event triggers the same scheduleReload path.
	// Polls a lambda that throws when the post-reload condition isn't met yet.
	// Hand-rolled (rather than vi.waitFor) so the spec runs under Bun's test
	// runner too — Bun does not implement vi.waitFor.
	async function waitFor(
		fn: () => Promise<void>,
		opts: { timeout?: number; interval?: number } = {},
	): Promise<void> {
		const timeout = opts.timeout ?? 1000;
		const interval = opts.interval ?? 5;
		const deadline = Date.now() + timeout;
		let lastErr: unknown;
		while (Date.now() < deadline) {
			try {
				await fn();
				return;
			} catch (err) {
				lastErr = err;
				await new Promise((r) => setTimeout(r, interval));
			}
		}
		throw lastErr ?? new Error("waitFor timed out");
	}

	it("AC2.2: edited rule body re-injects on next match", async () => {
		const dir = tmpProject();
		cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
		writeRule(dir, "r.md", ["src/**"], "BODY_V1");

		const { factory, created } = makeFakeWatchFactory();
		const fp = makeFakePi();
		// biome-ignore lint/suspicious/noExplicitAny: test fake
		makeExtension({ watchFactory: factory, debounceMs: 10 })(fp as any);

		await fp.fire("session_start", { type: "session_start" }, { cwd: dir });

		// biome-ignore lint/suspicious/noExplicitAny: test fake
		const r1: any = await fp.fire("tool_result", readResult("src/a.ts"), { cwd: dir });
		expect(r1.content[0].text).toBe("BODY_V1");

		writeRule(dir, "r.md", ["src/**"], "BODY_V2");
		created[0].emitChange();

		await waitFor(async () => {
			// biome-ignore lint/suspicious/noExplicitAny: test fake
			const r2: any = await fp.fire("tool_result", readResult("src/b.ts"), { cwd: dir });
			expect(r2?.content?.[0]?.text).toBe("BODY_V2");
		});
	});

	it("AC2.5: unchanged rule does not re-inject for already-seen paths after a reload", async () => {
		const dir = tmpProject();
		cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
		writeRule(dir, "r.md", ["src/**"], "STABLE");

		const { factory, created } = makeFakeWatchFactory();
		const fp = makeFakePi();
		// biome-ignore lint/suspicious/noExplicitAny: test fake
		makeExtension({ watchFactory: factory, debounceMs: 10 })(fp as any);

		await fp.fire("session_start", { type: "session_start" }, { cwd: dir });
		await fp.fire("tool_result", readResult("src/a.ts"), { cwd: dir });
		expect(injectionLog.length).toBe(1);

		created[0].emitChange();
		// AC2.5 is a *negative* assertion ("should NOT re-inject"), so polling
		// via waitFor doesn't help — the condition is satisfied trivially before
		// reload completes. We must let the reload land, then assert the dedup
		// state is preserved. Sleep 10x the debounce window for ample headroom
		// over the awaited discover() chain.
		await new Promise((r) => setTimeout(r, 100));

		const r2 = await fp.fire("tool_result", readResult("src/a.ts"), { cwd: dir });
		expect(r2).toBeUndefined();
		expect(injectionLog.length).toBe(1);
	});

	it("AC2.3: deleted rule no longer injects", async () => {
		const dir = tmpProject();
		cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
		writeRule(dir, "r.md", ["src/**"], "DOOMED");

		const { factory, created } = makeFakeWatchFactory();
		const fp = makeFakePi();
		// biome-ignore lint/suspicious/noExplicitAny: test fake
		makeExtension({ watchFactory: factory, debounceMs: 10 })(fp as any);

		await fp.fire("session_start", { type: "session_start" }, { cwd: dir });

		rmSync(path.join(dir, ".pi", "rules", "r.md"));
		created[0].emitChange();

		await waitFor(async () => {
			const r = await fp.fire("tool_result", readResult("src/a.ts"), { cwd: dir });
			expect(r).toBeUndefined();
		});
	});

	it("AC2.6: session_shutdown closes all fake watchers", async () => {
		const dir = tmpProject();
		cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
		writeRule(dir, "r.md", ["src/**"], "B");

		const { factory, created } = makeFakeWatchFactory();
		const fp = makeFakePi();
		// biome-ignore lint/suspicious/noExplicitAny: test fake
		makeExtension({ watchFactory: factory, debounceMs: 10 })(fp as any);

		await fp.fire("session_start", { type: "session_start" }, { cwd: dir });
		expect(created.length).toBeGreaterThanOrEqual(1);
		await fp.fire("session_shutdown", { type: "session_shutdown" }, { cwd: dir });
		expect(created.every((c) => c.closed)).toBe(true);
	});

	it("AC2.9: user dirs absent at session_start are not watched", async () => {
		const dir = tmpProject();
		cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
		writeRule(dir, "r.md", ["src/**"], "B");

		const { factory, created } = makeFakeWatchFactory();
		const fp = makeFakePi();
		// biome-ignore lint/suspicious/noExplicitAny: test fake
		makeExtension({ watchFactory: factory, debounceMs: 10 })(fp as any);
		await fp.fire("session_start", { type: "session_start" }, { cwd: dir });

		expect(created.length).toBe(1);
	});

	it("AC2.10: project dir watched even if empty at session_start", async () => {
		const dir = tmpProject();
		cleanups.push(() => rmSync(dir, { recursive: true, force: true }));

		const { factory, created } = makeFakeWatchFactory();
		const fp = makeFakePi();
		// biome-ignore lint/suspicious/noExplicitAny: test fake
		makeExtension({ watchFactory: factory, debounceMs: 10 })(fp as any);
		await fp.fire("session_start", { type: "session_start" }, { cwd: dir });
		expect(created.length).toBeGreaterThanOrEqual(1);

		writeRule(dir, "r.md", ["src/**"], "LATE");
		created[0].emitChange();

		await waitFor(async () => {
			// biome-ignore lint/suspicious/noExplicitAny: test fake
			const r: any = await fp.fire("tool_result", readResult("src/a.ts"), { cwd: dir });
			expect(r?.content?.[0]?.text).toBe("LATE");
		});
	});
});
