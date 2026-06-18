import { CreatePresentationDialog } from "@/components/dialog/create-presentation";
import { LoadingScreen } from "@/components/loading-screen";
import Navbar from "@/components/navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { API_URL } from "@/lib/config";
import { fetcher } from "@/lib/fetcher";
import type { Project, SharedProject } from "@/lib/types";
import { Link, createFileRoute } from "@tanstack/react-router";
import useSWR from "swr";

export const Route = createFileRoute("/")({
	component: RootComponent,
});

function RootComponent() {
	const { data, isLoading } = useSWR<{ projects: Project[]; sharedProjects: SharedProject[] }>(
		`${API_URL}/projects`,
		fetcher,
	);

	if (isLoading) {
		return <LoadingScreen />;
	}

	const projects = data?.projects ?? [];
	const sharedProjects = data?.sharedProjects ?? [];

	return (
		<div className="flex flex-col mx-auto w-full p-6 gap-6">
			<Navbar />
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
						<Link
							key={project.id}
							to="/presentations/$id"
							params={{ id: project.id }}
							className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
						>
							<Card className="hover:ring-foreground/25 transition-shadow cursor-pointer h-full">
								<CardHeader>
									<CardTitle className="text-sm font-medium truncate">{project.name}</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-muted-foreground text-xs">
										{new Date(project.createdAt).toLocaleDateString()}
									</p>
								</CardContent>
							</Card>
						</Link>
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
											{new Date(project.createdAt).toLocaleDateString()}
										</p>
										<p className="text-muted-foreground text-xs">Shared by {project.userName}</p>
									</CardContent>
								</Card>
							</Link>
						))}
					</div>
				</>
			)}
		</div>
	);
}
