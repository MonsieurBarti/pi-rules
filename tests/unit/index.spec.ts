import { describe, expect, it, vi } from "vitest";
import piRulesExtension from "../../src/index";

describe("pi-rules extension entry", () => {
	it("registers without throwing on a minimal pi API", () => {
		const pi = {
			on: vi.fn(),
			registerTool: vi.fn(),
			registerCommand: vi.fn(),
		};
		expect(() => piRulesExtension(pi)).not.toThrow();
	});
});
