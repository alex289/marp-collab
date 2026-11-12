import { cp } from "node:fs/promises";
import { join } from "node:path";
import { defineConfig, type Plugin } from "rolldown";

function copyNativeAddonsPlugin(): Plugin {
	return {
		name: "copy-native-addons",
		writeBundle: async () => {
			const distDir = join(import.meta.dirname, "../dist");
			const sqliteDir = join(import.meta.dirname, "./node_modules/better-sqlite3");
			await cp(join(sqliteDir, "prebuilds"), join(distDir, "prebuilds"), {
				recursive: true,
			});
		},
	};
}

function copyTemplateAssetsPlugin(): Plugin {
	return {
		name: "copy-template-assets",
		writeBundle: async () => {
			const distDir = join(import.meta.dirname, "../dist");
			await cp(join(import.meta.dirname, "./assets"), join(distDir, "assets"), {
				recursive: true,
			});
		},
	};
}

export default defineConfig({
	// Git tasks run in their own process; see src/projects/git-process.ts.
	input: { app: "src/app.ts", "git-worker": "src/projects/git-worker.ts" },
	platform: "node",
	transform: {
		define: {
			__filename: "import.meta.filename",
			__dirname: "import.meta.dirname",
		},
	},
	plugins: [copyNativeAddonsPlugin(), copyTemplateAssetsPlugin()],
	output: {
		dir: "../dist/bin",
		format: "esm",
		sourcemap: true,
		cleanDir: false,
	},
});
