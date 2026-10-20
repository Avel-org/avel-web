import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { usePortalContainer } from "@/lib/theme";
import { cn } from "@/lib/utils";

function Dialog({
	...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
	return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({
	...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
	return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
	...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
	const container = usePortalContainer();
	return (
		<DialogPrimitive.Portal
			data-slot="dialog-portal"
			container={container}
			{...props}
		/>
	);
}

function DialogClose({
	...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
	return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
	return (
		<DialogPrimitive.Overlay
			data-slot="dialog-overlay"
			className={cn(
				"fixed inset-0 z-(--z-modal) bg-scrim backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
				className,
			)}
			{...props}
		/>
	);
}

/** v3 R3: a 32px soft circle, centred on the title line. */
export const CLOSE_BUTTON =
	"absolute top-[15px] right-[18px] grid size-8 place-items-center rounded-full bg-app-raised text-text-muted transition-colors duration-(--duration-micro) ease-avel hover:bg-border-strong hover:text-text disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

/**
 * v3 .dialog: the float surface at the dialog radius and shadow, laid out on
 * a 4px grid (Polish 9): 20px above the header, 24px at the sides, 16px
 * between the header and each block of the body, 20px above the footer band.
 * The padding sits on the content, so a header, a body and a footer compose
 * as siblings; the footer bleeds to the edges as the band.
 *
 * On a phone (v3 UX 7) it is a bottom sheet: full width, top corners only,
 * at most 92% of the viewport, scrolling under a footer that stays pinned.
 */
function DialogContent({
	className,
	children,
	showCloseButton = true,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
	showCloseButton?: boolean;
}) {
	return (
		<DialogPortal data-slot="dialog-portal">
			<DialogOverlay />
			<DialogPrimitive.Content
				data-slot="dialog-content"
				className={cn(
					"fixed top-[50%] left-[50%] z-(--z-modal) flex w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] flex-col gap-4 overflow-hidden rounded-dialog bg-app-float bg-clip-padding px-6 pt-5 pb-5 text-text shadow-dialog duration-(--duration-state) ease-avel has-[>[data-slot=dialog-footer]]:pb-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg",
					"max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-h-[92dvh] max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:overflow-y-auto max-sm:overscroll-contain max-sm:rounded-b-none max-sm:px-4",
					showCloseButton && "[&>[data-slot=dialog-header]]:pr-10",
					className,
				)}
				{...props}
			>
				{children}
				{showCloseButton && (
					<DialogPrimitive.Close
						data-slot="dialog-close"
						className={CLOSE_BUTTON}
					>
						<XIcon />
						<span className="sr-only">Close</span>
					</DialogPrimitive.Close>
				)}
			</DialogPrimitive.Content>
		</DialogPortal>
	);
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="dialog-header"
			className={cn("flex flex-col gap-1.5 text-left", className)}
			{...props}
		/>
	);
}

function DialogFooter({
	className,
	showCloseButton = false,
	children,
	...props
}: React.ComponentProps<"div"> & {
	showCloseButton?: boolean;
}) {
	return (
		<div
			data-slot="dialog-footer"
			className={cn(
				// v3 .dialog-foot: the band, 12px tall padding, 16px right and
				// 24px left. On a phone (UX 7) a link takes its own row first and
				// the buttons share the next at the large height, primary last,
				// clear of the home indicator.
				"sticky bottom-0 -mx-6 mt-1 flex items-center justify-end gap-2 border-t border-border bg-app-band py-3 pr-4 pl-6",
				"max-sm:*:data-[variant=link]:order-first max-sm:*:data-[variant=link]:basis-full max-sm:*:data-[variant=link]:justify-start max-sm:-mx-4 max-sm:flex-wrap max-sm:px-4 max-sm:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] max-sm:*:data-[slot=button]:h-control-lg max-sm:*:data-[slot=button]:flex-auto max-sm:*:data-[slot=button-with-reason]:flex-auto max-sm:[&>[data-slot=button-with-reason]>button]:h-control-lg max-sm:[&>[data-slot=button-with-reason]>button]:w-full",
				className,
			)}
			{...props}
		>
			{/* Close first, so the footer's primary (its last child) sits last. */}
			{showCloseButton && (
				<DialogPrimitive.Close asChild>
					<Button variant="outline">Close</Button>
				</DialogPrimitive.Close>
			)}
			{children}
		</div>
	);
}

function DialogTitle({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
	return (
		<DialogPrimitive.Title
			data-slot="dialog-title"
			className={cn("type-page text-text", className)}
			{...props}
		/>
	);
}

function DialogDescription({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
	return (
		<DialogPrimitive.Description
			data-slot="dialog-description"
			className={cn("type-small text-text-muted", className)}
			{...props}
		/>
	);
}

export {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
	DialogTrigger,
};
