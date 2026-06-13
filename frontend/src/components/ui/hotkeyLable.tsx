export const HotkeyLabel = ({ hotkey, withMod }: { hotkey: string; withMod?: boolean }) => {
	const platform = window.navigator.platform.toLowerCase();
	const isMac =
		platform.includes("mac") || platform.includes("iphone") || platform.includes("ipad");
	return (
		<kbd>
			{withMod !== false && (
				<kbd className="rounded border border-sidebar-border px-1 font-mono text-[10px] text-sidebar-foreground/70">
					{isMac ? "Cmd" : "Ctrl"}
				</kbd>
			)}
			{withMod !== false && <span className="mx-0.5 text-sidebar-foreground/70">+</span>}
			<kbd className="rounded border border-sidebar-border px-1 font-mono text-[10px] text-sidebar-foreground/70">
				{hotkey}
			</kbd>
		</kbd>
	);
};
