import { cn } from "@/lib/utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
	return (
		<kbd
			data-slot="kbd"
			className={cn(
				"pointer-events-none inline-flex h-4 w-fit min-w-4 items-center justify-center gap-1 rounded-[3px] border border-border/70 bg-muted px-1 font-sans text-[0.625rem] leading-none font-medium text-muted-foreground select-none shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--border)_70%,transparent)] in-data-[slot=tooltip-content]:border-background/20 in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background dark:in-data-[slot=tooltip-content]:bg-background/10 [&_svg:not([class*='size-'])]:size-3",
				className,
			)}
			{...props}
		/>
	);
}

function KbdGroup({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="kbd-group"
			className={cn("inline-flex items-center gap-0.5 whitespace-nowrap", className)}
			{...props}
		/>
	);
}

export { Kbd, KbdGroup };
