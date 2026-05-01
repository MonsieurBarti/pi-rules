type Handler = (e: unknown, ctx: unknown) => unknown | Promise<unknown>;

export function makeFakePi() {
	const handlers = new Map<string, Handler[]>();
	return {
		on(name: string, h: Handler) {
			const list = handlers.get(name) ?? [];
			list.push(h);
			handlers.set(name, list);
		},
		registeredNames(): string[] {
			return [...handlers.keys()].sort();
		},
		registrationCount(): number {
			return [...handlers.values()].reduce((sum, list) => sum + list.length, 0);
		},
		async fire(name: string, e: unknown, ctx: unknown): Promise<unknown> {
			const list = handlers.get(name) ?? [];
			let last: unknown = undefined;
			for (const h of list) last = await h(e, ctx);
			return last;
		},
	};
}
