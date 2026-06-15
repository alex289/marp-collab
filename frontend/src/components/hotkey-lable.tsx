import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

export const HotkeyLabel = ({
	hotkey,
	withMod,
	className,
}: {
	hotkey: string;
	withMod?: boolean;
	className?: string;
}) => {
	const platform = window.navigator.platform.toLowerCase();
	const isMac =
		platform.includes("mac") || platform.includes("iphone") || platform.includes("ipad");
	const modifierLabel = isMac ? "⌘" : "Ctrl";

	return (
		<KbdGroup className={cn("hidden align-middle md:inline-flex", className)}>
			{withMod !== false && <Kbd>{modifierLabel}</Kbd>}
			{withMod !== false && <span>+</span>}
			<Kbd>{hotkey}</Kbd>
		</KbdGroup>
	);
};
