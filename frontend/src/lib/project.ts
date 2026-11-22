import useSWR from "swr";
import { API_URL } from "./config";
import { fetcher } from "./fetcher";
import type { Project } from "./types";

export type ProjectResponse = {
	project: Project;
	isOwner: boolean;
	readOnly: boolean;
};

function projectUrl(id: string): string {
	return `${API_URL}/projects/${id}`;
}

export function getProject(id: string) {
	return fetcher<ProjectResponse>(projectUrl(id));
}

export function useProject(id: string) {
	const { data, mutate } = useSWR<ProjectResponse>(projectUrl(id), fetcher);

	return {
		project: data?.project,
		isProjectOwner: data?.isOwner ?? false,
		readOnly: data?.readOnly ?? true,
		mutate,
	};
}

export function updateProject(id: string, project: { name: string }) {
	return fetch(projectUrl(id), {
		method: "PATCH",

		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name: project.name }),
	});
}
