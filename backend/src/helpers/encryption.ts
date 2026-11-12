import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

function key(purpose: string): Buffer {
	const secret = process.env.AUTH_SECRET;
	if (!secret) {
		throw new Error("AUTH_SECRET is not set");
	}
	return createHmac("sha256", secret).update(purpose).digest();
}

/** Authenticated encryption bound to a purpose and resource identity. */
export function encryptSecret(plaintext: string, purpose: string, identity: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key(purpose), iv);
	cipher.setAAD(Buffer.from(identity));
	const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	return JSON.stringify({
		iv: iv.toString("base64url"),
		tag: cipher.getAuthTag().toString("base64url"),
		data: data.toString("base64url"),
	});
}

export function decryptSecret(encrypted: string, purpose: string, identity: string): string {
	const { iv, tag, data } = JSON.parse(encrypted) as { iv: string; tag: string; data: string };
	const ivBytes = Buffer.from(iv, "base64url");
	const tagBytes = Buffer.from(tag, "base64url");
	// Without a fixed tag length, GCM accepts truncated tags that are far easier to forge.
	if (ivBytes.length !== 12 || tagBytes.length !== 16) {
		throw new Error("Invalid encrypted secret");
	}
	const decipher = createDecipheriv("aes-256-gcm", key(purpose), ivBytes, { authTagLength: 16 });
	decipher.setAAD(Buffer.from(identity));
	decipher.setAuthTag(tagBytes);
	return Buffer.concat([
		decipher.update(Buffer.from(data, "base64url")),
		decipher.final(),
	]).toString("utf8");
}
