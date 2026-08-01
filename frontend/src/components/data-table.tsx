import {
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	useReactTable,
	type ColumnDef,
	type OnChangeFn,
	type RowData,
	type SortingState,
	type TableOptions,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";
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
	onSortingChange?: OnChangeFn<SortingState>;
	sorting?: SortingState;
};

export function DataTable<TData extends RowData, TValue>({
	columns,
	data,
	emptyMessage = "No results.",
	getRowId,
	label,
	onSortingChange,
	sorting,
}: DataTableProps<TData, TValue>) {
	const table = useReactTable({
		columns,
		data,
		enableMultiSort: false,
		enableSortingRemoval: false,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getRowId,
		...(sorting && onSortingChange
			? {
					onSortingChange,
					state: { sorting },
				}
			: {}),
	});

	return (
		<div className="overflow-hidden rounded-md border">
			<Table aria-label={label}>
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id}>
							{headerGroup.headers.map((header) => {
								const canSort = header.column.getCanSort();
								const sortDirection = header.column.getIsSorted();

								return (
									<TableHead
										key={header.id}
										className={canSort ? "p-0" : undefined}
										aria-sort={
											canSort
												? sortDirection === "asc"
													? "ascending"
													: sortDirection === "desc"
														? "descending"
														: "none"
												: undefined
										}
									>
										{header.isPlaceholder ? null : canSort ? (
											<button
												type="button"
												className="flex h-10 w-full items-center gap-1.5 px-2 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
												onClick={header.column.getToggleSortingHandler()}
											>
												{flexRender(header.column.columnDef.header, header.getContext())}
												{sortDirection === "asc" ? (
													<ArrowUpIcon className="size-3.5" aria-hidden="true" />
												) : sortDirection === "desc" ? (
													<ArrowDownIcon className="size-3.5" aria-hidden="true" />
												) : (
													<ArrowUpDownIcon
														className="size-3.5 text-muted-foreground"
														aria-hidden="true"
													/>
												)}
											</button>
										) : (
											flexRender(header.column.columnDef.header, header.getContext())
										)}
									</TableHead>
								);
							})}
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
