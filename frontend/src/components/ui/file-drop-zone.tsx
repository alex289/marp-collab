import { cn } from "@/lib/utils";
import { UploadIcon } from "lucide-react";
import { useRef, useState } from "react";

type Props = {
	accept?: string;
	onChange: (file: File) => void;
	className?: string;
};

export function FileDropZone({ accept, onChange, className }: Props) {
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
		const file = e.dataTransfer.files[0];
		if (file) {
			onChange(file);
		}
	}

	function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (file) {
			onChange(file);
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
				className="hidden"
				onChange={handleChange}
			/>
		</div>
	);
}
