import { createHmac, timingSafeEqual } from "node:crypto";

export const ASSET_TOKEN_TTL_SECONDS = 5 * 60;

let cachedSecret: string | null = null;

function getSecret(): string {
	if (cachedSecret) {
		return cachedSecret;
	}

	const rawSecret = process.env.AUTH_SECRET;
	if (!rawSecret) {
		throw new Error("AUTH_SECRET is not set");
	}

	const derivedSecret = createHmac("sha256", rawSecret)
		.update("marp-collab-asset-token")
		.digest("base64url");

	cachedSecret = derivedSecret;
	return derivedSecret;
}

function sign(payload: string): string {
	return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

/**
 * Signs a short-lived, read-only, project-scoped token for loading project
 * assets (images, fonts, theme CSS) from contexts that can't send the
 * session cookie, e.g. the sandboxed presentation/preview iframes.
 */
export function signAssetToken(projectId: string, ttlSeconds = ASSET_TOKEN_TTL_SECONDS): string {
	const payload = JSON.stringify({ projectId, expires: Date.now() + ttlSeconds * 1000 });
	const encodedPayload = Buffer.from(payload).toString("base64url");
	return `${encodedPayload}.${sign(payload)}`;
}

export function verifyAssetToken(token: string, projectId: string): boolean {
	try {
		const dotIndex = token.lastIndexOf(".");
		if (dotIndex === -1) {
			return false;
		}
		const encodedPayload = token.slice(0, dotIndex);
		const signature = token.slice(dotIndex + 1);

		const payload = Buffer.from(encodedPayload, "base64url").toString();

		const expectedSignature = Buffer.from(sign(payload));
		const actualSignature = Buffer.from(signature);
		if (
			expectedSignature.length !== actualSignature.length ||
			!timingSafeEqual(expectedSignature, actualSignature)
		) {
			return false;
		}

		const parsed = JSON.parse(payload) as { projectId?: unknown; expires?: unknown };
		return (
			parsed.projectId === projectId &&
			typeof parsed.expires === "number" &&
			parsed.expires > Date.now()
		);
	} catch {
		return false;
	}
}
