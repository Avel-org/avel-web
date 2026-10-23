"use client";

import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";
import * as React from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function Command({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive>) {
	return (
		<CommandPrimitive
			data-slot="command"
			className={cn(
				"flex h-full w-full flex-col overflow-hidden rounded-card bg-app-float text-text",
				className,
			)}
			{...props}
		/>
	);
}

function CommandDialog({
	title = "Command Palette",
	description = "Search for a command to run...",
	children,
	className,
	showCloseButton = true,
	...props
}: React.ComponentProps<typeof Dialog> & {
	title?: string;
	description?: string;
	className?: string;
	showCloseButton?: boolean;
}) {
	return (
		<Dialog {...props}>
			<DialogContent
				// The close circle sits centred on the 48px search row, which
				// leaves room for it.
				className={cn(
					"gap-0 overflow-hidden p-0 max-sm:px-0 [&>[data-slot=dialog-close]]:top-2",
					className,
				)}
				showCloseButton={showCloseButton}
			>
				{/* Inside the content, so it exists only while the dialog is
				    open. Outside it, the header rendered in the page while
				    closed, and its sr-only box, positioned against the root,
				    stretched the document so the whole shell could scroll. */}
				<DialogHeader className="sr-only">
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<Command
					className={cn(
						"rounded-none **:data-[slot=command-input-wrapper]:h-12",
						showCloseButton && "**:data-[slot=command-input-wrapper]:pr-14",
					)}
				>
					{children}
				</Command>
			</DialogContent>
		</Dialog>
	);
}

function CommandInput({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
	return (
		<div
			data-slot="command-input-wrapper"
			className="flex h-9 items-center gap-2.5 border-b border-border px-4"
		>
			<SearchIcon className="size-4 shrink-0 text-text-subtle" />
			<CommandPrimitive.Input
				data-slot="command-input"
				className={cn(
					"flex h-full w-full bg-transparent type-body text-text outline-hidden placeholder:text-text-subtle disabled:cursor-not-allowed",
					className,
				)}
				{...props}
			/>
		</div>
	);
}

function CommandList({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
	return (
		<CommandPrimitive.List
			data-slot="command-list"
			className={cn(
				"max-h-[300px] scroll-py-1.5 overflow-x-hidden overflow-y-auto py-1.5",
				className,
			)}
			{...props}
		/>
	);
}

function CommandEmpty({
	...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
	// cmdk decides emptiness when it renders. On the server it counts zero
	// items, and the server's "No results." survives hydration until the
	// first keystroke. Rendering after mount lets it count the real items.
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => setMounted(true), []);
	if (!mounted) return null;

	return (
		<CommandPrimitive.Empty
			data-slot="command-empty"
			className="py-6 text-center type-small text-text-muted"
			{...props}
		/>
	);
}

function CommandGroup({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
	return (
		<CommandPrimitive.Group
			data-slot="command-group"
			className={cn(
				"overflow-hidden text-text [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:type-caption [&_[cmdk-group-heading]]:text-text-subtle",
				className,
			)}
			{...props}
		/>
	);
}

function CommandItem({
	className,
	reason,
	disabled,
	children,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Item> & {
	/**
	 * Disables the row and prints why at its end, at full contrast (v3
	 * .cmdk-row.is-unavailable). On a phone the reason takes its own line,
	 * set in under the label.
	 */
	reason?: string;
}) {
	return (
		<CommandPrimitive.Item
			data-slot="command-item"
			disabled={disabled === true || reason !== undefined}
			className={cn(
				// v3 .cmdk-row: 36px, inset 6px from the edges. The keyboard's row
				// is the one selected state (Polish 10): the selected fill, its
				// icon in accent. An unavailable row (UX 6) goes quiet and grows
				// to hold its reason.
				"relative mx-1.5 flex h-9 cursor-default items-center gap-2.5 rounded-control px-2.5 type-body text-text outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:h-auto data-[disabled=true]:min-h-9 data-[disabled=true]:flex-wrap data-[disabled=true]:gap-y-0.5 data-[disabled=true]:py-2 data-[disabled=true]:text-text-subtle data-[selected=true]:bg-selected data-[selected=true]:text-text [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-text-subtle data-[selected=true]:[&_svg:not([class*='text-'])]:text-accent-text",
				className,
			)}
			{...props}
		>
			{children}
			{reason === undefined ? null : (
				<span
					data-slot="command-reason"
					className="ml-auto type-caption text-text-muted max-[560px]:ml-[25px] max-[560px]:basis-full"
				>
					{reason}
				</span>
			)}
		</CommandPrimitive.Item>
	);
}

function CommandShortcut({
	className,
	...props
}: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="command-shortcut"
			className={cn("ml-auto type-mono text-text-subtle", className)}
			{...props}
		/>
	);
}

export {
	Command,
	CommandDialog,
	CommandInput,
	CommandList,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandShortcut,
};
