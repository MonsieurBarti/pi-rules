import { afterEach, describe, expect, it } from "vitest";
import {
	clearInjectionLog,
	injectionLog,
	recordInjection,
} from "../../../src/testing/injection-log.js";

afterEach(() => clearInjectionLog());

describe("injectionLog", () => {
	it("starts empty", () => {
		expect(injectionLog).toEqual([]);
	});

	it("records an injection with path + ruleId", () => {
		recordInjection({ path: "src/app.ts", ruleId: "ts-style" });
		expect(injectionLog).toEqual([{ path: "src/app.ts", ruleId: "ts-style" }]);
	});

	it("clearInjectionLog empties the array in-place (preserves identity)", () => {
		const ref = injectionLog;
		recordInjection({ path: "x", ruleId: "y" });
		clearInjectionLog();
		expect(injectionLog).toBe(ref);
		expect(injectionLog).toEqual([]);
	});
});
