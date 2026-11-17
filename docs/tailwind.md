# Tailwind CSS

Enable [Tailwind CSS](https://tailwindcss.com/) utilities for a deck with the `tailwind` directive:

```markdown
---
marp: true
tailwind: true
---

<!-- _class: bg-none bg-slate-900 text-white -->

<div class="grid grid-cols-2 gap-8">
<div class="rounded-xl bg-sky-100 p-6">Left</div>
<div class="rounded-xl bg-rose-100 p-6">Right</div>
</div>
```

Utilities are generated for the classes used in the deck and apply in the preview, presentation mode and PDF export. They are marked `!important` so they win over theme styles, and Tailwind's Preflight reset is left out so themes keep their typography. Some themes paint a gradient as `background-image`; add `bg-none` before a background color to replace it. `invert` stays the Marp theme class for dark slides; use `invert-100` for Tailwind's color filter. Responsive variants such as `md:` follow the window width rather than the slide size. Relative paths in arbitrary values like `bg-[url(images/bg.png)]` resolve like theme CSS.

The editor completes Tailwind classes and variants in `class` attributes and `class` directives of decks that enable the directive, with a preview of the generated CSS. Negative utilities such as `-mt-4` appear after typing a leading `-`.
