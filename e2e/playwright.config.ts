import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: [["html", { open: "never" }]],
	use: {
		baseURL: "http://127.0.0.1:8090",

		trace: "on-first-retry",
	},
	projects: [
		{ name: "setup", testMatch: /.*\.setup\.ts/ },
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/user.json" },
			dependencies: ["setup"],
		},
	],

	globalSetup: "./global-setup.ts",
	globalTeardown: "./global-teardown.ts",

	webServer: {
		command: "docker compose -f docker-compose.e2e.yml up --force-recreate --build",
		url: "http://127.0.0.1:8090/api/v1/health",
		timeout: 5 * 60 * 1000, // 5 minutes
		reuseExistingServer: false,
		stdout: "pipe",
		stderr: "pipe",
	},
});
