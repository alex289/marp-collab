import { cn } from "@/lib/utils";

type SeparatorProps = {
	className?: string;
};

export const Separator = ({ className }: SeparatorProps) => (
	<div className={cn("h-px w-full bg-border", className)} aria-hidden="true" />
);
