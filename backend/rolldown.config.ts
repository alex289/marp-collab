import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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

// Slide Tailwind support compiles against this stylesheet at runtime; see
// src/collab/slide-tailwind.ts.
function copyTailwindThemePlugin(): Plugin {
	return {
		name: "copy-tailwind-theme",
		writeBundle: async () => {
			const targetDir = join(import.meta.dirname, "../dist/assets/tailwind");
			await mkdir(targetDir, { recursive: true });
			await cp(
				join(import.meta.dirname, "./node_modules/tailwindcss/theme.css"),
				join(targetDir, "theme.css"),
			);
		},
	};
}

function copyMermaidAssetsPlugin(): Plugin {
	return {
		name: "copy-mermaid-assets",
		writeBundle: async () => {
			const targetDir = join(import.meta.dirname, "../dist/assets/mermaid");
			await mkdir(targetDir, { recursive: true });
			await Promise.all([
				cp(
					join(import.meta.dirname, "../shared/slide-mermaid-dom.js"),
					join(targetDir, "slide-mermaid-dom.js"),
				),
				cp(
					fileURLToPath(import.meta.resolve("mermaid/dist/mermaid.min.js")),
					join(targetDir, "mermaid.min.js"),
				),
				cp(fileURLToPath(import.meta.resolve("mermaid/LICENSE")), join(targetDir, "LICENSE")),
			]);
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
	plugins: [
		copyNativeAddonsPlugin(),
		copyTemplateAssetsPlugin(),
		copyTailwindThemePlugin(),
		copyMermaidAssetsPlugin(),
	],
	output: {
		dir: "../dist/bin",
		format: "esm",
		sourcemap: true,
		cleanDir: false,
	},
});
