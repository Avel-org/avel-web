import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

// Colour never carries meaning alone: a badge that shows a state also carries
// its word. `tag` is AVEL's addition, a neutral mono tag for values with no
// declared vocabulary (mission status, IDs, slugs, waves, runtime).
const badgeVariants = cva(
	"inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors duration-(--duration-micro) ease-avel aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3",
	{
		variants: {
			variant: {
				default: "bg-accent-soft text-accent-text [a&]:hover:bg-state-selected",
				secondary:
					"border-border bg-secondary text-secondary-foreground [a&]:hover:bg-state-hover",
				destructive:
					"border-gate-block-line bg-gate-block-soft text-gate-block",
				outline:
					"border-border-strong text-foreground [a&]:hover:bg-state-hover",
				ghost: "text-foreground [a&]:hover:bg-state-hover",
				link: "text-accent-text underline-offset-4 [a&]:hover:underline",
				tag: "rounded-xs border-border-strong bg-app-band font-mono font-normal text-text-muted tabular-nums",
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

export { Badge, badgeVariants };
