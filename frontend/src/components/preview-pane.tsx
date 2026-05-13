import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { renderMarp } from "@/lib/marp";

type PreviewPaneProps = {
	markdown: string;
	label: string | null;
};

export const PreviewPane = ({ markdown, label }: PreviewPaneProps) => {
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
      body {
        margin: 0;
        background: #101a1f;
      }
      ${rendered.css}
    </style>
  </head>
  <body>
    ${rendered.html}
  </body>
</html>`;
	}, [rendered.css, rendered.html]);

	return (
		<Card className="flex h-full min-h-0 flex-col overflow-hidden border-border/80">
			<CardHeader className="border-b border-border">
				<CardTitle>Live Preview</CardTitle>
				<CardDescription>{label ? `Active file: ${label}` : "No file selected"}</CardDescription>
			</CardHeader>

			<CardContent className="min-h-0 flex-1">
				<iframe title="Marp preview" srcDoc={srcDoc} className="h-full w-full border-0" />
			</CardContent>
		</Card>
	);
};
