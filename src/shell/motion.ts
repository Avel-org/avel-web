/*
 * Motion that says something changed, within AVEL-DESIGN.md section 4: the
 * state duration (200ms), the one easing, nothing bouncy, no overshoot, and
 * every state still reads with motion off.
 *
 * Entering. A container marked `data-enter="<kind>"` animates each child
 * element added to it after it is on screen: a row a filter brings back, a
 * view swapped in, a count that changed, the ring on a lifecycle's new
 * step, and data replacing a panel's skeleton. What a page renders in one
 * go is never "added" to a marked container (the container arrives with
 * it), so it does not move; only a change does, loading included. One
 * watcher in the shell covers every page and every portal.
 *
 * Landing. `landRecord(id)` gives whatever shows a record
 * (`data-record-id`) the landed highlight once: the row a save just changed.
 */

export type EnterKind = "rise" | "fade" | "settle";

const KINDS: readonly EnterKind[] = ["rise", "fade", "settle"];

/** Section 4's state duration, and its easing. */
export const STATE_MS = 200;
const EASE = "cubic-bezier(0.2, 0.7, 0.3, 1)";

/** How a child of this parent enters, or null when it does not animate. */
export function enterKindOf(
	parent: { getAttribute(name: string): string | null } | null,
): EnterKind | null {
	const kind = parent?.getAttribute("data-enter");
	return KINDS.includes(kind as EnterKind) ? (kind as EnterKind) : null;
}

/** The keyframes for each kind: small, and only from faint to settled. */
export function enterFrames(kind: EnterKind): Keyframe[] {
	switch (kind) {
		case "rise":
			return [
				{ opacity: 0, transform: "translateY(3px)" },
				{ opacity: 1, transform: "none" },
			];
		case "fade":
			return [{ opacity: 0 }, { opacity: 1 }];
		case "settle":
			return [
				{ opacity: 0, transform: "scale(0.6)" },
				{ opacity: 1, transform: "none" },
			];
	}
}

const reducedMotion = () =>
	window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * Watch `root` for elements added to a `data-enter` container, and play
 * their entrance. Returns the stop function.
 */
export function watchEntering(root: Node): () => void {
	if (typeof MutationObserver === "undefined") return () => {};
	const observer = new MutationObserver((records) => {
		if (reducedMotion()) return;
		for (const record of records) {
			const kind = enterKindOf(record.target as Element);
			if (kind === null) continue;
			for (const node of record.addedNodes) {
				if (node instanceof HTMLElement || node instanceof SVGElement) {
					node.animate?.(enterFrames(kind), {
						duration: STATE_MS,
						easing: EASE,
					});
				}
			}
		}
	});
	observer.observe(root, { childList: true, subtree: true });
	return () => observer.disconnect();
}

/**
 * The landed highlight, once, on an element: the selected fill and edge
 * held for the state duration, then eased back over another to the
 * element's own surface. A Web Animation rather than the `landed` class:
 * the class ends on transparent, which flashed a card's panel colour away.
 * With reduced motion it does not play; the toast still says what happened.
 */
export function flashLanded(el: HTMLElement): void {
	if (reducedMotion() || typeof el.animate !== "function") return;
	// The tokens as they resolve here, so the dark theme's apply.
	const style = getComputedStyle(el);
	const fill = style.getPropertyValue("--color-selected").trim();
	const edge = style.getPropertyValue("--color-selected-border").trim();
	if (!fill) return;
	const lit = {
		backgroundColor: fill,
		boxShadow: edge ? `0 0 0 1px ${edge}` : "none",
	};
	el.animate([lit, { ...lit, offset: 0.5 }, {}], {
		duration: STATE_MS * 2,
		easing: EASE,
	});
}

/**
 * Land every element that shows the record a write just changed. Called
 * after the write's modal closes, so the highlight is seen, not hidden
 * behind the dialog as it leaves.
 */
export function landRecord(id: string): void {
	if (typeof document === "undefined") return;
	window.setTimeout(() => {
		for (const el of document.querySelectorAll<HTMLElement>(
			`[data-record-id="${CSS.escape(id)}"]`,
		)) {
			flashLanded(el);
		}
	}, STATE_MS);
}
