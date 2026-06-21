import { Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { signOut, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "./mode-toggle";
import { TooltipProvider } from "./ui/tooltip";

export default function Navbar() {
	const { data, refetch } = useSession();
	const user = data?.user ?? null;
	const router = useRouter();

	const [busy, setBusy] = useState(false);

	const onLogout = async () => {
		setBusy(true);
		try {
			await signOut();
			await refetch();
			await router.invalidate();
		} finally {
			setBusy(false);
		}
	};

	if (!user) {
		return null;
	}
	return (
		<header className="flex h-8 items-center justify-between border-b border-border/70 px-1">
			<Link
				to="/"
				className="flex h-7 items-center gap-2 rounded-md px-2 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
				aria-label="Marp Collab"
			>
				<img src="/logo.svg" alt="" className="h-4 w-4" />
				<span className="hidden sm:inline">Marp Collab</span>
			</Link>

			<div className="flex items-center gap-1">
				<TooltipProvider>
					<ModeToggle />
				</TooltipProvider>

				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-8"
					onClick={onLogout}
					disabled={busy}
					title="Logout"
					aria-label="Logout"
				>
					<LogOut className="h-3.5 w-3.5" />
				</Button>
			</div>
		</header>
	);
}
