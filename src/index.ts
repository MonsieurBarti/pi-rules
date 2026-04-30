type ExtensionAPI = {
	on: (event: string, handler: (...args: unknown[]) => unknown) => void;
	registerTool: (tool: unknown) => void;
	registerCommand: (name: string, opts: unknown) => void;
};

export default function piRulesExtension(_pi: ExtensionAPI): void {
	// Scaffolded entry point. Rule auto-loading is implemented in milestone M01.
}
