import { useCallback, useEffect, useState } from "react";
import { API_URL } from "@/lib/config";
import type { DeckFile } from "@/types";

type FilesResponse = {
	files: DeckFile[];
};

export const useFiles = () => {
	const [files, setFiles] = useState<DeckFile[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const loadFiles = useCallback(async () => {
		setIsLoading(true);
		setError(null);

		try {
			const response = await fetch(`${API_URL}/api/files`, {
				credentials: "include",
			});

			if (!response.ok) {
				throw new Error(`Could not load files (${response.status})`);
			}

			const payload = (await response.json()) as FilesResponse;
			setFiles(payload.files);
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : "Unknown error");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadFiles();
	}, [loadFiles]);

	return {
		files,
		isLoading,
		error,
		reload: loadFiles,
	};
};
