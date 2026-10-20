import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/*
 * tailwind-merge only knows Tailwind's default scales. AVEL's are its own
 * (src/styles/app.css clears the defaults), so without this a caller's
 * `rounded-card` or `h-control-sm` would sit beside the primitive's
 * `rounded-control` or `h-control-md` and the stylesheet's order, not the
 * caller, would pick the winner.
 */
const twMerge = extendTailwindMerge<"type-role">({
	extend: {
		theme: {
			radius: ["xs", "sm", "tile", "control", "card", "dialog"],
			shadow: ["card", "btn", "popover", "dialog", "drag"],
			spacing: [
				"control-sm",
				"control-md",
				"control-lg",
				"tile-sm",
				"tile-md",
				"tile-lg",
			],
		},
		classGroups: {
			// The v3 type roles each set size, line height and weight together:
			// one per element, the last one given wins.
			"type-role": [
				{
					type: [
						"display",
						"page",
						"title",
						"body",
						"small",
						"caption",
						"eyebrow",
						"metric",
						"mono",
					],
				},
			],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
