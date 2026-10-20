import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * A list row that reacts to hover is a button or a link (v3 UX 5): it takes
 * focus, opens with Enter (and Space, for a button), and ends in a chevron
 * that says it opens something. The row carries ROW_LINK_GROUP; the chevron
 * brightens and nudges 2px right on hover or keyboard focus, as v3's
 * .row-link does.
 */

/** The class a row adds so its RowChevron answers its hover and focus. */
export const ROW_LINK_GROUP = "group/row";

export function RowChevron({ className }: { className?: string }) {
	return (
		<ChevronRight
			aria-hidden="true"
			data-slot="row-chevron"
			className={cn(
				"size-3.5 shrink-0 text-text-subtle transition-[color,translate] duration-(--duration-micro) ease-avel",
				"group-hover/row:translate-x-0.5 group-hover/row:text-text group-focus-visible/row:translate-x-0.5 group-focus-visible/row:text-text",
				className,
			)}
		/>
	);
}
