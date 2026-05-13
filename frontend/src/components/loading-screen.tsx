import { Loader2Icon } from "lucide-react";

export function LoadingScreen() {
	return (
		<div className="flex items-center justify-center min-h-screen">
			<div className="text-center">
				<Loader2Icon className="animate-spin mx-auto mb-4" size={48} />
				<div className="text-lg">Loading...</div>
			</div>
		</div>
	);
}
