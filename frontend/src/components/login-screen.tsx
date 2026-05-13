import { LogIn } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { API_URL } from "@/lib/config";
import { fetcher } from "@/lib/fetcher";
import useSWR from "swr";
import { LoadingScreen } from "./loading-screen";
import ErrorAlert from "./alerts/error-alert";

type Provider = { name: string; id: string };

export function LoginScreen() {
	const { data, error, isLoading } = useSWR<{ providers: Provider[] }>(
		`${API_URL}/auth-providers`,
		fetcher,
	);

	const handleSignIn = async (providerId: string) => {
		await authClient.signIn.oauth2({
			providerId: providerId,
		});
	};

	if (isLoading || !data || !Array.isArray(data.providers)) {
		return <LoadingScreen />;
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-halo">
			<Card className="w-full max-w-sm p-8 shadow-panel">
				<div className="mb-3 text-center">
					<img src="/logo.svg" alt="Logo" className="mx-auto mb-5 w-26" />
					<h1 className="text-2xl font-bold tracking-tight">Marp Collab</h1>
					<p className="mt-1 text-sm text-muted-foreground">Sign in to continue</p>
				</div>

				<div className="flex flex-col gap-3">
					{data.providers.length === 0 ? (
						<ErrorAlert title="No authentication providers configured. Please contact the administrator." />
					) : error ? (
						<ErrorAlert
							title="Error loading authentication providers."
							description={error?.message}
						/>
					) : (
						data.providers.map((provider) => (
							<Button
								key={provider.id}
								className="w-full"
								size="lg"
								onClick={() => handleSignIn(provider.id)}
							>
								<LogIn className="mr-2 h-4 w-4" />
								Sign in with {provider.name}
							</Button>
						))
					)}
				</div>
			</Card>
		</div>
	);
}
