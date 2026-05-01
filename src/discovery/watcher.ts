import { type FSWatcher, watch as defaultWatch } from "node:fs";

export type Watcher = { stop: () => Promise<void> };

export type WatcherOptions = {
	roots: string[];
	onChange: () => void;
	debounceMs?: number;
	watchFactory?: typeof defaultWatch;
};

export function startWatcher(opts: WatcherOptions): Watcher {
	const debounceMs = opts.debounceMs ?? 100;
	const factory = opts.watchFactory ?? defaultWatch;
	const watchers: FSWatcher[] = [];
	let timer: ReturnType<typeof setTimeout> | null = null;
	let stopped = false;

	const fire = () => {
		timer = null;
		if (stopped) return;
		try {
			opts.onChange();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			process.stderr.write(`[pi-rules] onChange threw: ${msg}\n`);
		}
	};

	const schedule = () => {
		if (stopped) return;
		if (timer !== null) clearTimeout(timer);
		timer = setTimeout(fire, debounceMs);
	};

	for (const root of opts.roots) {
		try {
			const w = factory(root, { recursive: true }, () => schedule());
			w.on("error", (err: Error) => {
				process.stderr.write(`[pi-rules] watcher error (${root}): ${err.message}\n`);
			});
			watchers.push(w);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			process.stderr.write(`[pi-rules] failed to watch ${root}: ${msg}\n`);
		}
	}

	return {
		stop: async () => {
			stopped = true;
			if (timer !== null) {
				clearTimeout(timer);
				timer = null;
			}
			for (const w of watchers) {
				try {
					w.close();
				} catch {
					// best-effort close
				}
			}
		},
	};
}
