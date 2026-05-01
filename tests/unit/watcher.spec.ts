import type { FSWatcher, WatchListener } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startWatcher } from "../../src/discovery/watcher.js";

type FakeWatcher = FSWatcher & {
	emitChange: (event: "rename" | "change", file?: string) => void;
	emitError: (err: Error) => void;
	closed: boolean;
};

function makeFakeWatchFactory() {
	const created: FakeWatcher[] = [];
	// biome-ignore lint/suspicious/noExplicitAny: test fake
	const factory: any = (_path: string, _opts: unknown, _listener?: WatchListener<string>) => {
		let listener: WatchListener<string> | undefined;
		let errorHandler: ((err: Error) => void) | undefined;
		if (typeof _opts === "function") listener = _opts as WatchListener<string>;
		else listener = _listener;
		// biome-ignore lint/suspicious/noExplicitAny: test fake
		const watcher: any = {
			closed: false,
			close() {
				this.closed = true;
			},
			on(name: string, h: (...args: unknown[]) => void) {
				if (name === "error") errorHandler = h as (err: Error) => void;
				if (name === "change") listener = h as WatchListener<string>;
				return this;
			},
			emitChange(event: "rename" | "change", file = "r.md") {
				listener?.(event, file);
			},
			emitError(err: Error) {
				errorHandler?.(err);
			},
		};
		created.push(watcher as FakeWatcher);
		return watcher as FakeWatcher;
	};
	return { factory, created };
}

describe("startWatcher", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("AC2.1+AC2.8: coalesces N events within debounce into one onChange", () => {
		const { factory, created } = makeFakeWatchFactory();
		const onChange = vi.fn();
		const w = startWatcher({
			roots: ["/tmp/fake"],
			onChange,
			debounceMs: 100,
			watchFactory: factory,
		});
		expect(created.length).toBe(1);
		created[0].emitChange("change");
		created[0].emitChange("change");
		created[0].emitChange("rename");
		expect(onChange).not.toHaveBeenCalled();
		vi.advanceTimersByTime(99);
		expect(onChange).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(onChange).toHaveBeenCalledTimes(1);
		void w.stop();
	});

	it("AC2.1: a single event still fires after debounce", () => {
		const { factory, created } = makeFakeWatchFactory();
		const onChange = vi.fn();
		const w = startWatcher({
			roots: ["/tmp/fake"],
			onChange,
			debounceMs: 50,
			watchFactory: factory,
		});
		created[0].emitChange("change");
		vi.advanceTimersByTime(50);
		expect(onChange).toHaveBeenCalledTimes(1);
		void w.stop();
	});

	it("AC2.6: stop() closes all watchers and cancels pending debounce", async () => {
		const { factory, created } = makeFakeWatchFactory();
		const onChange = vi.fn();
		const w = startWatcher({
			roots: ["/tmp/a", "/tmp/b"],
			onChange,
			debounceMs: 100,
			watchFactory: factory,
		});
		expect(created.length).toBe(2);
		created[0].emitChange("change");
		await w.stop();
		vi.advanceTimersByTime(1000);
		expect(onChange).not.toHaveBeenCalled();
		expect(created.every((c) => c.closed)).toBe(true);
	});

	it("AC2.7: watcher error event is non-fatal; subsequent changes still fire onChange", () => {
		const { factory, created } = makeFakeWatchFactory();
		const onChange = vi.fn();
		const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
		const w = startWatcher({
			roots: ["/tmp/fake"],
			onChange,
			debounceMs: 100,
			watchFactory: factory,
		});
		created[0].emitError(new Error("EACCES"));
		expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("[pi-rules] watcher error"));
		created[0].emitChange("change");
		vi.advanceTimersByTime(100);
		expect(onChange).toHaveBeenCalledTimes(1);
		stderrSpy.mockRestore();
		void w.stop();
	});

	it("attaches one fake watcher per root", () => {
		const { factory, created } = makeFakeWatchFactory();
		const w = startWatcher({
			roots: ["/tmp/a", "/tmp/b", "/tmp/c"],
			onChange: () => {},
			debounceMs: 100,
			watchFactory: factory,
		});
		expect(created.length).toBe(3);
		void w.stop();
	});
});
