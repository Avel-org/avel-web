import type * as React from "react";
import { cn } from "@/lib/utils";

// v3 has no table class. Its parts are v3's: the header on the band (as a
// dialog footer is), hairline rows that raise under the pointer (Polish 5),
// cells on the 10/12 row spacing (Polish 9), and tabular numerals so columns
// of numbers line up (Polish 2).
function Table({
	className,
	stickyHeader = false,
	...props
}: React.ComponentProps<"table"> & {
	/**
	 * Holds the header band at the top while the table scrolls under it. Opt
	 * in: the container scrolls sideways for wide tables, which makes it the
	 * sticky scope, so the band holds only when the container itself scrolls
	 * vertically (a capped height). In a dialog or a short panel it would sit
	 * over a clipped scroll, so it is off by default.
	 */
	stickyHeader?: boolean;
}) {
	return (
		<div
			data-slot="table-container"
			className="relative w-full overflow-x-auto"
		>
			<table
				data-slot="table"
				data-sticky-header={stickyHeader || undefined}
				className={cn(
					"group/table w-full caption-bottom type-body tabular-nums",
					className,
				)}
				{...props}
			/>
		</div>
	);
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
	return (
		<thead
			data-slot="table-header"
			className={cn("[&_tr]:border-b [&_tr]:border-border", className)}
			{...props}
		/>
	);
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
	return (
		<tbody
			data-slot="table-body"
			className={cn("[&_tr:last-child]:border-0", className)}
			{...props}
		/>
	);
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
	return (
		<tr
			data-slot="table-row"
			className={cn(
				"border-b border-border transition-colors duration-(--duration-micro) ease-avel hover:bg-app-raised has-aria-expanded:bg-app-raised data-[state=selected]:bg-selected",
				className,
			)}
			{...props}
		/>
	);
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
	return (
		<th
			data-slot="table-head"
			className={cn(
				"group-data-[sticky-header]/table:sticky group-data-[sticky-header]/table:top-0 group-data-[sticky-header]/table:z-(--z-raised) h-9 bg-app-band px-3 text-left align-middle type-caption font-medium whitespace-nowrap text-text-muted [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
				className,
			)}
			{...props}
		/>
	);
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
	return (
		<td
			data-slot="table-cell"
			className={cn(
				"px-3 py-2.5 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
				className,
			)}
			{...props}
		/>
	);
}

export { Table, TableHeader, TableBody, TableHead, TableRow, TableCell };
