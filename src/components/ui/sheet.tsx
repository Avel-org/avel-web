"use client";

import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import type * as React from "react";
import { usePortalContainer } from "@/lib/theme";
import { cn } from "@/lib/utils";

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
	return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({
	...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
	return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
	...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
	return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({
	...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
	const container = usePortalContainer();
	return (
		<SheetPrimitive.Portal
			data-slot="sheet-portal"
			container={container}
			{...props}
		/>
	);
}

function SheetOverlay({
	className,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
	return (
		<SheetPrimitive.Overlay
			data-slot="sheet-overlay"
			className={cn(
				"fixed inset-0 z-(--z-modal) bg-scrim backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
				className,
			)}
			{...props}
		/>
	);
}

/**
 * v3 has no sheet. It is a v3 .dialog held to one edge: the float surface,
 * the dialog shadow, the dialog radius on its free corners, the dialog's
 * header and footer geometry, and the R3 close button.
 */
function SheetContent({
	className,
	children,
	side = "right",
	showCloseButton = true,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
	side?: "top" | "right" | "bottom" | "left";
	showCloseButton?: boolean;
}) {
	return (
		<SheetPortal>
			<SheetOverlay />
			<SheetPrimitive.Content
				data-slot="sheet-content"
				className={cn(
					"fixed z-(--z-modal) flex flex-col gap-4 bg-app-float bg-clip-padding text-text shadow-dialog transition ease-avel data-[state=closed]:animate-out data-[state=closed]:duration-(--duration-state) data-[state=open]:animate-in data-[state=open]:duration-(--duration-state)",
					// From sm up it floats inset from the edge, as the canvas does,
					// with every corner rounded; on a phone it is the whole edge.
					side === "right" &&
						"inset-y-0 right-0 h-full w-3/4 rounded-l-dialog border-l border-border data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:inset-y-(--canvas-inset) sm:right-(--canvas-inset) sm:h-auto sm:max-w-sm sm:rounded-dialog sm:border",
					side === "left" &&
						"inset-y-0 left-0 h-full w-3/4 rounded-r-dialog border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
					side === "top" &&
						"inset-x-0 top-0 h-auto rounded-b-dialog border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
					side === "bottom" &&
						"inset-x-0 bottom-0 h-auto rounded-t-dialog border-t pb-[env(safe-area-inset-bottom,0px)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
					className,
				)}
				{...props}
			>
				{children}
				{showCloseButton && (
					<SheetPrimitive.Close className="absolute z-20 top-[15px] right-[18px] grid size-8 place-items-center rounded-full bg-app-raised text-text-muted transition-colors duration-(--duration-micro) ease-avel hover:bg-border-strong hover:text-text disabled:pointer-events-none">
						<XIcon className="size-4" />
						<span className="sr-only">Close</span>
					</SheetPrimitive.Close>
				)}
			</SheetPrimitive.Content>
		</SheetPortal>
	);
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sheet-header"
			// Pinned while the body scrolls under it, on the band's edge.
			className={cn(
				"sticky top-0 z-10 flex flex-col gap-1.5 border-b border-border bg-app-float px-6 pt-5 pb-4 pr-14",
				className,
			)}
			{...props}
		/>
	);
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sheet-footer"
			className={cn(
				"mt-auto flex items-center justify-end gap-2 border-t border-border bg-app-band py-3 pr-4 pl-6",
				className,
			)}
			{...props}
		/>
	);
}

function SheetTitle({
	className,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
	return (
		<SheetPrimitive.Title
			data-slot="sheet-title"
			className={cn("type-page text-text", className)}
			{...props}
		/>
	);
}

function SheetDescription({
	className,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
	return (
		<SheetPrimitive.Description
			data-slot="sheet-description"
			className={cn("type-small text-text-muted", className)}
			{...props}
		/>
	);
}

export {
	Sheet,
	SheetTrigger,
	SheetClose,
	SheetContent,
	SheetHeader,
	SheetFooter,
	SheetTitle,
	SheetDescription,
};
