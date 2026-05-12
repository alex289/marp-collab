import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
	plugins: [react(), tailwindcss()],
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
}));
