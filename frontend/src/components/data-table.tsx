import {
	flexRender,
	getCoreRowModel,
	useReactTable,
	type ColumnDef,
	type RowData,
	type TableOptions,
} from "@tanstack/react-table";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

type DataTableProps<TData extends RowData, TValue> = {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	emptyMessage?: string;
	getRowId?: TableOptions<TData>["getRowId"];
	label: string;
};

export function DataTable<TData extends RowData, TValue>({
	columns,
	data,
	emptyMessage = "No results.",
	getRowId,
	label,
}: DataTableProps<TData, TValue>) {
	const table = useReactTable({
		columns,
		data,
		getCoreRowModel: getCoreRowModel(),
		getRowId,
	});

	return (
		<div className="overflow-hidden rounded-md border">
			<Table aria-label={label}>
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id}>
							{headerGroup.headers.map((header) => (
								<TableHead key={header.id}>
									{header.isPlaceholder
										? null
										: flexRender(header.column.columnDef.header, header.getContext())}
								</TableHead>
							))}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{table.getRowModel().rows.length > 0 ? (
						table.getRowModel().rows.map((row) => (
							<TableRow key={row.id}>
								{row.getVisibleCells().map((cell) => (
									<TableCell key={cell.id}>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						))
					) : (
						<TableRow>
							<TableCell colSpan={columns.length} className="h-24 text-center">
								{emptyMessage}
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}
