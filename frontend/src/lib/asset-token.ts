import useSWR from "swr";
import { API_URL } from "./config";
import { fetcher } from "./fetcher";

type AssetTokenResponse = {
	token: string;
	expiresIn: number;
};

/**
 * Short-lived, read-only, project-scoped token used to load images/theme
 * assets from the sandboxed presentation/preview iframes, which (by design)
 * can't send the session cookie. Refreshed shortly before it expires.
 */
export function useAssetToken(projectId: string | undefined): string | undefined {
	const { data } = useSWR<AssetTokenResponse>(
		projectId ? `${API_URL}/projects/${projectId}/asset-token` : null,
		fetcher,
		{
			refreshInterval: (latestData) =>
				latestData ? Math.max(latestData.expiresIn * 1000 - 60_000, 30_000) : 0,
		},
	);

	return data?.token;
}
