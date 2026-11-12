import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import useSWR from "swr";
import { authClient } from "@/lib/auth-client";
import { fetcher } from "@/lib/fetcher";
import { API_URL } from "@/lib/config";
import { LoadingScreen } from "@/components/loading-screen";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
	CardFooter,
} from "@/components/ui/card";
import { Alert, AlertTitle } from "@/components/ui/alert";

export const Route = createFileRoute("/consent")({ component: ConsentRoute });

type ConsentDetails = { name: string; redirectHost: string; scopes: string[]; oauthQuery: string };
const permissions: Record<string, string> = {
	"presentations:read": "Read presentations and list files in projects you can access.",
	"presentations:write": "Create and edit presentations in projects where you have write access.",
	offline_access: "Keep access until the connection expires or its authorization is revoked.",
};

function ConsentRoute() {
	const { data, error, isLoading } = useSWR<ConsentDetails>(
		`${API_URL}/mcp/consent${window.location.search}`,
		fetcher,
	);
	const [pending, setPending] = useState(false);
	const [submitError, setSubmitError] = useState<string>();
	async function decide(accept: boolean) {
		if (!data) {
			return;
		}
		setPending(true);
		setSubmitError(undefined);
		try {
			const response = await authClient.oauth2.consent({ accept, oauth_query: data.oauthQuery });
			if (response.error) {
				throw new Error(response.error.message ?? "Authorization failed.");
			}
			// Keep both buttons disabled while the client redirects back to the AI app.
		} catch (error) {
			setSubmitError(error instanceof Error ? error.message : "Authorization failed.");
			setPending(false);
		}
	}
	if (isLoading) {
		return <LoadingScreen />;
	}
	return (
		<main className="flex min-h-screen items-center justify-center p-6">
			<Card className="w-full max-w-lg">
				<CardHeader>
					<CardTitle>Connect to Marp Collab</CardTitle>
					<CardDescription>
						{data
							? `${data.name} is requesting access to your presentations.`
							: "This connection could not be authorized."}
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{error || submitError ? (
						<Alert variant="destructive">
							<AlertTitle>
								{submitError ?? "Invalid or expired request. Reconnect from your AI client."}
							</AlertTitle>
						</Alert>
					) : null}
					{data ? (
						<>
							<p className="text-sm text-muted-foreground">
								Return address: <strong className="break-all">{data.redirectHost}</strong>. Client
								names are supplied by the requesting app.
							</p>
							<ul className="list-disc pl-5 text-sm flex flex-col gap-3">
								{data.scopes.map((scope) => (
									<li key={scope}>{permissions[scope] ?? scope}</li>
								))}
							</ul>
							<p className="text-sm text-muted-foreground">
								Access covers all your owned and shared projects, subject to your current project
								permissions.
							</p>
						</>
					) : null}
				</CardContent>
				<CardFooter className="justify-end gap-3">
					<Button variant="outline" disabled={!data || pending} onClick={() => decide(false)}>
						Deny
					</Button>
					<Button disabled={!data || pending} onClick={() => decide(true)}>
						{pending ? "Connecting…" : "Allow access"}
					</Button>
				</CardFooter>
			</Card>
		</main>
	);
}
