---
"marp-collab": patch
---

Harden the PDF export: a Content-Security-Policy keeps the PDF renderer from fetching remote URLs referenced by deck or theme CSS (for example through `image-set()` or inline `<style>`), and CSS URL rewriting no longer slows down quadratically on malformed input.
