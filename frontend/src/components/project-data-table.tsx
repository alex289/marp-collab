import { DeleteProjectDialog } from "@/components/dialog/delete-project";
import { RenameProjectDialog } from "@/components/dialog/rename-project";
import { DataTable } from "@/components/data-table";
import type { Project, SharedProject } from "@/lib/types";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";

type ProjectTableRow = {
	id: string;
	name: string;
	createdAt: Date;
	updatedAt: Date;
	ownerName?: string;
	project?: Project;
};

type ProjectDataTableProps =
	| { type: "owned"; projects: Project[] }
	| { type: "shared"; projects: SharedProject[] };

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function formatDate(date: Date) {
	return dateFormatter.format(new Date(date));
}

const nameColumn: ColumnDef<ProjectTableRow> = {
	accessorKey: "name",
	header: "Name",
	cell: ({ row }) => (
		<Link
			to="/presentations/$id"
			params={{ id: row.original.id }}
			className="font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
		>
			{row.original.name}
		</Link>
	),
};

const createdAtColumn: ColumnDef<ProjectTableRow> = {
	accessorKey: "createdAt",
	header: "Created",
	cell: ({ row }) => formatDate(row.original.createdAt),
};

const updatedAtColumn: ColumnDef<ProjectTableRow> = {
	accessorKey: "updatedAt",
	header: "Updated",
	cell: ({ row }) => formatDate(row.original.updatedAt),
};

const ownedColumns: ColumnDef<ProjectTableRow>[] = [
	nameColumn,
	createdAtColumn,
	updatedAtColumn,
	{
		id: "actions",
		header: () => <span className="sr-only">Actions</span>,
		cell: ({ row }) => {
			const project = row.original.project;
			if (!project) {
				return null;
			}

			return (
				<div className="flex justify-end">
					<RenameProjectDialog project={project} />
					<DeleteProjectDialog project={project} />
				</div>
			);
		},
	},
];

const sharedColumns: ColumnDef<ProjectTableRow>[] = [
	nameColumn,
	{
		accessorKey: "ownerName",
		header: "Owner",
	},
	createdAtColumn,
	updatedAtColumn,
];

export function ProjectDataTable(props: ProjectDataTableProps) {
	if (props.type === "owned") {
		const rows = props.projects.map((project) => ({
			id: project.id,
			name: project.name,
			createdAt: project.createdAt,
			updatedAt: project.updatedAt,
			project,
		}));

		return (
			<DataTable
				columns={ownedColumns}
				data={rows}
				getRowId={(row) => row.id}
				label="Presentations"
			/>
		);
	}

	const rows = props.projects.map((project) => ({
		id: project.projectId,
		name: project.projectName,
		createdAt: project.projectCreatedAt,
		updatedAt: project.updatedAt,
		ownerName: project.ownerName,
	}));

	return (
		<DataTable
			columns={sharedColumns}
			data={rows}
			getRowId={(row) => row.id}
			label="Shared presentations"
		/>
	);
}
