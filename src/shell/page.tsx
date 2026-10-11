import { Menu } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useNavigationDrawer } from "./app-shell";
import { Breadcrumbs, useBreadcrumbs } from "./breadcrumbs";
import { GlobalActions } from "./global-actions";
import { linkFor } from "./nav";

type PageProps = {
	/** A subtitle, usually a count such as "14 skills, 2 revoked". */
	subtitle?: string;
	/** The action slot: primary first, then secondary. Reserves no space when empty. */
	actions?: ReactNode;
	/**
	 * A page that is one surface edge to edge, such as Canon's chat (ruling
	 * 16). The body fills the remaining height with no gutter or cap: the page
	 * lays itself out, using PAGE_GUTTER and its own width. The top bar is the
	 * same as any page's: its title and definition show.
	 */
	canvas?: boolean;
	children?: ReactNode;
} & (
	| {
			/** A sidebar page: title and definition come from src/shell/nav.ts. */
			to: string;
			title?: never;
			definition?: never;
	  }
	| {
			/** A page with no sidebar link, such as a mission's detail page. */
			to?: never;
			title: string;
			/** One plain sentence saying what the page is for. */
			definition?: string;
	  }
);

/**
 * The one horizontal gutter: 16px below md, 24px at md, 32px at lg. The top
 * bar and the body both start on it, so the title sits exactly on the
 * content's left edge, one gutter from the sidebar.
 */
export const PAGE_GUTTER = "px-4 md:px-6 lg:px-8";

/**
 * The bar spans the canvas: title on the left gutter, the global cluster on
 * the right one. The body is capped for reading but left-aligned, never
 * centred. Centring it pushed the title away from the sidebar on any canvas
 * wider than the cap, leaving a gap that grew with the window.
 */
const BAR = cn("w-full", PAGE_GUTTER);
const CONTENT = cn("w-full max-w-(--content-max)", PAGE_GUTTER);

/**
 * A route's browser title, named from the sidebar for every page: "Missions
 * · AVEL", "Canon · AVEL". Use as `head: pageHead("/missions")`.
 */
export function pageHead(to: string) {
	const title = `${linkFor(to).label} · AVEL`;
	return () => ({ meta: [{ title }] });
}

/**
 * A page's frame: a top bar exactly --topbar-height tall, sticky at the top
 * of the scrolling canvas (ruling 17), then the body. The bar carries the
 * breadcrumb trail (nested routes only), the title, and a subtitle or the
 * page's definition, then the page's actions and the global cluster. Pages
 * never print their own heading.
 *
 * The bar is one line tall, so it holds two lines of text at most: a nested
 * page shows its trail above the title instead of the definition.
 */
export function Page(props: PageProps) {
	const { subtitle, actions, canvas = false, children } = props;
	const crumbs = useBreadcrumbs();
	const link = props.to === undefined ? undefined : linkFor(props.to);
	const title = link?.label ?? props.title ?? "";
	const definition = link?.purpose ?? props.definition;
	const scrolled = useScrolled();
	const drawer = useNavigationDrawer();

	return (
		<div data-testid="page" className="flex min-h-0 flex-1 flex-col">
			{/* One pixel above the top bar. While it is in view the canvas is at
			    its top; once it scrolls out, the bar gains its border. */}
			<div
				ref={scrolled.sentinel}
				data-testid="page-sentinel"
				aria-hidden="true"
				className="-mb-px h-px"
			/>
			<header
				data-testid="topbar"
				data-scrolled={scrolled.value || undefined}
				className="sticky top-0 z-(--z-raised) brushed edge-highlight h-(--topbar-height) shrink-0 border-b border-transparent bg-card transition-colors duration-(--duration-micro) ease-avel data-scrolled:border-border"
			>
				<div
					data-testid="topbar-row"
					className={cn("flex h-full items-center gap-4", BAR)}
				>
					{/* Below md the sidebar is a drawer; this is its only way in. */}
					<Button
						variant="ghost"
						size="icon"
						aria-label="Open navigation"
						data-testid="drawer-open"
						className="-ml-2 md:hidden"
						onClick={drawer.open}
					>
						<Menu aria-hidden="true" />
					</Button>
					<div
						data-testid="topbar-title"
						className="flex min-w-0 flex-1 flex-col justify-center"
					>
						<Breadcrumbs crumbs={crumbs} />
						<h1 className="type-h2 truncate text-foreground">{title}</h1>
						<SecondLine
							subtitle={subtitle}
							definition={crumbs.length > 0 ? undefined : definition}
						/>
					</div>
					<div className="ml-auto flex shrink-0 items-center gap-2">
						{actions ? (
							<>
								<div
									data-testid="topbar-actions"
									className="flex items-center gap-2"
								>
									{actions}
								</div>
								<Separator orientation="vertical" className="h-4!" />
							</>
						) : null}
						<GlobalActions />
					</div>
				</div>
			</header>
			<div
				data-testid="page-body"
				className={cn(
					"flex-1",
					// A column, so an EmptyState or a not-built Surface can grow
					// into the remaining height and centre in it.
					canvas
						? "flex min-h-0 flex-col"
						: cn(CONTENT, "stagger-in flex flex-col pt-2 pb-8"),
				)}
			>
				{children}
			</div>
		</div>
	);
}

/**
 * A subtitle is a count, so its numbers are tabular. The definition is the
 * quieter line, dropped on a phone where the bar has no room for it; it stays
 * whole in a title attribute when the bar truncates it.
 */
function SecondLine({
	subtitle,
	definition,
}: {
	subtitle?: string;
	definition?: string;
}) {
	if (subtitle) {
		return (
			<p
				data-testid="topbar-subtitle"
				className="type-small truncate text-text-subtle tabular-nums"
			>
				{subtitle}
			</p>
		);
	}
	if (!definition) return null;
	return (
		<p
			data-testid="topbar-definition"
			title={definition}
			className="type-small truncate text-text-subtle max-md:hidden"
		>
			{definition}
		</p>
	);
}

/**
 * Whether the canvas has scrolled, from an IntersectionObserver on a sentinel
 * rather than a scroll listener: the browser reports the one change that
 * matters, and nothing runs while scrolling. The root is the canvas's
 * scroller (main#main), so the sentinel stops intersecting the moment the
 * canvas scrolls by a pixel.
 */
function useScrolled() {
	const sentinel = useRef<HTMLDivElement>(null);
	const [value, setValue] = useState(false);
	useEffect(() => {
		const node = sentinel.current;
		if (!node) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry) setValue(!entry.isIntersecting);
			},
			{ root: node.closest("main") },
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	return { sentinel, value };
}
