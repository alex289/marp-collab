import { setTimeout } from "node:timers/promises";
import { OAuth2Server } from "oauth2-mock-server";

const TEST_USER_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

export default async function globalSetup() {
	const server = new OAuth2Server();
	await server.issuer.keys.generate("ES512");

	server.service.on("beforeTokenSigning", (token) => {
		token.payload.email = "test@example.com";
		token.payload.name = "Test User";
		token.payload.picture = TEST_USER_IMAGE;
	});
	server.service.on("beforeUserinfo", (res) => {
		res.body = {
			sub: "user-1",
			email: "test@example.com",
			name: "Test User",
			picture: TEST_USER_IMAGE,
		};
	});

	server.issuer.url = "http://host.docker.internal:8091";
	await server.start(8091, "0.0.0.0");

	await setTimeout(5000); // Without waiting the tests sometimes fail

	(globalThis as any).__OIDC__ = server; // stash to stop in teardown
}
