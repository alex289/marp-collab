import useSWR from "swr";

interface HealthState {
	ok: boolean;
}

async function healthFetcher(url: string): Promise<HealthState> {
	const res = await fetch(url);

	if (!res.ok && res.status !== 503) {
		throw new Error(`Request failed: ${res.status} ${res.statusText}`);
	}

	return res.json() as Promise<HealthState>;
}

export function useHealthCheck() {
	const { data, error } = useSWR<HealthState>("/api/v1/health", healthFetcher, {
		refreshInterval: 30_000,
		dedupingInterval: 10_000,
		shouldRetryOnError: true,
		errorRetryInterval: 10_000,
		errorRetryCount: Infinity,
	});

	const isBackendUnreachable = error !== undefined;
	const isBackendUnhealthy = data?.ok === false;

	return { health: data, isBackendUnreachable, isBackendUnhealthy };
}
