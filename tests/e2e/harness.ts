import { writeFileSync } from "node:fs";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import piRulesExtension from "../../src/index.js";
import { injectionLog } from "../../src/testing/injection-log.js";

export default function harness(pi: ExtensionAPI): void {
	piRulesExtension(pi);
	pi.on("session_shutdown", () => {
		const out = process.env.PI_RULES_E2E_LOG;
		if (!out) return;
		writeFileSync(out, JSON.stringify(injectionLog), "utf8");
	});
}
