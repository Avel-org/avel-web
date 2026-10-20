"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

function RadioGroup({
	className,
	...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
	return (
		<RadioGroupPrimitive.Root
			data-slot="radio-group"
			className={cn("grid gap-3", className)}
			{...props}
		/>
	);
}

// v3 .radio with R2 and UX 2: 16px, a 3:1 unchecked edge, and checked in the
// primary face around a 6px white dot. Disabled as Checkbox's. Drawn at
// 16px, hit at 24 (UX 1).
function RadioGroupItem({
	className,
	...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
	return (
		<RadioGroupPrimitive.Item
			data-slot="radio-group-item"
			className={cn(
				"relative grid aspect-square size-4 shrink-0 place-content-center after:absolute after:-inset-[5px] rounded-full border border-border-control bg-app-field text-text-on-solid transition-[background-color,border-color] duration-(--duration-micro) ease-avel aria-invalid:border-gate-block-solid data-[state=checked]:enabled:control-on disabled:cursor-not-allowed disabled:border-dashed disabled:bg-app-raised disabled:text-text-subtle",
				className,
			)}
			{...props}
		>
			<RadioGroupPrimitive.Indicator
				data-slot="radio-group-indicator"
				className="grid place-content-center"
			>
				<span className="size-1.5 rounded-full bg-current" />
			</RadioGroupPrimitive.Indicator>
		</RadioGroupPrimitive.Item>
	);
}

export { RadioGroup, RadioGroupItem };
