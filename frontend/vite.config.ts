import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { compression } from "vite-plugin-compression2";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
	plugins: [
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
		}),
		react(),
		tailwindcss(),
		compression({
			algorithms: ["gzip", "brotli", "zstd"],
		}),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	server: {
		allowedHosts: true,
		...(mode === "development" && {
			proxy: {
				"/api": {
					target: "http://localhost:8787",
					changeOrigin: true,
					ws: true,
				},
			},
		}),
	},
	build: {
		outDir: "../dist/frontend",
		emptyOutDir: true,
	},
}));
