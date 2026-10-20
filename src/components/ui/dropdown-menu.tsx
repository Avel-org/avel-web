"use client";

import { CheckIcon, ChevronRightIcon } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import type * as React from "react";
import { usePortalContainer } from "@/lib/theme";
import { cn } from "@/lib/utils";

function DropdownMenu({
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
	return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuPortal({
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
	return (
		<DropdownMenuPrimitive.Portal
			data-slot="dropdown-menu-portal"
			container={usePortalContainer()}
			{...props}
		/>
	);
}

function DropdownMenuTrigger({
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
	return (
		<DropdownMenuPrimitive.Trigger
			data-slot="dropdown-menu-trigger"
			{...props}
		/>
	);
}

// v3 .menu: the float surface, card radius and popover shadow; rows are
// v3 .menu-row, 36px at 14px, raised under the pointer or the keyboard.
function DropdownMenuContent({
	className,
	sideOffset = 4,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
	return (
		<DropdownMenuPrimitive.Portal container={usePortalContainer()}>
			<DropdownMenuPrimitive.Content
				data-slot="dropdown-menu-content"
				sideOffset={sideOffset}
				className={cn(
					"z-(--z-popover) max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-card bg-app-float bg-clip-padding p-1.5 text-text shadow-popover data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 duration-(--duration-micro) ease-avel",
					className,
				)}
				{...props}
			/>
		</DropdownMenuPrimitive.Portal>
	);
}

function DropdownMenuGroup({
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
	return (
		<DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
	);
}

/**
 * A row that cannot act says why in the row itself (v3 UX 6
 * .is-unavailable): quiet, grown to hold its reason, which keeps full
 * contrast and wraps to its own line when the menu is narrow.
 */
const UNAVAILABLE =
	"data-[disabled]:h-auto data-[disabled]:min-h-9 data-[disabled]:flex-wrap data-[disabled]:gap-y-0.5 data-[disabled]:py-2";

/** The reason beside an unavailable row's label (v3 .reason). */
function ItemReason({ children }: { children: React.ReactNode }) {
	return (
		<span
			data-slot="item-reason"
			className="ml-auto type-caption text-text-muted"
		>
			{children}
		</span>
	);
}

function DropdownMenuItem({
	className,
	inset,
	variant = "default",
	disabledReason,
	disabled,
	children,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
	inset?: boolean;
	variant?: "default" | "destructive";
	/** Disables the row and prints why in it. Not with asChild. */
	disabledReason?: string;
}) {
	return (
		<DropdownMenuPrimitive.Item
			data-slot="dropdown-menu-item"
			data-inset={inset}
			data-variant={variant}
			disabled={disabled === true || disabledReason !== undefined}
			className={cn(
				UNAVAILABLE,
				"relative flex h-9 cursor-default items-center gap-2.5 rounded-control px-2.5 type-body outline-hidden select-none focus:bg-app-raised focus:text-text data-[disabled]:pointer-events-none data-[disabled]:text-text-subtle data-[inset]:pl-8 data-[variant=destructive]:text-gate-block data-[variant=destructive]:focus:bg-gate-block-soft data-[variant=destructive]:focus:text-gate-block [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-text-subtle focus:[&_svg:not([class*='text-'])]:text-text data-[variant=destructive]:*:[svg]:text-gate-block!",
				className,
			)}
			{...props}
		>
			{children}
			{disabledReason === undefined ? null : (
				<ItemReason>{disabledReason}</ItemReason>
			)}
		</DropdownMenuPrimitive.Item>
	);
}

function DropdownMenuCheckboxItem({
	className,
	children,
	checked,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
	return (
		<DropdownMenuPrimitive.CheckboxItem
			data-slot="dropdown-menu-checkbox-item"
			className={cn(
				"relative flex h-9 cursor-default items-center gap-2.5 rounded-control pr-2.5 pl-8 type-body outline-hidden select-none focus:bg-app-raised focus:text-text data-[disabled]:pointer-events-none data-[disabled]:text-text-subtle [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			checked={checked}
			{...props}
		>
			<span className="pointer-events-none absolute left-2.5 flex size-4 items-center justify-center">
				<DropdownMenuPrimitive.ItemIndicator>
					<CheckIcon className="size-4 text-accent-text" />
				</DropdownMenuPrimitive.ItemIndicator>
			</span>
			{children}
		</DropdownMenuPrimitive.CheckboxItem>
	);
}

function DropdownMenuRadioGroup({
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
	return (
		<DropdownMenuPrimitive.RadioGroup
			data-slot="dropdown-menu-radio-group"
			{...props}
		/>
	);
}

function DropdownMenuRadioItem({
	className,
	children,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
	return (
		<DropdownMenuPrimitive.RadioItem
			data-slot="dropdown-menu-radio-item"
			className={cn(
				"relative flex h-9 cursor-default items-center gap-2.5 rounded-control pr-2.5 pl-8 type-body outline-hidden select-none focus:bg-app-raised focus:text-text data-[disabled]:pointer-events-none data-[disabled]:text-text-subtle [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			{...props}
		>
			<span className="pointer-events-none absolute left-2.5 flex size-4 items-center justify-center">
				<DropdownMenuPrimitive.ItemIndicator>
					<span className="size-1.5 rounded-full bg-accent-text" />
				</DropdownMenuPrimitive.ItemIndicator>
			</span>
			{children}
		</DropdownMenuPrimitive.RadioItem>
	);
}

function DropdownMenuLabel({
	className,
	inset,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
	inset?: boolean;
}) {
	return (
		<DropdownMenuPrimitive.Label
			data-slot="dropdown-menu-label"
			data-inset={inset}
			className={cn(
				"px-2.5 pt-2 pb-1 type-caption text-text-subtle data-[inset]:pl-8",
				className,
			)}
			{...props}
		/>
	);
}

function DropdownMenuSeparator({
	className,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
	return (
		<DropdownMenuPrimitive.Separator
			data-slot="dropdown-menu-separator"
			className={cn("-mx-1.5 my-1.5 h-px bg-border", className)}
			{...props}
		/>
	);
}

function DropdownMenuShortcut({
	className,
	...props
}: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="dropdown-menu-shortcut"
			className={cn("ml-auto type-mono text-text-subtle", className)}
			{...props}
		/>
	);
}

function DropdownMenuSub({
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
	return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
	className,
	inset,
	children,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
	inset?: boolean;
}) {
	return (
		<DropdownMenuPrimitive.SubTrigger
			data-slot="dropdown-menu-sub-trigger"
			data-inset={inset}
			className={cn(
				"flex h-9 cursor-default items-center gap-2.5 rounded-control px-2.5 type-body outline-hidden select-none focus:bg-app-raised focus:text-text data-[inset]:pl-8 data-[state=open]:bg-app-raised data-[state=open]:text-text [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-text-subtle",
				className,
			)}
			{...props}
		>
			{children}
			<ChevronRightIcon className="ml-auto size-3.5" />
		</DropdownMenuPrimitive.SubTrigger>
	);
}

function DropdownMenuSubContent({
	className,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
	return (
		<DropdownMenuPrimitive.SubContent
			data-slot="dropdown-menu-sub-content"
			className={cn(
				"z-(--z-popover) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-card bg-app-float bg-clip-padding p-1.5 text-text shadow-popover data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 duration-(--duration-micro) ease-avel",
				className,
			)}
			{...props}
		/>
	);
}

export {
	DropdownMenu,
	DropdownMenuPortal,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuItem,
	DropdownMenuCheckboxItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubTrigger,
	DropdownMenuSubContent,
};
