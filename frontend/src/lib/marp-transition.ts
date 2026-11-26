import type { Marp } from "@marp-team/marp-core";

/** Mirrors Marp CLI's `transition` directive so decks written for it animate here too. */
export type SlideTransition = {
	name: string;
	duration?: string;
	/** Falls back to the built-in keyframes when no theme defines this name. */
	builtinFallback?: boolean;
};

export const BUILTIN_TRANSITIONS = [
	"clockwise",
	"counterclockwise",
	"cover",
	"coverflow",
	"cube",
	"cylinder",
	"diamond",
	"drop",
	"explode",
	"fade",
	"fade-out",
	"fall",
	"flip",
	"glow",
	"implode",
	"in-out",
	"iris-in",
	"iris-out",
	"melt",
	"overlap",
	"pivot",
	"pull",
	"push",
	"reveal",
	"rotate",
	"slide",
	"star",
	"swap",
	"swipe",
	"swoosh",
	"wipe",
	"wiper",
	"zoom",
] as const;

const builtinTransitions = new Set<string>(BUILTIN_TRANSITIONS);

/** Keyframe names a theme can declare for a transition named by the first group. */
const keyframeMatcher = /^marp-(?:(?:outgoing|incoming)-)?transition-(?:backward-)?(.+)$/;

const transitionName = /^[\w-]+$/;
const transitionDuration = /^(?:\d+\.?\d*|\.\d+)m?s$/;

export function parseTransitionDirective(value: unknown): SlideTransition | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const [name, duration] = value.trim().split(/\s+/);
	if (!name || !transitionName.test(name)) {
		return undefined;
	}
	return duration && transitionDuration.test(duration) ? { name, duration } : { name };
}

const isSlideTransition = (value: unknown): value is SlideTransition =>
	typeof value === "object" &&
	value !== null &&
	typeof (value as SlideTransition).name === "string";

type TransitionToken = {
	type: string;
	attrSet(name: string, value: string): void;
	meta?: {
		marpitDirectives?: { transition?: unknown };
		marpitStyleScoped?: { key?: string; keyframeSet?: Set<string> };
	} | null;
};

/**
 * Adds the `transition` local directive. Each slide gets `data-transition` for leaving forward
 * and `data-transition-back` for returning to the slide that defined it, like Marp CLI.
 */
export function installSlideTransitions(marp: Marp) {
	marp.customDirectives.local.transition = (value) => {
		const transition = parseTransitionDirective(value);
		return transition ? { transition } : {};
	};

	marp.use((md) => {
		md.core.ruler.after(
			"marpit_directives_apply",
			"marp_collab_transition",
			(state: { inlineMode: boolean; tokens: TransitionToken[] }) => {
				if (state.inlineMode) {
					return false;
				}
				let previousTransition: string | undefined;
				for (const token of state.tokens) {
					if (token.type === "marpit_slide_open" && previousTransition) {
						token.attrSet("data-transition-back", previousTransition);
						previousTransition = undefined;
					}

					const directive = token.meta?.marpitDirectives?.transition;
					if (!isSlideTransition(directive)) {
						continue;
					}
					// Inherited directives share one object across slides.
					const transition: SlideTransition = { ...directive };
					if (builtinTransitions.has(transition.name)) {
						transition.builtinFallback = true;
					}

					// Marpit renames keyframes from `<style scoped>`, so follow the scoped name.
					const scoped = token.meta?.marpitStyleScoped;
					if (scoped?.key) {
						for (const keyframe of scoped.keyframeSet ?? []) {
							if (keyframe.match(keyframeMatcher)?.[1] === transition.name) {
								transition.name = `${transition.name}-${scoped.key}`;
								transition.builtinFallback = false;
								break;
							}
						}
					}

					const json = JSON.stringify(transition);
					token.attrSet("data-transition", json);
					previousTransition = json;
				}
				return true;
			},
		);
	});
}
