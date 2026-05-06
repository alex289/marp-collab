import { useMemo } from "react";
import { Card } from "@/components/ui/card";
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
      <header className="border-b border-border px-4 py-2.5">
        <p className="text-sm font-semibold">Live Preview</p>
        <p className="truncate text-xs text-muted-foreground">
          {label ? `Aktive Datei: ${label}` : "Keine Datei ausgewählt"}
        </p>
      </header>

      <div className="min-h-0 flex-1 bg-[#101a1f]">
        <iframe title="Marp preview" srcDoc={srcDoc} className="h-full w-full border-0" />
      </div>
    </Card>
  );
};
