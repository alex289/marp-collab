import { test } from "node:test";
import { equal, notEqual, throws } from "node:assert/strict";
import { encryptSecret, decryptSecret } from "./encryption.ts";

test("authenticated encryption uses random nonces and binds ciphertext to its purpose and resource", () => {
	process.env.AUTH_SECRET = "encryption-test-secret";
	try {
		const encrypted = encryptSecret("a secret 🔐", "credentials", "project-a");
		equal(decryptSecret(encrypted, "credentials", "project-a"), "a secret 🔐");
		notEqual(encrypted, encryptSecret("a secret 🔐", "credentials", "project-a"));
		throws(() => decryptSecret(encrypted, "other", "project-a"));
		throws(() => decryptSecret(encrypted, "credentials", "project-b"));
		const tampered = JSON.parse(encrypted);
		tampered.data = Buffer.from("tampered").toString("base64url");
		throws(() => decryptSecret(JSON.stringify(tampered), "credentials", "project-a"));
		const truncated = JSON.parse(encrypted);
		truncated.tag = Buffer.from(truncated.tag, "base64url").subarray(0, 4).toString("base64url");
		throws(() => decryptSecret(JSON.stringify(truncated), "credentials", "project-a"), /Invalid/);
		process.env.AUTH_SECRET = "changed-secret";
		throws(() => decryptSecret(encrypted, "credentials", "project-a"));
		delete process.env.AUTH_SECRET;
		throws(() => encryptSecret("secret", "credentials", "project-a"), /AUTH_SECRET/);
	} finally {
		delete process.env.AUTH_SECRET;
	}
});
