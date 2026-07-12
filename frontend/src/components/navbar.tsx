import { Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import { signOut, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ModeToggle } from "./mode-toggle";
import { TooltipProvider } from "./ui/tooltip";

type CollabStatus = "connecting" | "connected" | "disconnected";

type NavbarProps = {
	breadcrumb?: {
		projectName: string | null;
		fileName: string | null;
		status?: CollabStatus;
	};
	actions?: React.ReactNode;
};

const STATUS_DOT: Record<CollabStatus, string> = {
	connected: "bg-emerald-500",
	connecting: "animate-pulse bg-amber-500",
	disconnected: "bg-red-500",
};

export default function Navbar({ breadcrumb, actions }: NavbarProps) {
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
		<header className="grid h-11 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center border-b border-border bg-background px-2 sm:grid-cols-[1fr_auto_1fr]">
			<div className="flex items-center gap-1 justify-self-start">
				{breadcrumb ? (
					<Link
						to="/"
						aria-label="Back to presentations"
						className="flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
					>
						<ChevronLeft className="h-4 w-4" />
						<img src="/logo.svg" alt="" className="h-5 w-5" />
						<span className="hidden sm:inline">Marp Collab</span>
					</Link>
				) : (
					<Link
						to="/"
						className="flex h-8 items-center gap-2 rounded-md px-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
						aria-label="Marp Collab"
					>
						<img src="/logo.svg" alt="" className="h-5 w-5" />
						<span className="hidden sm:inline">Marp Collab</span>
					</Link>
				)}
			</div>

			{breadcrumb ? (
				<nav
					aria-label="Breadcrumb"
					className="flex min-w-0 items-center justify-center gap-1.5 text-sm text-muted-foreground"
				>
					<Link to="/" className="max-w-48 truncate hover:text-foreground">
						{breadcrumb.projectName ?? "Untitled"}
					</Link>
					{breadcrumb.fileName ? (
						<>
							<ChevronRight className="h-3.5 w-3.5 shrink-0" />
							<span className="max-w-56 truncate font-medium text-foreground">
								{breadcrumb.fileName}
							</span>
						</>
					) : null}
					{breadcrumb.status ? (
						<span
							aria-label={`Connection: ${breadcrumb.status}`}
							title={`Connection: ${breadcrumb.status}`}
							className={cn("ml-1 size-2 shrink-0 rounded-full", STATUS_DOT[breadcrumb.status])}
						/>
					) : null}
				</nav>
			) : (
				<div />
			)}

			<div className="flex items-center gap-1 justify-self-end">
				{actions}
				<TooltipProvider>
					<ModeToggle />
				</TooltipProvider>

				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={onLogout}
					disabled={busy}
					title="Logout"
					aria-label="Logout"
				>
					<LogOut className="h-4 w-4" />
				</Button>
			</div>
		</header>
	);
}
