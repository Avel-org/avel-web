import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

// Design system v3's small labels. Colour never carries meaning alone: a
// badge that shows a state also carries its word, and a contract state is a
// StatusPill (its glyph's shape carries the meaning, audit D2), not a Badge.
//
//   default      a selected or active label (v3 .tag.is-big, .step-pill.on)
//   secondary    a neutral tag (v3 .tag)
//   destructive  a block pill (v3 .pill-block), for something that failed
//   outline      a neutral label with an edge, no v3 class: .tag's type on
//                .kbd's edge
//   tag          a mono value with no declared vocabulary: IDs, slugs,
//                waves, runtime (v3 .hash)
//   count        a number beside a label (v3 .count-badge)
//   kbd          a key (v3 .kbd); <Kbd> renders it as the element
const badgeVariants = cva(
	"inline-flex h-[22px] w-fit shrink-0 items-center justify-center gap-[5px] overflow-hidden rounded-sm border border-transparent px-2 type-caption font-medium whitespace-nowrap transition-colors duration-(--duration-micro) ease-avel aria-invalid:border-gate-block-solid [&>svg]:pointer-events-none [&>svg]:size-3",
	{
		variants: {
			variant: {
				default:
					"border-accent-line bg-selected text-accent-text [a&]:hover:bg-accent-soft",
				secondary:
					"bg-gate-pending-soft font-normal text-gate-pending [a&]:hover:bg-app-raised",
				// The pill's ground in light; dark adds the tone's line as an
				// inset edge (v3 Polish 10).
				destructive:
					"bg-gate-block-soft text-gate-block in-[.dark]:border-gate-block-line",
				outline:
					"border-border-strong bg-app-panel font-normal text-text-muted [a&]:hover:bg-app-raised",
				tag: "h-auto rounded-xs bg-gate-pending-soft px-1.5 py-px font-mono font-normal text-text-muted tabular-nums",
				count:
					"h-5 min-w-6 border-border bg-app-panel px-1.5 text-text tabular-nums",
				kbd: "h-auto rounded-xs border-border-strong bg-app-panel px-[5px] py-px font-mono text-[11px] leading-4 font-normal text-text-subtle",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

function Badge({
	className,
	variant = "default",
	asChild = false,
	...props
}: React.ComponentProps<"span"> &
	VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
	const Comp = asChild ? Slot.Root : "span";

	return (
		<Comp
			data-slot="badge"
			data-variant={variant}
			className={cn(badgeVariants({ variant }), className)}
			{...props}
		/>
	);
}

/** A keyboard key, as text: a shortcut beside a label or in a hint row. */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
	return (
		<kbd
			data-slot="kbd"
			className={cn(badgeVariants({ variant: "kbd" }), className)}
			{...props}
		/>
	);
}

export { Badge, Kbd };
