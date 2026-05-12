import { defineConfig } from "rolldown";

export default defineConfig({
	input: ["src/app.ts"],
	platform: "node",
	output: {
		dir: "../dist",
		format: "esm",
		sourcemap: true,
		cleanDir: true,
	},
});
