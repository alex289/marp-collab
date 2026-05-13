export async function fetcher<T>(url: string): Promise<T> {
	const res = await fetch(url);

	if (!res.ok) {
		throw new Error(`Request failed: ${res.status} ${res.statusText}`);
	}

	return res.json() as Promise<T>;
}
