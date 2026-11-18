# Slide overview

Open **Slides** in the workspace sidebar. Click a thumbnail or press Enter on its number to jump to the slide in the editor. Drag a thumbnail to reorder it. Right-click a thumbnail or press Shift+F10 on its number to open its actions. The panel header has **Add slide**, which adds a slide after the active one, and **Select slides**.

Choose **Select slides** to select several thumbnails. Shift-click selects a range, and clicking a section name selects its slides. While you select, the panel header shows the count with buttons to move the selection up or down or delete it. Drag a selected thumbnail to move the selection together, or right-click a selected thumbnail for the same actions. Undo in the editor reverses the whole action.

Use **Start section here** in a thumbnail's actions to name a group that runs from that slide to the next section. Click a section name to jump to its first slide. In the actions of a slide in a section, you can rename the section, move it past an adjacent named section, or remove its label while keeping its slides. Section names are stored at the top of their first slide as `<!-- section: Name -->` comments. Like `presenter:` and `demo:`, MarpCollab keeps them out of the presenter notes. Other Marp tools show them as speaker notes.

Read-only viewers can still use thumbnail navigation. Decks with Markdown includes or implicit heading-based slide breaks use source editing for slide changes.

Put deck-wide directives in the YAML front matter to keep them independent of slide edits. The overview stops edits that would change a deck-wide setting.
