import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";

const CONNECT_MESSAGE = "init-port";
const KEYBOARD_MESSAGE = "presentation-key";

/** Shared transport for slide documents running in opaque-origin sandboxes. */
export function useSlideFrameBridge(onMessage: (event: MessageEvent) => void) {
	const port = useRef<MessagePort | null>(null);
	const handler = useRef(onMessage);
	const [load, setLoad] = useState(0);

	useEffect(() => {
		handler.current = onMessage;
	}, [onMessage]);

	useEffect(
		() => () => {
			port.current?.close();
			port.current = null;
		},
		[],
	);

	const connect = useCallback((event: SyntheticEvent<HTMLIFrameElement>) => {
		const frame = event.currentTarget.contentWindow;
		if (!frame) {
			return;
		}

		port.current?.close();
		const { port1, port2 } = new MessageChannel();
		port.current = port1;
		port1.onmessage = (message) => {
			if (port.current === port1) {
				handler.current(message);
			}
		};
		// An opaque sandbox has no addressable origin. Send the port only to this iframe.
		frame.postMessage({ type: CONNECT_MESSAGE }, "*", [port2]);
		setLoad((previous) => previous + 1);
		return port1;
	}, []);

	return { port, load, connect };
}

export const SLIDE_FRAME_BRIDGE_SCRIPT = `
  function listenForSlideFramePort(handleMessage, onConnect) {
    window.addEventListener('message', function (event) {
      if (event.source !== window.parent ||
          !event.data || event.data.type !== '${CONNECT_MESSAGE}' || !event.ports[0]) return;
      if (port) port.close();
      port = event.ports[0];
      port.onmessage = handleMessage;
      if (onConnect) onConnect();
    });
  }

  function slideFrameKeyMessage(event, includeRepeat) {
    return {
      type: '${KEYBOARD_MESSAGE}',
      eventType: event.type,
      key: event.key,
      code: event.code,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      repeat: includeRepeat && event.repeat,
    };
  }
`;

export function dispatchSlideFrameKey(data: unknown): boolean {
	if (!data || typeof data !== "object") {
		return false;
	}
	const payload = data as Partial<KeyboardEvent> & { eventType?: unknown };
	if (payload.type !== KEYBOARD_MESSAGE) {
		return false;
	}

	if (
		(payload.eventType === "keydown" || payload.eventType === "keyup") &&
		typeof payload.key === "string" &&
		typeof payload.code === "string"
	) {
		document.dispatchEvent(
			new KeyboardEvent(payload.eventType, {
				key: payload.key,
				code: payload.code,
				ctrlKey: payload.ctrlKey === true,
				shiftKey: payload.shiftKey === true,
				altKey: payload.altKey === true,
				metaKey: payload.metaKey === true,
				repeat: payload.repeat === true,
				bubbles: true,
				cancelable: true,
			}),
		);
	}
	return true;
}
