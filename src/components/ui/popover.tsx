import { Popover as PopoverPrimitive } from "radix-ui";
import type * as React from "react";
import { usePortalContainer } from "@/lib/theme";
import { cn } from "@/lib/utils";

function Popover({
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
	return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
	return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

// v3 .menu: the float surface, card radius and popover shadow, which adds
// the dark-mode outline where a shadow vanishes.
function PopoverContent({
	className,
	align = "center",
	sideOffset = 4,
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
	return (
		<PopoverPrimitive.Portal container={usePortalContainer()}>
			<PopoverPrimitive.Content
				data-slot="popover-content"
				align={align}
				sideOffset={sideOffset}
				className={cn(
					"z-(--z-popover) w-72 origin-(--radix-popover-content-transform-origin) rounded-card bg-app-float bg-clip-padding p-4 text-text shadow-popover outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 duration-(--duration-micro) ease-avel",
					className,
				)}
				{...props}
			/>
		</PopoverPrimitive.Portal>
	);
}

function PopoverAnchor({
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
	return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
