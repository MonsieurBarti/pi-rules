import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export async function enumerateRuleFiles(root: string): Promise<string[]> {
	try {
		await stat(root);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw err;
	}

	const entries = await readdir(root, { recursive: true, withFileTypes: true });
	const out: string[] = [];
	for (const e of entries) {
		if (!e.isFile() && !e.isSymbolicLink()) continue;
		if (!e.name.endsWith(".md")) continue;
		const parent =
			(e as unknown as { parentPath?: string }).parentPath ??
			(e as unknown as { path?: string }).path ??
			root;
		out.push(path.join(parent, e.name));
	}
	return out;
}
