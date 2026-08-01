import { CreatePresentationDialog } from "@/components/dialog/create-presentation";
import { LoadingScreen } from "@/components/loading-screen";
import Navbar from "@/components/navbar";
import { ProjectDataTable } from "@/components/project-data-table";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { API_URL } from "@/lib/config";
import { fetcher } from "@/lib/fetcher";
import { filterAndSortProjects, type ProjectSortOption } from "@/lib/project-list";
import type { Project, SharedProject } from "@/lib/types";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import { LayoutGridIcon, TablePropertiesIcon } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { DeleteProjectDialog } from "@/components/dialog/delete-project";
import { RenameProjectDialog } from "@/components/dialog/rename-project";

export const Route = createFileRoute("/")({
	component: RootComponent,
});

type ProjectView = "grid" | "table";

const tableSortingByOption: Record<ProjectSortOption, SortingState> = {
	alphabetical: [{ id: "name", desc: false }],
	created: [{ id: "createdAt", desc: true }],
	updated: [{ id: "updatedAt", desc: true }],
};

const sortOptionByColumn: Record<string, ProjectSortOption> = {
	name: "alphabetical",
	createdAt: "created",
	updatedAt: "updated",
};

const sortSelectItems = [
	{ value: "created", label: "Last created" },
	{ value: "updated", label: "Last updated" },
	{ value: "alphabetical", label: "Alphabetical" },
];

function RootComponent() {
	const [query, setQuery] = useState("");
	const [sortOption, setSortOption] = useState<ProjectSortOption>("created");
	const [tableSorting, setTableSorting] = useState<SortingState>(tableSortingByOption.created);
	const [view, setView] = useState<ProjectView>("grid");
	const { data, isLoading } = useSWR<{
		projects: Project[];
		sharedProjects: SharedProject[];
	}>(`${API_URL}/projects`, fetcher);

	const projects = data?.projects ?? [];
	const sharedProjects = data?.sharedProjects ?? [];
	const visibleProjects = filterAndSortProjects(projects, query, sortOption, (project) => ({
		name: project.name,
		createdAt: project.createdAt,
		updatedAt: project.updatedAt,
	}));
	const visibleSharedProjects = filterAndSortProjects(
		sharedProjects,
		query,
		sortOption,
		(project) => ({
			name: project.projectName,
			createdAt: project.projectCreatedAt,
			updatedAt: project.updatedAt,
		}),
	);
	const hasPresentations = projects.length > 0 || sharedProjects.length > 0;
	const hasQuery = query.trim().length > 0;
	const handleSortOptionChange = (value: ProjectSortOption) => {
		setSortOption(value);
		setTableSorting(tableSortingByOption[value]);
	};
	const handleTableSortingChange: OnChangeFn<SortingState> = (updater) => {
		const nextSorting = typeof updater === "function" ? updater(tableSorting) : updater;
		const nextSortOption = sortOptionByColumn[nextSorting[0]?.id];

		setTableSorting(nextSorting);
		if (nextSortOption) {
			setSortOption(nextSortOption);
		}
	};

	if (isLoading) {
		return <LoadingScreen />;
	}

	return (
		<div className="flex min-h-svh flex-col bg-background text-foreground">
			<Navbar />
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
				<div className="flex items-center justify-between">
					<h1 className="text-2xl font-bold">Presentations</h1>
					<CreatePresentationDialog />
				</div>
				{hasPresentations ? (
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
						<Input
							type="search"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search presentations..."
							aria-label="Search presentations"
							className="sm:max-w-sm"
						/>
						<div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
							<Select
								items={sortSelectItems}
								value={sortOption}
								onValueChange={(value) => {
									if (value === "created" || value === "updated" || value === "alphabetical") {
										handleSortOptionChange(value);
									}
								}}
							>
								<SelectTrigger className="flex-1 sm:w-44" aria-label="Sort presentations">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{sortSelectItems.map((item) => (
											<SelectItem key={item.value} value={item.value}>
												{item.label}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
							<ToggleGroup
								value={[view]}
								onValueChange={(value) => {
									const nextView = value[0];
									if (nextView === "grid" || nextView === "table") {
										setView(nextView);
									}
								}}
								variant="outline"
								spacing={0}
								aria-label="Presentation view"
							>
								<ToggleGroupItem value="grid" aria-label="Grid view">
									<LayoutGridIcon />
								</ToggleGroupItem>
								<ToggleGroupItem value="table" aria-label="Table view">
									<TablePropertiesIcon />
								</ToggleGroupItem>
							</ToggleGroup>
						</div>
					</div>
				) : null}
				{projects.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No presentations yet. Create one to get started.
					</p>
				) : visibleProjects.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						{hasQuery ? "No presentations match your search." : "No presentations found."}
					</p>
				) : view === "table" ? (
					<ProjectDataTable
						type="owned"
						projects={visibleProjects}
						onSortingChange={handleTableSortingChange}
						sorting={tableSorting}
					/>
				) : (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{visibleProjects.map((project) => (
							<ProjectCard key={project.id} project={project} sortOption={sortOption} />
						))}
					</div>
				)}

				{sharedProjects.length === 0 ? null : (
					<>
						<div className="flex items-center justify-between">
							<h1 className="text-2xl font-bold">Shared Presentations</h1>
						</div>
						{visibleSharedProjects.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								{hasQuery
									? "No shared presentations match your search."
									: "No shared presentations found."}
							</p>
						) : view === "table" ? (
							<ProjectDataTable
								type="shared"
								projects={visibleSharedProjects}
								onSortingChange={handleTableSortingChange}
								sorting={tableSorting}
							/>
						) : (
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
								{visibleSharedProjects.map((project) => (
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
												<ProjectTimestamp
													createdAt={project.projectCreatedAt}
													updatedAt={project.updatedAt}
													sortOption={sortOption}
												/>
												<p className="text-muted-foreground text-xs">
													Shared by {project.ownerName}
												</p>
											</CardContent>
										</Card>
									</Link>
								))}
							</div>
						)}
					</>
				)}
			</div>
			<footer className="mt-auto px-6 py-4 text-end text-xs text-muted-foreground">
				<a
					className="hover:underline"
					href={
						"https://github.com/alex289/marp-collab/releases/tag/marp-collab%40" +
						__MARP_COLLAB_VERSION__
					}
					target="_blank"
					rel="noopener noreferrer"
				>
					Marp Collab v{__MARP_COLLAB_VERSION__}
				</a>
			</footer>
		</div>
	);
}

function ProjectCard({ project, sortOption }: { project: Project; sortOption: ProjectSortOption }) {
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
				<ProjectTimestamp
					createdAt={project.createdAt}
					updatedAt={project.updatedAt}
					sortOption={sortOption}
				/>
			</CardContent>
		</Card>
	);
}

function ProjectTimestamp({
	createdAt,
	updatedAt,
	sortOption,
}: {
	createdAt: Date;
	updatedAt: Date;
	sortOption: ProjectSortOption;
}) {
	const showUpdatedAt = sortOption === "updated";
	const date = showUpdatedAt ? updatedAt : createdAt;

	return (
		<p className="text-muted-foreground text-xs">
			{showUpdatedAt ? "Updated" : "Created"} at {new Date(date).toLocaleDateString()}
		</p>
	);
}
