# Slide transitions

Animate slide changes in presentation mode with the `transition` directive. It works like [Marp CLI's transitions](https://github.com/marp-team/marp-cli/blob/main/docs/bespoke-transitions/README.md), so decks and themes written for Marp CLI animate the same way here.

```markdown
---
marp: true
transition: fade
---

# First slide

---

<!-- transition: cube 1s -->

# Rotates into the next slide

---

<!-- _transition: none -->

# Cuts to the next slide without a transition
```

`transition` is a local directive: set it in the frontmatter for the whole deck, in a comment to change it from that slide on, or with a leading `_` for one slide only. A transition plays when you leave the slide that sets it, and the same transition plays in reverse when you come back to that slide. Add a duration in `s` or `ms` after the name to override the default of `0.5s`. `none` turns transitions off.

Transitions play in presenter and viewer windows (`?mode=present` and `?mode=viewer`). The editor preview, the next-slide preview and PDF export show slides without them.

## Built-in transitions

`clockwise`, `counterclockwise`, `cover`, `coverflow`, `cube`, `cylinder`, `diamond`, `drop`, `explode`, `fade`, `fade-out`, `fall`, `flip`, `glow`, `implode`, `in-out`, `iris-in`, `iris-out`, `melt`, `overlap`, `pivot`, `pull`, `push`, `reveal`, `rotate`, `slide`, `star`, `swap`, `swipe`, `swoosh`, `wipe`, `wiper` and `zoom`. The editor suggests them after `transition:`. Previews of each are in the [Marp CLI docs](https://github.com/marp-team/marp-cli/blob/main/docs/bespoke-transitions/README.md#built-in-transitions).

## Custom transitions

Define a transition in a project theme, or in a slide's `<style>`, with `@keyframes` named after it. The simplest form animates the slide being left, and the incoming slide plays the same keyframes in reverse:

```css
@keyframes marp-transition-spin {
	to {
		transform: rotate(90deg) scale(0);
		opacity: 0;
	}
}
```

Use it with `transition: spin`. To animate the two slides differently, declare `marp-outgoing-transition-<name>` and `marp-incoming-transition-<name>`:

```css
@keyframes marp-outgoing-transition-rise {
	from {
		/* Default duration, still overridable with `transition: rise 2s` */
		--marp-transition-duration: 1s;
	}
	to {
		transform: translateY(calc(var(--marp-transition-direction, 1) * -100%));
	}
}

@keyframes marp-incoming-transition-rise {
	from {
		transform: translateY(calc(var(--marp-transition-direction, 1) * 100%));
	}
}
```

- `--marp-transition-direction` is `1` when moving forward and `-1` when moving back.
- `--marp-transition-duration` in the first keyframe (`from` or `0%`) sets the default duration.
- Keyframes with `backward-` before the name, such as `marp-incoming-transition-backward-rise`, replace the normal ones when moving back. Declare an empty one to stop the fallback to the forward keyframes.
- Theme keyframes take precedence over a built-in transition with the same name.

## Browser support

Transitions use the [View Transitions API](https://developer.mozilla.org/docs/Web/API/View_Transition_API). Browsers without it change slides instantly. Viewers who prefer reduced motion see a short crossfade instead.
