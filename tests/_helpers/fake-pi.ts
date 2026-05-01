type Handler = (e: unknown, ctx: unknown) => unknown | Promise<unknown>;

export type RegisteredCommandRecord = { name: string; options: unknown };

export function makeFakePi() {
	const handlers = new Map<string, Handler[]>();
	const __registeredCommands: RegisteredCommandRecord[] = [];
	const __userMessages: string[] = [];
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
		registerCommand(name: string, options: unknown): void {
			__registeredCommands.push({ name, options });
		},
		sendUserMessage(content: string): void {
			__userMessages.push(content);
		},
		__registeredCommands,
		__userMessages,
		async fire(name: string, e: unknown, ctx: unknown): Promise<unknown> {
			const list = handlers.get(name) ?? [];
			let last: unknown = undefined;
			for (const h of list) last = await h(e, ctx);
			return last;
		},
	};
}
