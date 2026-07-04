import { cn } from "@/lib/utils";
import { UploadIcon } from "lucide-react";
import { useRef, useState } from "react";

type Props = {
	accept?: string;
	multiple?: boolean;
	onChange: (files: File[]) => void;
	className?: string;
};

export function FileDropZone({ accept, multiple, onChange, className }: Props) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [isDragging, setIsDragging] = useState(false);

	function handleDragOver(e: React.DragEvent) {
		e.preventDefault();
		setIsDragging(true);
	}

	function handleDragLeave(e: React.DragEvent) {
		if (!e.currentTarget.contains(e.relatedTarget as Node)) {
			setIsDragging(false);
		}
	}

	function handleDrop(e: React.DragEvent) {
		e.preventDefault();
		setIsDragging(false);
		const files = Array.from(e.dataTransfer.files);
		if (files.length > 0) {
			onChange(multiple ? files : files.slice(0, 1));
		}
	}

	function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
		const files = Array.from(e.target.files ?? []);
		if (files.length > 0) {
			onChange(files);
		}
	}

	return (
		<div
			role="button"
			tabIndex={0}
			onClick={() => inputRef.current?.click()}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					inputRef.current?.click();
				}
			}}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			className={cn(
				"flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors",
				isDragging
					? "border-ring bg-ring/5 text-foreground"
					: "border-input text-muted-foreground hover:border-ring/60 hover:text-foreground",
				className,
			)}
		>
			<UploadIcon className="size-7 opacity-60" />
			<div className="text-sm">
				<span className="font-medium">Click to upload</span> or drag and drop
			</div>
			<input
				ref={inputRef}
				type="file"
				accept={accept}
				multiple={multiple}
				className="hidden"
				onChange={handleChange}
			/>
		</div>
	);
}
