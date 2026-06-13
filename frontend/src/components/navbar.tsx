import { Card, CardDescription, CardTitle } from "@/components/ui/card";
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
		<Card>
			<div className="flex items-center justify-between px-5">
				<Link to="/" className="flex items-center gap-4">
					<img src="/logo.svg" alt="Logo" className="h-6 lg:h-10" />
					<div>
						<CardTitle>Marp Collab</CardTitle>
						<CardDescription className="hidden lg:block">
							Collaborative Markdown editor for Marp decks
						</CardDescription>
					</div>
				</Link>

				<div className="flex items-center gap-4">
					<TooltipProvider>
						<ModeToggle />
					</TooltipProvider>

					<Button variant="outline" onClick={onLogout} disabled={busy}>
						<LogOut className="mr-1 h-3.5 w-3.5" />
						Logout
					</Button>
				</div>
			</div>
		</Card>
	);
}
