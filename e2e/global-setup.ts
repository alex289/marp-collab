import { OAuth2Server } from "oauth2-mock-server";

export default async function globalSetup() {
	const server = new OAuth2Server();
	await server.issuer.keys.generate("ES512");

	server.service.on("beforeTokenSigning", (token) => {
		token.payload.email = "test@example.com";
		token.payload.name = "Test User";
	});
	server.service.on("beforeUserinfo", (res) => {
		res.body = { sub: "user-1", email: "test@example.com", name: "Test User" };
	});

	server.issuer.url = "http://host.docker.internal:8091";
	await server.start(8091, "0.0.0.0");

	(globalThis as any).__OIDC__ = server; // stash to stop in teardown
}
