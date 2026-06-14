import { describe, test } from "node:test";
import { equal } from "node:assert";
import { isDev } from "./isDev.ts";

describe("isDev", () => {
	test("isDev should return true when NODE_ENV is development", () => {
		process.env.NODE_ENV = "development";
		equal(isDev(), true);
		delete process.env.NODE_ENV;
	});

	test("isDev should return false when NODE_ENV is not development", () => {
		process.env.NODE_ENV = "production";
		equal(isDev(), false);
		delete process.env.NODE_ENV;
	});

	test("isDev should return false when NODE_ENV is undefined", () => {
		delete process.env.NODE_ENV;
		equal(isDev(), false);
	});
});
