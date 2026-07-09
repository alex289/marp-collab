import { API_URL } from "@/lib/config";

type UploadProjectFilesOptions = {
	projectId: string;
	files: File[];
	destination?: string;
};

type UploadProjectFilesResult = {
	uploadedAny: boolean;
	failures: string[];
};

export async function uploadProjectFiles({
	projectId,
	files,
	destination,
}: UploadProjectFilesOptions): Promise<UploadProjectFilesResult> {
	let uploadedAny = false;
	const failures: string[] = [];

	for (const file of files) {
		try {
			const formData = new FormData();
			formData.append("file", file);
			if (destination) {
				formData.append("destination", destination);
			}

			const res = await fetch(`${API_URL}/projects/${projectId}/files/upload`, {
				method: "POST",
				body: formData,
			});

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				failures.push(`${file.name}: ${data.error ?? "Failed to upload file"}`);
				continue;
			}

			uploadedAny = true;
		} catch {
			failures.push(`${file.name}: An unexpected error occurred`);
		}
	}

	return { uploadedAny, failures };
}
