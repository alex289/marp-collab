import { Hono } from "hono";
import type { HonoVariables } from "../../types.ts";
import { getPublicProviderInfo } from "../../auth/config.ts";

const app = new Hono<{ Variables: HonoVariables }>();

app.get("/", (c) => {
	return c.json({
		providers: getPublicProviderInfo(),
	});
});

export default app;
