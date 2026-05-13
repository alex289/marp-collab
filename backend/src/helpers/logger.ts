import pino from "pino";
import { isDev } from "./isDev.ts";

const transport = isDev() && process.stdout.isTTY ? { transport: { target: "pino-pretty" } } : {};

export const logger = pino({
	level: process.env.LOG_LEVEL || "info",
	timestamp: pino.stdTimeFunctions.isoTime,
	...transport,
});
