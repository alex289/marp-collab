import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangleIcon } from "lucide-react";

export default function ErrorAlert({
	title,
	description,
}: {
	title: string;
	description?: string | undefined;
}) {
	return (
		<Alert className="mt-2 border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-50">
			<AlertTriangleIcon />
			<AlertTitle>{title}</AlertTitle>
			{description && (
				<AlertDescription className="text-foreground text-wrap">{description}</AlertDescription>
			)}
		</Alert>
	);
}
