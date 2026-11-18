# marp-collab

## 0.5.0

### Minor Changes

- [#105](https://github.com/alex289/marp-collab/pull/105) [`6b6054d`](https://github.com/alex289/marp-collab/commit/6b6054dae471526c8330ca5d9ed49a79792adaab) Thanks [@alex289](https://github.com/alex289)! - Make hidden features easier to find. A new "Connect AI" dialog, linked from the presentation list and the editor settings, explains how to connect Claude Code, Codex or other MCP clients. Press `?` or use the help button in the navbar or presenter view to see all keyboard shortcuts and deck syntax tips. In HTML comments the editor now suggests `@include`, `presenter` and `demo`, completes Markdown files after `@include:`, and no longer buries Marp directives under a list of HTML tags.

- [#102](https://github.com/alex289/marp-collab/pull/102) [`1f74239`](https://github.com/alex289/marp-collab/commit/1f7423964bc79f16a7ac66ab9122af01ad0cb304) Thanks [@alex289](https://github.com/alex289)! - Add, duplicate, and delete slides from thumbnails, select slides to reorder or delete them together, and organize decks into movable named sections.

### Patch Changes

- [#103](https://github.com/alex289/marp-collab/pull/103) [`88907d1`](https://github.com/alex289/marp-collab/commit/88907d104b0ec74424ffc2a3a19aaeec959acb21) Thanks [@dasultras](https://github.com/dasultras)! - Load project theme fonts in the editor session so they render in sandboxed slides behind authentication proxies.

## 0.4.0

### Minor Changes

- [#100](https://github.com/alex289/marp-collab/pull/100) [`3d464ef`](https://github.com/alex289/marp-collab/commit/3d464ef7611055457dbebda893b4d8383a540ee5) Thanks [@alex289](https://github.com/alex289)! - Let AI assistants pull from and push to a project's connected Git repository over MCP, with their own one-line commit messages and conflict resolution per path.

- [#96](https://github.com/alex289/marp-collab/pull/96) [`d996ace`](https://github.com/alex289/marp-collab/commit/d996ace1533a110cab67ae150c8dd6da73866077) Thanks [@alex289](https://github.com/alex289)! - Add a live demo mode to presentations. Press D or use the Live demo button to pause the deck for a demo: audience windows show a demo screen and leave fullscreen, and Chrome and Edge show floating controls with the demo timer, speaker notes and a way back to the presentation. Slides marked with `<!-- demo: Title -->` are highlighted in the presenter view.

- [#93](https://github.com/alex289/marp-collab/pull/93) [`bb539a4`](https://github.com/alex289/marp-collab/commit/bb539a44a28fb09f623289ceec5a21c7b66837c6) Thanks [@alex289](https://github.com/alex289)! - Automatically start sign-in when only one OIDC provider is configured. Keep manual sign-in after logout or authentication errors, and retain the provider chooser when multiple providers are available.

- [#97](https://github.com/alex289/marp-collab/pull/97) [`0fc884b`](https://github.com/alex289/marp-collab/commit/0fc884be06ececeae9aaa64214bc009f21fddc00) Thanks [@alex289](https://github.com/alex289)! - Support Tailwind CSS utilities in presentations. Decks opt in with the `tailwind: true` directive; utilities for the classes they use apply in the preview, presentation mode and PDF export, and the editor completes Tailwind classes and variants.

### Patch Changes

- [#97](https://github.com/alex289/marp-collab/pull/97) [`acf174d`](https://github.com/alex289/marp-collab/commit/acf174d37361e31419d5d84c728057209f25d7a1) Thanks [@alex289](https://github.com/alex289)! - Harden the PDF export: a Content-Security-Policy keeps the PDF renderer from fetching remote URLs referenced by deck or theme CSS (for example through `image-set()` or inline `<style>`), and CSS URL rewriting no longer slows down quadratically on malformed input.

## 0.3.0

### Minor Changes

- [#89](https://github.com/alex289/marp-collab/pull/89) [`19075f8`](https://github.com/alex289/marp-collab/commit/19075f8b4e2096ac8cb2d9567c48c3c1511adf58) Thanks [@alex289](https://github.com/alex289)! - Upgrade Gotenberg to 9

- [#85](https://github.com/alex289/marp-collab/pull/85) [`9b8f611`](https://github.com/alex289/marp-collab/commit/9b8f6111d267f7f642e49162cf008cb57c6b0276) Thanks [@alex289](https://github.com/alex289)! - Add project Git synchronization

- [#43](https://github.com/alex289/marp-collab/pull/43) [`16e5b82`](https://github.com/alex289/marp-collab/commit/16e5b824546a75d0abde2e3944ad9ec1d1e9d079) Thanks [@alex289](https://github.com/alex289)! - Support nested project Markdown includes in previews, slide navigation and PDF export, with automatic refresh and bounded expansion.

- [#92](https://github.com/alex289/marp-collab/pull/92) [`e33a4ce`](https://github.com/alex289/marp-collab/commit/e33a4ce2181acf9a8f389f4e7ba6bfd520c4105a) Thanks [@alex289](https://github.com/alex289)! - Add an MCP server so AI assistants can list, read, create and edit presentations after OAuth login and consent, with edits synchronized to open editors.

### Patch Changes

- [#88](https://github.com/alex289/marp-collab/pull/88) [`ad28838`](https://github.com/alex289/marp-collab/commit/ad28838faafa30aec33a68822789e6fdd6418d5d) Thanks [@dependabot](https://github.com/apps/dependabot)! - Update dependencies and tooling, and migrate OAuth login to Better Auth 1.7. OAuth providers must use `/api/v1/auth/callback/<n>` as the redirect URI in place of `/api/v1/auth/oauth2/callback/<n>`.

  Migrate PDF export to Gotenberg 9. Custom deployments must upgrade the PDF service alongside the app.

## 0.2.0

### Minor Changes

- [#73](https://github.com/alex289/marp-collab/pull/73) [`a08b3d9`](https://github.com/alex289/marp-collab/commit/a08b3d92a17b05d2292a04cc768e88dd65d3c6b1) Thanks [@alex289](https://github.com/alex289)! - Autocompletion for paths, css and marp directives

- [#67](https://github.com/alex289/marp-collab/pull/67) [`2a39a4f`](https://github.com/alex289/marp-collab/commit/2a39a4f8111f2cabb9ebe8b076088e538563b294) Thanks [@alex289](https://github.com/alex289)! - Show project name in tab title

- [#67](https://github.com/alex289/marp-collab/pull/67) [`2a39a4f`](https://github.com/alex289/marp-collab/commit/2a39a4f8111f2cabb9ebe8b076088e538563b294) Thanks [@alex289](https://github.com/alex289)! - Remove editor header and move actions into bottom toolbar

- [#72](https://github.com/alex289/marp-collab/pull/72) [`a982329`](https://github.com/alex289/marp-collab/commit/a982329b45fa397644ae3de199068823af277716) Thanks [@alex289](https://github.com/alex289)! - Display presentator in presentation mode

- [#71](https://github.com/alex289/marp-collab/pull/71) [`d8d4a4b`](https://github.com/alex289/marp-collab/commit/d8d4a4ba8ddf4dbeeede8eb922c9e76d71b38a9b) Thanks [@alex289](https://github.com/alex289)! - Drop images directly in the editor

- [#74](https://github.com/alex289/marp-collab/pull/74) [`c19b0e5`](https://github.com/alex289/marp-collab/commit/c19b0e5fa40e04c8d2ed3df32d1fa16acc3e0692) Thanks [@alex289](https://github.com/alex289)! - Detect missing files and display a warning

- [#70](https://github.com/alex289/marp-collab/pull/70) [`0e58ba8`](https://github.com/alex289/marp-collab/commit/0e58ba89b3c383defcff7ad40dc95fa4317a66bc) Thanks [@timokoessler](https://github.com/timokoessler)! - Add basic markdown and css formatting with prettier

- [#68](https://github.com/alex289/marp-collab/pull/68) [`d389870`](https://github.com/alex289/marp-collab/commit/d389870f2da512d6f1dd86c6c52fb04680064618) Thanks [@alex289](https://github.com/alex289)! - Add project table view

- [#67](https://github.com/alex289/marp-collab/pull/67) [`2a39a4f`](https://github.com/alex289/marp-collab/commit/2a39a4f8111f2cabb9ebe8b076088e538563b294) Thanks [@alex289](https://github.com/alex289)! - Add version and link to release to main page

- [#68](https://github.com/alex289/marp-collab/pull/68) [`cb78522`](https://github.com/alex289/marp-collab/commit/cb785224f0a5a7a8dcf4b71d8546c091dea65ed1) Thanks [@alex289](https://github.com/alex289)! - Add project search and sort

- [#75](https://github.com/alex289/marp-collab/pull/75) [`85fb43a`](https://github.com/alex289/marp-collab/commit/85fb43affffe7fba99a972b9b776d26ab462439c) Thanks [@alex289](https://github.com/alex289)! - Allow pasting images into the editor

### Patch Changes

- [#84](https://github.com/alex289/marp-collab/pull/84) [`a8b7279`](https://github.com/alex289/marp-collab/commit/a8b7279b28f16c39b2caf1017dfa274f677b55b4) Thanks [@alex289](https://github.com/alex289)! - Fix sqlite creation error with docker

- [#80](https://github.com/alex289/marp-collab/pull/80) [`8bc8add`](https://github.com/alex289/marp-collab/commit/8bc8add3fd65d6ac2b4c8b66a284275106896a20) Thanks [@timokoessler](https://github.com/timokoessler)! - Add new logo

- [#83](https://github.com/alex289/marp-collab/pull/83) [`b6a9c88`](https://github.com/alex289/marp-collab/commit/b6a9c8804734863894b18f69316c5558f81e92b7) Thanks [@alex289](https://github.com/alex289)! - Fix responsive ui for tablet screen sizes

## 0.1.0

### Minor Changes

- [#62](https://github.com/alex289/marp-collab/pull/62) [`c0c82cb`](https://github.com/alex289/marp-collab/commit/c0c82cb2cd8be6a08938a20915af343a91ce6663) Thanks [@alex289](https://github.com/alex289)! - Initial release
