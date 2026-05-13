import { useState } from "react";
import { LogOut } from "lucide-react";
import { signOut, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/types";

type SessionPayload = {
	user?: SessionUser;
};

export const AuthPanel = () => {
	const { data, refetch } = useSession();
	const session = data as SessionPayload | null;
	const user = session?.user ?? null;

	const [busy, setBusy] = useState(false);

	const onLogout = async () => {
		setBusy(true);
		try {
			await signOut();
			await refetch();
		} finally {
			setBusy(false);
		}
	};

	if (!user) {
		return null;
	}

	return (
		<div className="flex items-center gap-3">
			<Button size="sm" variant="outline" onClick={onLogout} disabled={busy}>
				<LogOut className="mr-1 h-3.5 w-3.5" />
				Logout
			</Button>
		</div>
	);
};
