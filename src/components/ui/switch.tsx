import { Switch as SwitchPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";
import { DisabledReason } from "./button";

// v3 .switch with R2 and UX 2: a 30 by 18 track with a 14px white thumb
// 2px in. Off, the track is the 3:1 control edge; on, the primary face.
// Disabled goes flat, as every v3 control does (UX 6). The track is drawn
// 18px tall; its hit area is 24 (UX 1): the pseudo-element sits inside the 1px
// border, so it reaches 4px past the padding box above and below.
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
				"peer group/switch relative inline-flex shrink-0 items-center after:absolute after:inset-x-0 after:-inset-y-1 data-[size=sm]:after:-inset-x-px data-[size=sm]:after:-inset-y-1.5 rounded-full border border-transparent p-px transition-[background-color,border-color] duration-(--duration-micro) ease-avel data-[size=default]:h-[18px] data-[size=default]:w-[30px] data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-[state=checked]:enabled:control-on data-[state=unchecked]:enabled:bg-border-control disabled:cursor-not-allowed disabled:border-border-strong disabled:bg-app-raised",
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
					"pointer-events-none block rounded-full bg-text-on-solid shadow-btn group-disabled/switch:bg-app-panel group-disabled/switch:shadow-none transition-transform duration-(--duration-micro) ease-avel group-data-[size=default]/switch:size-3.5 group-data-[size=sm]/switch:size-2.5 data-[state=unchecked]:translate-x-0 group-data-[size=default]/switch:data-[state=checked]:translate-x-3 group-data-[size=sm]/switch:data-[state=checked]:translate-x-2.5",
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
