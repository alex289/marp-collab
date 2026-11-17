# Markdown includes

Reuse slides from another `.md` or `.markdown` file in the same project with a standalone comment:

```markdown
<!-- @include: chapters/intro.md -->
```

Paths are relative to the file containing the comment, including for nested includes. Leading YAML frontmatter in included files is stripped. Preview, slide overview, presentation navigation and PDF export use the expanded content; the editor keeps the original comments. Clicking an included slide jumps to its include comment in the main file.

Included content refreshes every three seconds and PDF export reads active edits. Missing files, cycles and invalid paths produce inline errors. Expansion allows up to 10 nested levels, 100 includes and 1,000,000 total source characters. Comments in fenced or indented code examples are left unchanged.

Image paths in included content currently resolve relative to the main deck. Slide reordering is disabled for decks with includes; edit the source files to reorder those slides.
