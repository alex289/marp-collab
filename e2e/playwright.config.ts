import { defineConfig, devices } from "@playwright/test";
import { APP_URL, AUTH_STATE_PATH } from "./test-environment.ts";

export default defineConfig({
	testDir: "./tests",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: [["html", { open: "never" }]],
	use: {
		baseURL: APP_URL,

		trace: "on-first-retry",
	},
	projects: [
		{ name: "setup", testMatch: /.*\.setup\.ts/ },
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE_PATH },
			dependencies: ["setup"],
		},
	],

	globalSetup: "./global-setup.ts",
	globalTeardown: "./global-teardown.ts",

	webServer: {
		command: "docker compose -f docker-compose.e2e.yml up --force-recreate --build",
		url: `${APP_URL}/api/v1/health`,
		timeout: 5 * 60 * 1000, // 5 minutes
		reuseExistingServer: false,
		stdout: "pipe",
		stderr: "pipe",
	},
});
