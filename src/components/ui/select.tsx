import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import * as React from "react";
import { usePortalContainer } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { DisabledReason } from "./button";

function Select({
	...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
	return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectValue({
	...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
	return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
	className,
	size = "default",
	disabledReason,
	disabled,
	children,
	...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
	size?: "sm" | "default";
	/**
	 * Disables the select and says why, in a tooltip on a focusable wrapper,
	 * exactly as Button's disabledReason does (AVEL-DESIGN.md ruling 11).
	 */
	disabledReason?: string;
}) {
	const reasonId = React.useId();
	const trigger = (
		<SelectPrimitive.Trigger
			data-slot="select-trigger"
			data-size={size}
			className={cn(
				// v3 .field as a trigger: Input's box, ring and invalid state, a 14px
				// subtle chevron. `!`: the global :focus-visible outline sits
				// outside the layers, and the field's own ring already shows focus.
				"field-surface flex w-fit items-center justify-between gap-2 rounded-control px-2.5 type-body whitespace-nowrap text-text transition-[background-color,border-color,box-shadow] duration-(--duration-micro) ease-avel focus-visible:outline-none! disabled:cursor-not-allowed disabled:bg-app-raised disabled:text-text-subtle data-[placeholder]:text-text-subtle data-[size=default]:h-control-md data-[size=sm]:h-control-sm *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 [&_svg:not([class*='text-'])]:text-text-subtle",
				className,
			)}
			{...props}
			disabled={disabled === true || disabledReason !== undefined}
			aria-describedby={
				disabledReason === undefined ? props["aria-describedby"] : reasonId
			}
		>
			{children}
			<SelectPrimitive.Icon asChild>
				<ChevronDownIcon className="size-3.5 text-text-subtle" />
			</SelectPrimitive.Icon>
		</SelectPrimitive.Trigger>
	);
	if (disabledReason === undefined) return trigger;
	return (
		<DisabledReason reason={disabledReason} reasonId={reasonId}>
			{trigger}
		</DisabledReason>
	);
}

function SelectContent({
	className,
	children,
	position = "item-aligned",
	align = "center",
	...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
	return (
		<SelectPrimitive.Portal container={usePortalContainer()}>
			<SelectPrimitive.Content
				data-slot="select-content"
				className={cn(
					// v3 .menu: the float surface, card radius and popover shadow.
					"relative z-(--z-popover) max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-card bg-app-float bg-clip-padding text-text shadow-popover data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 duration-(--duration-micro) ease-avel",
					position === "popper" &&
						"data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
					className,
				)}
				position={position}
				align={align}
				{...props}
			>
				<SelectScrollUpButton />
				<SelectPrimitive.Viewport
					className={cn(
						"p-1.5",
						position === "popper" &&
							"h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1",
					)}
				>
					{children}
				</SelectPrimitive.Viewport>
				<SelectScrollDownButton />
			</SelectPrimitive.Content>
		</SelectPrimitive.Portal>
	);
}

function SelectItem({
	className,
	children,
	disabledReason,
	disabled,
	...props
}: React.ComponentProps<typeof SelectPrimitive.Item> & {
	/**
	 * Disables the option and prints why in its row (v3 UX 6
	 * .is-unavailable). The reason sits outside the item's text, so the
	 * trigger never shows it.
	 */
	disabledReason?: string;
}) {
	return (
		<SelectPrimitive.Item
			data-slot="select-item"
			disabled={disabled === true || disabledReason !== undefined}
			className={cn(
				"data-[disabled]:h-auto data-[disabled]:min-h-9 data-[disabled]:flex-wrap data-[disabled]:gap-y-0.5 data-[disabled]:py-2",
				"relative flex h-9 w-full cursor-default items-center gap-2.5 rounded-control pr-8 pl-2.5 type-body outline-hidden select-none focus:bg-app-raised focus:text-text data-[disabled]:pointer-events-none data-[disabled]:text-text-subtle [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-text-subtle *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
				className,
			)}
			{...props}
		>
			<span
				data-slot="select-item-indicator"
				className="absolute right-2.5 flex size-4 items-center justify-center"
			>
				<SelectPrimitive.ItemIndicator>
					<CheckIcon className="size-4 text-accent-text" />
				</SelectPrimitive.ItemIndicator>
			</span>
			<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
			{disabledReason === undefined ? null : (
				<span
					data-slot="item-reason"
					className="ml-auto type-caption text-text-muted"
				>
					{disabledReason}
				</span>
			)}
		</SelectPrimitive.Item>
	);
}

function SelectScrollUpButton({
	className,
	...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
	return (
		<SelectPrimitive.ScrollUpButton
			data-slot="select-scroll-up-button"
			className={cn(
				"flex cursor-default items-center justify-center py-1",
				className,
			)}
			{...props}
		>
			<ChevronUpIcon className="size-4" />
		</SelectPrimitive.ScrollUpButton>
	);
}

function SelectScrollDownButton({
	className,
	...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
	return (
		<SelectPrimitive.ScrollDownButton
			data-slot="select-scroll-down-button"
			className={cn(
				"flex cursor-default items-center justify-center py-1",
				className,
			)}
			{...props}
		>
			<ChevronDownIcon className="size-4" />
		</SelectPrimitive.ScrollDownButton>
	);
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
