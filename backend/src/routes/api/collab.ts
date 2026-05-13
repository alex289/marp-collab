import { upgradeWebSocket } from "@hono/node-server";
import { collabServer } from "../../collab/hocuspocus.ts";
import { Hono } from "hono";
import type { HonoVariables } from "../../types.ts";

const app = new Hono<{ Variables: HonoVariables }>();

app.get(
	"",
	upgradeWebSocket((c) => {
		let clientConnection: ReturnType<typeof collabServer.handleConnection> | undefined;
		return {
			onOpen(_evt, ws) {
				if (!ws.raw) {
					throw new Error("WebSocket upgrade failed, raw WebSocket not available");
				}
				ws.raw.binaryType = "arraybuffer";
				clientConnection = collabServer.handleConnection(ws.raw, c.req.raw, {});
			},
			onMessage(evt) {
				let uint8ArrayData: Uint8Array;
				if (typeof evt.data === "string") {
					uint8ArrayData = new TextEncoder().encode(evt.data);
				} else if (evt.data instanceof ArrayBuffer) {
					uint8ArrayData = new Uint8Array(evt.data);
				} else if (evt.data instanceof Uint8Array) {
					uint8ArrayData = evt.data;
				} else {
					throw new Error(`Unsupported WebSocket message data type: ${typeof evt.data}`);
				}
				clientConnection?.handleMessage(uint8ArrayData);
			},
			onClose() {
				clientConnection?.handleClose();
			},
		};
	}),
);

export default app;
