import { lookup } from "node:dns/promises";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { HttpClient, GitHttpRequest, GitHttpResponse } from "isomorphic-git";

function requestHttps(request: GitHttpRequest): Promise<GitHttpResponse> {
	return new Promise((resolve, reject) => {
		const outgoing = httpsRequest(
			request.url,
			{
				method: request.method,
				headers: request.headers,
				agent: false,
				lookup: request.fetchOptions.lookup,
				signal: request.signal,
			},
			(response) => {
				if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
					response.destroy();
				}
				resolve({
					url: request.url,
					method: request.method,
					statusCode: response.statusCode ?? 500,
					statusMessage: response.statusMessage ?? "",
					headers: Object.fromEntries(
						Object.entries(response.headers)
							.filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)
							.map(([name, value]) => [name, Array.isArray(value) ? value.join(", ") : value]),
					),
					body: response[Symbol.asyncIterator](),
				});
			},
		);
		outgoing.on("error", reject);
		if (request.body) {
			void (async function sendBody() {
				try {
					await pipeline(Readable.from(request.body!), outgoing);
				} catch (error) {
					reject(error);
				}
			})();
		} else {
			outgoing.end();
		}
	});
}

const blocked = new BlockList();
for (const [address, prefix] of [
	["0.0.0.0", 8],
	["10.0.0.0", 8],
	["100.64.0.0", 10],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["172.16.0.0", 12],
	["192.0.0.0", 24],
	["192.0.2.0", 24],
	["192.168.0.0", 16],
	["198.18.0.0", 15],
	["198.51.100.0", 24],
	["203.0.113.0", 24],
	["224.0.0.0", 4],
	["240.0.0.0", 4],
] as const) {
	blocked.addSubnet(address, prefix);
}
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [
	["2001::", 23],
	["2001:db8::", 32],
	["2002::", 16],
	["3fff::", 20],
] as const) {
	blocked.addSubnet(address, prefix, "ipv6");
}

export class ProjectGitNetworkError extends Error {}

function isPublicAddress(address: string): boolean {
	const family = isIP(address);
	return family === 4
		? !blocked.check(address, "ipv4")
		: family === 6 && globalV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}

type ResolveAddresses = (hostname: string) => Promise<{ address: string; family: number }[]>;

/** Resolve once, validate every result and pin the socket to that result. Never follow redirects. */
export function createGitHttpClient(
	resolveAddresses: ResolveAddresses = (hostname) => lookup(hostname, { all: true }),
	transport: HttpClient = { request: requestHttps },
): HttpClient {
	return {
		async request(request) {
			const url = new URL(request.url);
			if (url.protocol !== "https:" || url.username || url.password) {
				throw new ProjectGitNetworkError("Git remotes must use HTTPS without URL credentials");
			}
			const signal = request.signal
				? AbortSignal.any([request.signal, AbortSignal.timeout(30_000)])
				: AbortSignal.timeout(30_000);
			signal.throwIfAborted();
			const hostname = url.hostname.replace(/^\[|\]$/g, "");
			const family = isIP(hostname);
			const addresses = family
				? [{ address: hostname, family }]
				: await new Promise<{ address: string; family: number }[]>((resolve, reject) => {
						const abort = () => reject(signal.reason);
						signal.addEventListener("abort", abort, { once: true });
						void (async function resolveHost() {
							try {
								resolve(await resolveAddresses(hostname));
							} catch (error) {
								reject(error);
							} finally {
								signal.removeEventListener("abort", abort);
							}
						})();
					});
			signal.throwIfAborted();
			if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
				throw new ProjectGitNetworkError("Git remotes must resolve to public network addresses");
			}
			const address = addresses[0]!;
			const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
				if (options.all) {
					callback(null, [address]);
				} else {
					callback(null, address.address, address.family);
				}
			};
			const response = await transport.request({
				...request,
				agent: false,
				signal,
				fetchOptions: { lookup: pinnedLookup, followRedirects: false, timeout: 30_000 },
			});
			if (response.statusCode >= 300 && response.statusCode < 400) {
				await response.body?.return?.();
				throw new ProjectGitNetworkError(
					"Git remote redirects are not supported. Use the repository's final HTTPS URL.",
				);
			}
			const body = response.body;
			if (body) {
				const limit = url.pathname.endsWith("/info/refs") ? 1024 * 1024 : 100 * 1024 * 1024;
				response.body = (async function* limitedBody() {
					let bytes = 0;
					for await (const chunk of body) {
						bytes += chunk.byteLength;
						if (bytes > limit) {
							throw new ProjectGitNetworkError("Git remote response exceeds the transfer limit");
						}
						yield chunk;
					}
				})();
			}
			return response;
		},
	};
}

export const projectGitHttp = createGitHttpClient();
