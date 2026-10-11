import { type RefObject, useLayoutEffect, useRef } from "react";

/**
 * FLIP for the board's chips. Calling the returned function before a move
 * measures every element under the container carrying `data-flip`; after the
 * render that follows, each animates from where it was to where it is, over
 * --duration-state with ease-avel (AVEL-DESIGN.md section 4: no bounce). A
 * chip that moved to another wave changes its key, so the call names its
 * old and new keys and it travels instead of appearing.
 *
 * Nothing is measured on any other render, so typing in the inspector costs
 * nothing here. Reduced motion, or no Web Animations, means no animation:
 * every state is readable without it.
 */
export function useFlip(container: RefObject<HTMLElement | null>) {
	// Set only by a queued move: positions before it, and the moved chip's keys.
	const pending = useRef<{
		rects: Map<string, DOMRect>;
		alias: Map<string, string>;
	} | null>(null);

	useLayoutEffect(() => {
		const queued = pending.current;
		if (queued === null) return;
		pending.current = null;
		const root = container.current;
		if (!root) return;
		const reduced =
			typeof window.matchMedia === "function" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (reduced) return;
		const style = getComputedStyle(document.documentElement);
		const duration =
			Number.parseFloat(style.getPropertyValue("--duration-state")) || 200;
		const easing = style.getPropertyValue("--ease-avel").trim() || "ease-out";
		for (const el of root.querySelectorAll<HTMLElement>("[data-flip]")) {
			const key = el.dataset.flip ?? "";
			const before = queued.rects.get(queued.alias.get(key) ?? key);
			if (!before || typeof el.animate !== "function") continue;
			const rect = el.getBoundingClientRect();
			const dx = before.left - rect.left;
			const dy = before.top - rect.top;
			if (dx === 0 && dy === 0) continue;
			el.animate(
				[{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
				{ duration, easing },
			);
		}
	});

	/** Call before a move: measures now; the chip at `to` was the one at `from`. */
	return (from: string, to: string) => {
		const root = container.current;
		if (!root) return;
		const rects = new Map<string, DOMRect>();
		for (const el of root.querySelectorAll<HTMLElement>("[data-flip]")) {
			rects.set(el.dataset.flip ?? "", el.getBoundingClientRect());
		}
		pending.current = { rects, alias: new Map([[to, from]]) };
	};
}
