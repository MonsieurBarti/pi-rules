import type { Rule } from "./types.js";

export function reconcileInjectedIds(
	prev: readonly Rule[],
	next: readonly Rule[],
	ids: Set<string>,
): void {
	const prevById = new Map(prev.map((r) => [r.id, r]));
	const nextById = new Map(next.map((r) => [r.id, r]));
	for (const id of [...ids]) {
		const nextRule = nextById.get(id);
		if (nextRule === undefined) {
			ids.delete(id);
			continue;
		}
		const prevRule = prevById.get(id);
		if (prevRule === undefined || prevRule.body !== nextRule.body) {
			ids.delete(id);
		}
	}
}
