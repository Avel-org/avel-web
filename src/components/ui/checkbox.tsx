"use client";

import { CheckIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

// v3 .check with R2 and UX 2: 16px, a 3:1 unchecked edge, and checked in the
// primary face with a white 12px glyph at stroke 3. Disabled is v3 UX 6's
// unavailable check: raised and dashed, so it never reads as a choice. The
// glyph scales in over the micro duration as the box fills (Polish 5); with
// motion off it simply appears. The box is drawn at 16px; its hit area
// is 24 (UX 1).
function Checkbox({
	className,
	...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
	return (
		<CheckboxPrimitive.Root
			data-slot="checkbox"
			className={cn(
				"peer relative grid size-4 shrink-0 place-content-center after:absolute after:-inset-[5px] rounded-xs border border-border-control bg-field-fill text-text-on-solid transition-[background-color,border-color] duration-(--duration-micro) ease-avel aria-invalid:border-gate-block-solid data-[state=checked]:enabled:control-on disabled:cursor-not-allowed disabled:border-dashed disabled:bg-app-raised disabled:text-text-subtle",
				className,
			)}
			{...props}
		>
			<CheckboxPrimitive.Indicator
				data-slot="checkbox-indicator"
				className="grid place-content-center text-current animate-in fade-in-0 zoom-in-75 duration-(--duration-micro) ease-avel"
			>
				{/* `!`: app.css sets every lucide stroke to 1.75, outside the layers. */}
				<CheckIcon className="size-3 stroke-3!" />
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	);
}

export { Checkbox };
