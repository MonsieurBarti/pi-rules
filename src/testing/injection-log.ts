export type Injection = {
	path: string;
	ruleId: string;
};

export const injectionLog: Injection[] = [];

export function recordInjection(input: Injection): void {
	injectionLog.push({ ...input });
}

export function clearInjectionLog(): void {
	injectionLog.length = 0;
}
