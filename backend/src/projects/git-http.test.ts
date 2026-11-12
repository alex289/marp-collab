import { test } from "node:test";
import { deepEqual, equal, ok, rejects } from "node:assert/strict";
import type { GitHttpRequest, HttpClient } from "isomorphic-git";
import { createGitHttpClient } from "./git-http.ts";

const publicDns = () => Promise.resolve([{ address: "8.8.8.8", family: 4 }]);
const emptyResponse = { url: "https://git.example/repo", statusCode: 200, statusMessage: "OK" };

test("Git HTTP rejects private literals, unsafe schemes and private/mixed DNS answers before connecting", async () => {
	let calls = 0;
	const transport: HttpClient = {
		request: () => {
			calls++;
			return Promise.resolve(emptyResponse);
		},
	};
	const client = createGitHttpClient(publicDns, transport);
	for (const url of [
		"http://git.example/repo",
		"https://user:pass@git.example/repo",
		"https://127.0.0.1/repo",
		"https://2130706433/repo",
		"https://10.0.0.1/repo",
		"https://169.254.169.254/repo",
		"https://[::1]/repo",
		"https://[::ffff:127.0.0.1]/repo",
		"https://[fd00::1]/repo",
		"https://[2002:7f00:1::]/repo",
	]) {
		await rejects(client.request({ url }));
	}
	const mixed = createGitHttpClient(
		() =>
			Promise.resolve([
				{ address: "8.8.8.8", family: 4 },
				{ address: "127.0.0.1", family: 4 },
			]),
		transport,
	);
	await rejects(mixed.request({ url: "https://git.example/repo" }));
	equal(calls, 0);
});

test("Git HTTP pins validated DNS results and overrides caller transport options", async () => {
	let resolved = 0;
	const transport: HttpClient = {
		request: (request: GitHttpRequest) => {
			equal(request.agent, false);
			equal(request.fetchOptions.followRedirects, false);
			ok(request.signal);
			const lookup = request.fetchOptions.lookup;
			lookup("git.example", { all: true }, (error: unknown, addresses: unknown) => {
				equal(error, null);
				deepEqual(addresses, [{ address: "8.8.8.8", family: 4 }]);
			});
			lookup("git.example", {}, (error: unknown, address: string, family: number) => {
				equal(error, null);
				equal(address, "8.8.8.8");
				equal(family, 4);
			});
			return Promise.resolve(emptyResponse);
		},
	};
	const client = createGitHttpClient(() => {
		resolved++;
		return publicDns();
	}, transport);
	await client.request({
		url: "https://git.example/repo",
		agent: {},
		fetchOptions: { followRedirects: true },
	});
	equal(resolved, 1);
});

test("Git HTTP rejects redirects and closes the response without requesting its target", async () => {
	let calls = 0;
	let closed = false;
	const body = (async function* responseBody() {
		yield new Uint8Array([1]);
	})();
	const originalReturn = body.return.bind(body);
	body.return = (...args) => {
		closed = true;
		return originalReturn(...args);
	};
	const client = createGitHttpClient(publicDns, {
		request: () => {
			calls++;
			return Promise.resolve({
				...emptyResponse,
				statusCode: 302,
				headers: { location: "http://127.0.0.1/private" },
				body,
			});
		},
	});
	await rejects(client.request({ url: "https://git.example/repo" }), /redirects/);
	equal(calls, 1);
	equal(closed, true);
});

test("Git HTTP aborts oversized advertisements and closes the upstream iterator", async () => {
	let closed = false;
	const body = (async function* responseBody() {
		try {
			yield new Uint8Array(1024 * 1024 + 1);
			yield new Uint8Array(1);
		} finally {
			closed = true;
		}
	})();
	const client = createGitHttpClient(publicDns, {
		request: () => Promise.resolve({ ...emptyResponse, body }),
	});
	const response = await client.request({ url: "https://git.example/repo/info/refs" });
	await rejects(async () => {
		for await (const _chunk of response.body!) {
			/* drain response */
		}
	}, /transfer limit/);
	equal(closed, true);
});

test("Git HTTP rejects remotes with a query or fragment before connecting", async () => {
	let calls = 0;
	const client = createGitHttpClient(publicDns, {
		request: () => {
			calls++;
			return Promise.resolve(emptyResponse);
		},
	});
	for (const url of [
		"https://git.example/repo.git?x=1/git-upload-pack",
		"https://git.example/repo.git?x=1/info/refs?service=git-upload-pack",
		"https://git.example/repo.git?/info/refs",
		"https://git.example/repo.git#x/git-upload-pack",
	]) {
		await rejects(client.request({ url }), /query or fragment/);
	}
	equal(calls, 0);

	await client.request({ url: "https://git.example/repo.git/info/refs?service=git-upload-pack" });
	equal(calls, 1);
});

test("Git HTTP checks every POST response for packs, whatever the URL path", async () => {
	// A single blob header declaring 400 MB, which exceeds the per-object limit.
	const pack = Buffer.concat([
		Buffer.from("PACK"),
		Buffer.from([0, 0, 0, 2, 0, 0, 0, 1]),
		Buffer.from([0xb0, 0x80, 0x80, 0xc0, 0x0c]),
	]);
	const client = createGitHttpClient(publicDns, {
		request: () =>
			Promise.resolve({
				...emptyResponse,
				body: (async function* responseBody() {
					yield pack;
				})(),
			}),
	});
	const response = await client.request({
		url: "https://git.example/repo/anything",
		method: "POST",
	});
	await rejects(async () => {
		for await (const _chunk of response.body!) {
			/* drain response */
		}
	}, /size limit/);
});

test("Git HTTP cancels DNS resolution when the operation is aborted", async () => {
	const controller = new AbortController();
	let connected = false;
	const client = createGitHttpClient(
		() =>
			new Promise(() => {
				/* DNS lookup deliberately remains pending until cancellation. */
			}),
		{
			request: () => {
				connected = true;
				return Promise.resolve(emptyResponse);
			},
		},
	);
	const pending = client.request({ url: "https://git.example/repo", signal: controller.signal });
	controller.abort(new Error("cancelled"));
	await rejects(pending, /cancelled/);
	equal(connected, false);
});
