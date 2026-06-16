import { useMemo } from "react";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { renderMarp } from "@/lib/marp";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useTheme } from "./theme-provider";

type PreviewPaneProps = {
	markdown: string;
	label: string | null;
	projectId: string;
	selectedFileId: string | null;
};

export const PreviewPane = ({ markdown, label, projectId, selectedFileId }: PreviewPaneProps) => {
	const { theme } = useTheme();
	const rendered = useMemo(() => {
		try {
			return renderMarp(markdown);
		} catch (error) {
			return {
				html: `<section><h1>Marp Render Fehler</h1><p>${error instanceof Error ? error.message : "Unbekannter Fehler"}</p></section>`,
				css: "",
			};
		}
	}, [markdown]);

	const srcDoc = useMemo(() => {
		return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      html,
      body {
        margin: 0;
        min-height: 100%;
        box-sizing: border-box;
        background: ${theme === "dark" ? "oklch(0.205 0 0)" : "oklch(1 0 0)"};
      }
      ${rendered.css}
      div.marpit {
        display: flex;
        flex-direction: column;
        gap: 24px;
        align-items: center;
      }
      div.marpit > svg[data-marpit-svg],
      body > section {
        flex: 0 0 auto;
		border: 1px solid ${theme === "dark" ? "oklch(1 0 0 / 10%)" : "oklch(0.922 0 0)"};
      }
    </style>
  </head>
  <body>
    ${rendered.html}
  </body>
</html>`;
	}, [rendered.css, rendered.html, theme]);

	return (
		<Card className="flex h-full min-h-0 flex-col overflow-hidden border-border/80">
			<CardHeader className="border-b border-border gap-2">
				<CardTitle>Live Preview</CardTitle>
				<CardAction>
					{label ? (
						<Button asChild variant="outline" size="sm">
							<Link
								to="/presentations/$id"
								params={{ id: projectId }}
								search={{
									mode: "present",
									file: selectedFileId ?? undefined,
								}}
							>
								Start presentation
							</Link>
						</Button>
					) : (
						<Button variant="outline" size="sm" disabled>
							Start presentation
						</Button>
					)}
				</CardAction>
				<CardDescription>{label ? `Active file: ${label}` : "No file selected"}</CardDescription>
			</CardHeader>

			<CardContent className="min-h-0 flex-1">
				<iframe
					title="Marp preview"
					srcDoc={srcDoc}
					className="h-full w-full"
					sandbox="allow-scripts"
				/>
			</CardContent>
		</Card>
	);
};
