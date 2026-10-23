import { cva, type VariantProps } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

function Tabs({
	className,
	orientation = "horizontal",
	...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			data-orientation={orientation}
			orientation={orientation}
			className={cn(
				"group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
				className,
			)}
			{...props}
		/>
	);
}

/*
 * Two looks. `default` is v3 .segmented, for a tab list that switches one
 * value: a raised track with a 3px inset, the active option a chip above it.
 * `line` is for a page's sections. v3 names no underline tab, so it is the
 * segmented control's type with the accent marking the selection, as v3
 * marks the active step (.step-pill.on, accent-text) and as app.css reserves
 * the accent for selection. The underline is one element that slides to the
 * new tab over the state duration (design doc section 4, the tab
 * indicator). tabsListVariants({ variant: "default" }) is also the track for
 * a segmented row of Buttons (variant "segment").
 */
const tabsListVariants = cva(
	"group/tabs-list inline-flex w-fit items-center justify-center text-text-muted group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
	{
		variants: {
			variant: {
				default:
					"gap-0.5 rounded-control border border-border bg-app-raised p-[3px]",
				line: "relative gap-1 bg-transparent group-data-[orientation=horizontal]/tabs:h-9",
			},
		},
		defaultVariants: {
			variant: "line",
		},
	},
);

function TabsList({
	className,
	variant = "line",
	children,
	...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
	VariantProps<typeof tabsListVariants>) {
	const ref = React.useRef<HTMLDivElement>(null);
	const box = useActiveTab(ref, variant === "line");
	return (
		<TabsPrimitive.List
			ref={ref}
			data-slot="tabs-list"
			data-variant={variant}
			data-indicator={box ? "ready" : undefined}
			className={cn(tabsListVariants({ variant }), className)}
			{...props}
		>
			{children}
			{variant === "line" ? (
				<span
					aria-hidden="true"
					data-slot="tabs-indicator"
					data-animate={box?.animate || undefined}
					style={{
						transform: `translate(${box?.x ?? 0}px, ${box?.y ?? 0}px)`,
						width: box?.width ?? 0,
					}}
					className={cn(
						"pointer-events-none absolute top-0 left-0 h-0.5 bg-accent-text",
						"data-animate:transition-[transform,width] data-animate:duration-(--duration-state) data-animate:ease-avel motion-reduce:transition-none",
						box ? "opacity-100" : "opacity-0",
					)}
				/>
			) : null}
		</TabsPrimitive.List>
	);
}

type TabBox = { x: number; y: number; width: number; animate: boolean };

/**
 * Where the active tab's underline goes, measured in the browser: under the
 * active trigger, 5px below it, as its own underline sat. Re-measured when
 * the active tab changes or the list resizes. The first measure places it
 * without moving; later ones slide. Horizontal lists only: a vertical list
 * keeps each trigger's own bar.
 */
function useActiveTab(
	ref: React.RefObject<HTMLDivElement | null>,
	enabled: boolean,
): TabBox | null {
	const [box, setBox] = React.useState<TabBox | null>(null);
	React.useEffect(() => {
		const list = ref.current;
		if (!enabled || !list || list.dataset.orientation === "vertical") return;
		const measure = () => {
			const tab = list.querySelector<HTMLElement>(
				':scope > [data-slot="tabs-trigger"][data-state="active"]',
			);
			if (!tab) return setBox(null);
			setBox((previous) => ({
				x: tab.offsetLeft,
				y: tab.offsetTop + tab.offsetHeight + 3,
				width: tab.offsetWidth,
				animate: previous !== null,
			}));
		};
		measure();
		const resize = new ResizeObserver(measure);
		resize.observe(list);
		const states = new MutationObserver(measure);
		states.observe(list, {
			subtree: true,
			attributes: true,
			attributeFilter: ["data-state"],
		});
		return () => {
			resize.disconnect();
			states.disconnect();
		};
	}, [ref, enabled]);
	return box;
}

function TabsTrigger({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			className={cn(
				"relative inline-flex flex-1 items-center justify-center gap-1.5 border border-transparent whitespace-nowrap text-text-muted transition-colors duration-(--duration-micro) ease-avel group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-text disabled:pointer-events-none disabled:text-text-subtle data-[state=active]:text-text [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				// Segmented: a 24px option in a 32px track, a chip when active.
				"group-data-[variant=default]/tabs-list:h-6 group-data-[variant=default]/tabs-list:rounded-sm group-data-[variant=default]/tabs-list:px-2.5 group-data-[variant=default]/tabs-list:type-small group-data-[variant=default]/tabs-list:data-[state=active]:border-border group-data-[variant=default]/tabs-list:data-[state=active]:bg-chip group-data-[variant=default]/tabs-list:data-[state=active]:shadow-btn",
				// Line: the label. The sliding indicator is the underline; until
				// it has measured (the server's paint), and in a vertical list,
				// the active trigger draws its own 2px bar.
				"group-data-[variant=line]/tabs-list:h-[calc(100%-1px)] group-data-[variant=line]/tabs-list:px-2 group-data-[variant=line]/tabs-list:type-body group-data-[variant=line]/tabs-list:font-medium",
				"after:absolute after:bg-accent-text after:opacity-0 group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100 group-data-[indicator=ready]/tabs-list:data-[state=active]:after:opacity-0!",
				className,
			)}
			{...props}
		/>
	);
}

function TabsContent({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
	return (
		<TabsPrimitive.Content
			data-slot="tabs-content"
			className={cn("flex-1", className)}
			{...props}
		/>
	);
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
