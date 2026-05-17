import { LoadingScreen } from "@/components/loading-screen";
import { Button } from "@/components/ui/button";
import { useAuthSync } from "@/hooks/use-auth-sync";
import { useHealthCheck } from "@/hooks/use-health-check";
import useIsUserOffline from "@/hooks/use-is-user-offline";
import { authClient } from "@/lib/auth-client";
import { Outlet, createRootRoute, redirect } from "@tanstack/react-router";
import { HomeIcon, ServerCrashIcon, WifiOffIcon } from "lucide-react";

export const Route = createRootRoute({
	beforeLoad: async ({ location }) => {
		const { data: session } = await authClient.getSession();

		if (!session && location.pathname !== "/login") {
			throw redirect({ to: "/login" });
		}

		if (session && location.pathname === "/login") {
			throw redirect({ to: "/" });
		}

		return { session };
	},
	component: RootComponent,
	pendingComponent: () => <LoadingScreen />,
	notFoundComponent: () => (
		<div className="text-center mt-50">
			<div className="text-3xl md:text-4xl font-semibold">404 Not Found</div>
			<div className="mt-4">The page you are looking for does not exist.</div>
			<Button className="mt-6 px-4" size="lg" onClick={() => (window.location.href = "/")}>
				<HomeIcon />
				Go Home
			</Button>
		</div>
	),
	errorComponent: ({ error }) => (
		<div className="text-center mt-50">
			<div className="text-3xl md:text-4xl font-semibold">An Error Occurred</div>
			<div className="mt-4 mx-auto max-w-100">{error.message}</div>
			<Button className="mt-6 px-4" size="lg" onClick={() => (window.location.href = "/")}>
				<HomeIcon />
				Go Home
			</Button>
		</div>
	),
});

function RootComponent() {
	const isUserOffline = useIsUserOffline();
	const { isBackendUnreachable, isBackendUnhealthy } = useHealthCheck();

	// Sync auth across tabs
	useAuthSync();

	if (isUserOffline) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-center">
					<WifiOffIcon className="mx-auto mb-4" size={64} />
					<div className="text-lg text-balance max-w-100 mx-auto mt-4">
						You appear to be offline. Please check your internet connection and try again.
					</div>
				</div>
			</div>
		);
	}

	if (isBackendUnreachable || isBackendUnhealthy) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-center">
					<ServerCrashIcon className="mx-auto mb-4" size={64} />
					<div className="text-xl font-semibold">Server Issue</div>
					<div className="text-lg text-balance max-w-100 mx-auto mt-4 text-muted-foreground">
						{isBackendUnreachable
							? "The server is currently unreachable. Please check your connection and try again."
							: "The server is currently experiencing issues. Please try again later."}
					</div>
				</div>
			</div>
		);
	}

	return <Outlet />;
}
