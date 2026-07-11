import useSWR from "swr";
import { API_URL } from "./config";
import { fetcher } from "./fetcher";

type ProjectResponse = {
	project: { id: string; name: string };
	isOwner: boolean;
};

export function useProject(id: string) {
	const { data, mutate } = useSWR<ProjectResponse>(`${API_URL}/projects/${id}`, fetcher);

	return { project: data?.project, isProjectOwner: data?.isOwner || false, mutate };
}

export function updateProject(id: string, project: { name: string }) {
	return fetch(`${API_URL}/projects/${id}`, {
		method: "PATCH",

		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name: project.name }),
	});
}
