import { Switch as SwitchPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";
import { DisabledReason } from "./button";

function Switch({
	className,
	size = "default",
	disabledReason,
	disabled,
	...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
	size?: "sm" | "default";
	/**
	 * Disables the switch and says why, in a tooltip on a focusable wrapper,
	 * exactly as Button's disabledReason does (AVEL-DESIGN.md ruling 11).
	 */
	disabledReason?: string;
}) {
	const reasonId = React.useId();
	const switchElement = (
		<SwitchPrimitive.Root
			data-slot="switch"
			data-size={size}
			className={cn(
				"peer group/switch inline-flex shrink-0 items-center rounded-full border border-transparent transition-colors duration-(--duration-micro) ease-avel  disabled:cursor-not-allowed disabled:opacity-(--opacity-disabled) data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-[state=checked]:bg-primary data-[state=unchecked]:bg-border-strong",
				className,
			)}
			{...props}
			disabled={disabled === true || disabledReason !== undefined}
			aria-describedby={
				disabledReason === undefined ? props["aria-describedby"] : reasonId
			}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className={cn(
					"pointer-events-none block rounded-full ring-0 transition-transform duration-(--duration-micro) ease-avel group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 data-[state=checked]:bg-primary-foreground data-[state=unchecked]:bg-foreground",
				)}
			/>
		</SwitchPrimitive.Root>
	);

	if (disabledReason === undefined) return switchElement;

	return (
		<DisabledReason reason={disabledReason} reasonId={reasonId}>
			{switchElement}
		</DisabledReason>
	);
}

export { Switch };
