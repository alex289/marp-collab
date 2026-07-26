import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { compression } from "vite-plugin-compression2";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
	plugins: [
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
		}),
		react(),
		VitePWA({
			registerType: "autoUpdate",
			devOptions: {
				enabled: true,
			},
			workbox: {
				cleanupOutdatedCaches: true,
				...(mode !== "development" && {
					globPatterns: [],
					navigateFallback: undefined,
				}),
			},
			manifest: {
				name: "Marp Collab",
				short_name: "Marp Collab",
				description: "A collaborative presentation editor powered by Marp",
				theme_color: "#2266a7",
				icons: [
					{
						src: "pwa-64x64.png",
						sizes: "64x64",
						type: "image/png",
					},
					{
						src: "pwa-192x192.png",
						sizes: "192x192",
						type: "image/png",
					},
					{
						src: "pwa-512x512.png",
						sizes: "512x512",
						type: "image/png",
					},
					{
						src: "maskable-icon-512x512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "maskable",
					},
				],
			},
		}),
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
