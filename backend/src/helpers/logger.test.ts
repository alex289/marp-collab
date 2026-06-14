import { describe, test, before, after } from "node:test";
import { ok, equal } from "node:assert";

describe("logger", () => {
	before(() => {
		process.env.LOG_LEVEL = "warn";
	});

	after(() => {
		delete process.env.LOG_LEVEL;
	});

	test("respects LOG_LEVEL env var", async () => {
		const { logger } = await import("./logger.ts");
		equal(logger.level, "warn");
	});

	test("exposes all pino log-level methods", async () => {
		const { logger } = await import("./logger.ts");
		ok(typeof logger.trace === "function");
		ok(typeof logger.debug === "function");
		ok(typeof logger.info === "function");
		ok(typeof logger.warn === "function");
		ok(typeof logger.error === "function");
		ok(typeof logger.fatal === "function");
		ok(typeof logger.child === "function");
	});

	test("child() returns a child logger that inherits parent level", async () => {
		const { logger } = await import("./logger.ts");
		const child = logger.child({ component: "test" });
		ok(typeof child.info === "function");
		ok(typeof child.error === "function");
		equal(child.level, logger.level);
	});
});
