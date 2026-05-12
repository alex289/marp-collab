import { useMemo, useState } from "react";
import { LogOut, Sparkles } from "lucide-react";
import { signIn, signOut, signUp, useSession } from "@/lib/auth-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { SessionUser } from "@/lib/types";

type AuthMode = "signin" | "signup";

type SessionPayload = {
	user?: SessionUser;
};

export const AuthPanel = () => {
	const { data, isPending, refetch } = useSession();
	const session = data as SessionPayload | null;
	const user = session?.user ?? null;

	const [mode, setMode] = useState<AuthMode>("signin");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const panelTitle = useMemo(() => (mode === "signin" ? "Login" : "Account erstellen"), [mode]);

	const onSubmit = async () => {
		setBusy(true);
		setError(null);

		try {
			if (mode === "signin") {
				const result = await signIn.email({
					email,
					password,
					rememberMe: true,
				});

				if (result.error) {
					setError(result.error.message ?? "Login fehlgeschlagen");
				}
			} else {
				const result = await signUp.email({
					name,
					email,
					password,
				});

				if (result.error) {
					setError(result.error.message ?? "Registrierung fehlgeschlagen");
				}
			}

			await refetch();
		} catch (authError) {
			setError(authError instanceof Error ? authError.message : "Unbekannter Fehler");
		} finally {
			setBusy(false);
		}
	};

	const onLogout = async () => {
		setBusy(true);
		setError(null);

		try {
			await signOut();
			await refetch();
		} catch (logoutError) {
			setError(logoutError instanceof Error ? logoutError.message : "Logout fehlgeschlagen");
		} finally {
			setBusy(false);
		}
	};

	if (user) {
		return (
			<div className="flex items-center gap-3">
				<Badge variant="outline" className="gap-1.5">
					<Sparkles className="h-3.5 w-3.5" />
					{user.name}
				</Badge>
				<Button size="sm" variant="outline" onClick={onLogout} disabled={busy}>
					<LogOut className="mr-1 h-3.5 w-3.5" />
					Logout
				</Button>
			</div>
		);
	}

	return (
		<Card className="w-full max-w-[430px] p-4">
			<div className="mb-2 flex items-center justify-between">
				<p className="text-sm font-semibold">{panelTitle}</p>
				<div className="flex gap-1">
					<Button
						size="sm"
						variant={mode === "signin" ? "default" : "ghost"}
						onClick={() => setMode("signin")}
					>
						Login
					</Button>
					<Button
						size="sm"
						variant={mode === "signup" ? "default" : "ghost"}
						onClick={() => setMode("signup")}
					>
						Sign up
					</Button>
				</div>
			</div>

			<div className="grid gap-2">
				{mode === "signup" ? (
					<Input
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="Name"
						autoComplete="name"
					/>
				) : null}
				<Input
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					placeholder="E-Mail"
					type="email"
					autoComplete="email"
				/>
				<Input
					value={password}
					onChange={(event) => setPassword(event.target.value)}
					placeholder="Passwort"
					type="password"
					autoComplete={mode === "signin" ? "current-password" : "new-password"}
				/>
				<Button
					onClick={onSubmit}
					disabled={busy || isPending || !email || !password || (mode === "signup" && !name)}
				>
					{busy ? "Bitte warten..." : mode === "signin" ? "Einloggen" : "Account erstellen"}
				</Button>
			</div>

			{error ? <p className="mt-2 text-xs text-rose-500">{error}</p> : null}
		</Card>
	);
};
