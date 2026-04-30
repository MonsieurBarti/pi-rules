import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["tests/**/*.spec.ts"],
		exclude: ["node_modules", "dist"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: [
				"node_modules/",
				"tests/",
				"dist/",
				"**/*.d.ts",
				"src/index.ts",
				"vitest.config.ts",
				"commitlint.config.cjs",
			],
		},
	},
});
