import { CreatePresentationDialog } from "@/components/dialog/create-presentation";
import { LoadingScreen } from "@/components/loading-screen";
import Navbar from "@/components/navbar";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { API_URL } from "@/lib/config";
import { fetcher } from "@/lib/fetcher";
import type { Project, SharedProject } from "@/lib/types";
import { Link, createFileRoute } from "@tanstack/react-router";
import useSWR from "swr";
import { DeleteProjectDialog } from "@/components/dialog/delete-project";
import { RenameProjectDialog } from "@/components/dialog/rename-project";

export const Route = createFileRoute("/")({
	component: RootComponent,
});

function RootComponent() {
	const { data, isLoading } = useSWR<{
		projects: Project[];
		sharedProjects: SharedProject[];
	}>(`${API_URL}/projects`, fetcher);

	if (isLoading) {
		return <LoadingScreen />;
	}

	const projects = data?.projects ?? [];
	const sharedProjects = data?.sharedProjects ?? [];

	return (
		<div className="flex min-h-svh flex-col bg-background text-foreground">
			<Navbar />
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
				<div className="flex items-center justify-between">
					<h1 className="text-2xl font-bold">Presentations</h1>
					<CreatePresentationDialog />
				</div>
				{projects.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No presentations yet. Create one to get started.
					</p>
				) : (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{projects.map((project) => (
							<ProjectCard key={project.id} project={project} />
						))}
					</div>
				)}

				{sharedProjects.length === 0 ? null : (
					<>
						<div className="flex items-center justify-between">
							<h1 className="text-2xl font-bold">Shared Presentations</h1>
						</div>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{sharedProjects.map((project) => (
								<Link
									key={project.projectId}
									to="/presentations/$id"
									params={{ id: project.projectId }}
									className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
								>
									<Card className="hover:ring-foreground/25 transition-shadow cursor-pointer h-full">
										<CardHeader>
											<CardTitle className="text-sm font-medium truncate">
												{project.projectName}
											</CardTitle>
										</CardHeader>
										<CardContent>
											<p className="text-muted-foreground text-xs">
												Created at {new Date(project.createdAt).toLocaleDateString()}
											</p>
											<p className="text-muted-foreground text-xs">Shared by {project.ownerName}</p>
										</CardContent>
									</Card>
								</Link>
							))}
						</div>
					</>
				)}
			</div>
		</div>
	);
}

function ProjectCard({ project }: { project: Project }) {
	return (
		<Card className="relative h-full transition-shadow hover:ring-foreground/25">
			<Link
				key={project.id}
				to="/presentations/$id"
				params={{ id: project.id }}
				aria-label={`Open ${project.name}`}
				className="absolute inset-0 z-10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
			<CardHeader>
				<CardTitle className="truncate pr-16 text-sm font-medium">{project.name}</CardTitle>
				<CardAction className="relative z-20">
					<RenameProjectDialog project={project} />
					<DeleteProjectDialog project={project} />
				</CardAction>
			</CardHeader>
			<CardContent>
				<p className="text-muted-foreground text-xs">
					Created at {new Date(project.createdAt).toLocaleDateString()}
				</p>
			</CardContent>
		</Card>
	);
}
