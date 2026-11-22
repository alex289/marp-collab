import { OAuth2Server } from "oauth2-mock-server";

const testUserProfile = {
	email: "test@example.com",
	name: "Test User",
	picture: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
};

export default async function globalSetup() {
	const server = new OAuth2Server();
	await server.issuer.keys.generate("ES512");

	server.service.on("beforeTokenSigning", (token) => {
		Object.assign(token.payload, testUserProfile);
	});
	server.service.on("beforeUserinfo", (res) => {
		res.body = { sub: "user-1", ...testUserProfile };
	});

	server.issuer.url = "http://host.docker.internal:8091";
	await server.start(8091, "0.0.0.0");

	return () => server.stop();
}
