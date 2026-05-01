import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import * as discoveryMod from "../discovery/index.js";
import { format, hasErrors } from "./doctor-format.js";

export async function runDoctor(
	pi: ExtensionAPI,
	uiCtx: ExtensionCommandContext | null,
	cwd: string,
): Promise<void> {
	let report: string;
	let errored: boolean;
	try {
		const result = await discoveryMod.discover(cwd);
		report = format(result);
		errored = hasErrors(result);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		const failed = `pi-rules doctor: FAILED — ${msg}`;
		if (uiCtx?.hasUI) uiCtx.ui.notify(failed, "error");
		pi.sendUserMessage(failed);
		return;
	}
	if (uiCtx?.hasUI) uiCtx.ui.notify(report, errored ? "error" : "info");
	pi.sendUserMessage(report);
}
