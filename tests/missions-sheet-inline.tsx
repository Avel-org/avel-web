import type { ComponentProps, ReactNode } from "react";

/*
 * The Sheet primitive, drawn in place for server-rendered tests. Radix
 * portals a dialog's content, and a portal renders nothing on the server,
 * so a test of what a drawer shows (the Missions page's mission details)
 * swaps this in with vi.mock. An open sheet renders its content where it
 * stands, marked with its side; a closed one renders nothing, as the real
 * one does, so the shell's navigation drawer stays out of the markup.
 */

type ContentProps = ComponentProps<"div"> & {
	side?: "top" | "right" | "bottom" | "left";
	showCloseButton?: boolean;
};

export function Sheet({
	open,
	children,
}: {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	children?: ReactNode;
}) {
	return open ? children : null;
}

export function SheetContent({
	side = "right",
	showCloseButton: _showCloseButton,
	...props
}: ContentProps) {
	return <div role="dialog" data-sheet-side={side} {...props} />;
}

export const SheetTrigger = ({ children }: { children?: ReactNode }) =>
	children;
export const SheetClose = ({ children }: { children?: ReactNode }) => children;
export const SheetHeader = (props: ComponentProps<"div">) => <div {...props} />;
export const SheetFooter = (props: ComponentProps<"div">) => <div {...props} />;
export const SheetTitle = (props: ComponentProps<"h2">) => <h2 {...props} />;
export const SheetDescription = (props: ComponentProps<"p">) => (
	<p {...props} />
);
