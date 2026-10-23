import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import {
	type ReactNode,
	type Ref,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/*
 * The entity banner: the header at the head of one entity's
 * page. Back to its list, its tile, its name and state, one line of facts,
 * its numbers, its actions, and the tabs that split the page below. It is a
 * flat v3 card: no glow and no grid, because v3 has no decorative hues; the
 * name's size and the facts' quieter line carry the hierarchy.
 *
 * The top bar keeps the page's h1 and its crumbs. The banner repeats the
 * name large, as the screen's heading people see, and hides it from screen
 * readers so the name is announced once.
 */

export type BannerTab = {
	id: string;
	label: string;
	/** A count, only when a route supplies it. A tab with no data has none. */
	count?: number;
	/** The key that opens it, announced as aria-keyshortcuts ("1"). */
	shortcut?: string;
};

export function EntityBanner({
	back,
	tile,
	name,
	status,
	facts,
	stats,
	actions,
	tabs,
	tabsLabel,
	ref,
	"data-testid": testId,
}: {
	back: { label: string } & Pick<LinkProps, "to" | "search">;
	tile: ReactNode;
	name: string;
	/** A BannerStatus, when the entity has a state to show. */
	status?: ReactNode;
	/** One line under the name: "Schema agent, since March 2026, v3". */
	facts: ReactNode;
	/** BannerStat items. */
	stats?: ReactNode;
	actions?: ReactNode;
	tabs: readonly BannerTab[];
	tabsLabel: string;
	/** The section, for a PinnedBanner that shows once it scrolls away. */
	ref?: Ref<HTMLElement>;
	"data-testid": string;
}) {
	return (
		<section
			ref={ref}
			data-testid={testId}
			aria-label={name}
			className="overflow-hidden rounded-card border border-border bg-app-panel text-text shadow-card"
		>
			<div className="flex flex-col gap-5 px-4 pt-4 md:px-8 md:pt-6">
				<Link
					to={back.to}
					search={back.search}
					data-testid={`${testId}-back`}
					className="py-1.5 -my-1.5 inline-flex w-fit items-center gap-1.5 rounded-xs type-caption text-text-muted transition-colors duration-(--duration-micro) ease-avel hover:text-text"
				>
					<ArrowLeft aria-hidden="true" className="size-3.5" />
					{back.label}
				</Link>
				<div className="flex flex-wrap items-center gap-x-10 gap-y-5">
					<div className="flex min-w-0 flex-1 basis-80 items-center gap-5">
						{tile}
						<div className="flex min-w-0 flex-col gap-1">
							<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
								<p
									aria-hidden="true"
									data-testid={`${testId}-name`}
									title={name}
									className="type-display truncate text-text"
								>
									{name}
								</p>
								{status}
							</div>
							<p
								data-testid={`${testId}-facts`}
								className="type-small text-text-muted"
							>
								{facts}
							</p>
						</div>
					</div>
					{stats ? (
						<dl
							data-testid={`${testId}-stats`}
							className="flex flex-wrap items-stretch gap-y-3"
						>
							{stats}
						</dl>
					) : null}
					{actions ? (
						<div
							data-testid={`${testId}-actions`}
							className="flex shrink-0 items-center gap-2"
						>
							{actions}
						</div>
					) : null}
				</div>
				<TabsList
					aria-label={tabsLabel}
					className="no-scrollbar -mx-4 h-11! w-auto max-w-none justify-start gap-1 overflow-x-auto rounded-none border-t border-border px-3 md:-mx-8 md:px-7"
				>
					{tabs.map((tab) => (
						<TabsTrigger
							key={tab.id}
							value={tab.id}
							aria-keyshortcuts={tab.shortcut}
							data-testid={`${testId}-tab-${tab.id}`}
							className="focus-inset h-full flex-none rounded-none px-3 text-text-muted after:bottom-0! hover:text-text data-[state=active]:text-text"
						>
							{tab.label}
							{tab.count === undefined ? null : (
								<Badge
									variant="count"
									data-testid={`${testId}-tab-${tab.id}-count`}
								>
									{tab.count}
								</Badge>
							)}
						</TabsTrigger>
					))}
				</TabsList>
			</div>
		</section>
	);
}

/**
 * A state on the banner: a dot and a word, the dot lit only when live. It is
 * a v3 pill on the pending ground; the dot takes the pass solid only when
 * the entity is working, so colour repeats what the word says.
 */
export function BannerStatus({
	label,
	live,
	"data-testid": testId,
}: {
	label: string;
	live: boolean;
	"data-testid": string;
}) {
	return (
		<span
			data-testid={testId}
			data-live={live || undefined}
			className="inline-flex h-[22px] items-center gap-[5px] rounded-sm bg-gate-pending-soft px-2 type-caption font-medium text-text"
		>
			<span
				aria-hidden="true"
				className={cn(
					"size-1.5 rounded-full",
					live ? "bg-gate-pass-solid" : "bg-gate-pending-solid",
				)}
			/>
			{label}
		</span>
	);
}

/**
 * One number on the banner, over its label. With `link`, the number opens
 * where it was counted (the missions, the tools tab); its link names both.
 */
export function BannerStat({
	value,
	label,
	link,
	"data-testid": testId,
}: {
	value: string;
	label: string;
	link?: Pick<LinkProps, "to" | "params" | "search">;
	"data-testid": string;
}) {
	return (
		<div
			data-testid={testId}
			className="flex flex-col-reverse gap-0.5 border-l border-border px-5 first:border-l-0 first:pl-0"
		>
			<dt className="type-caption text-text-muted">{label}</dt>
			<dd className="type-metric text-text">
				{link ? (
					<Link
						{...link}
						data-testid={`${testId}-link`}
						className="rounded-xs underline-offset-4 decoration-border transition-colors duration-(--duration-micro) ease-avel hover:underline"
					>
						{value}
						<span className="sr-only">{` ${label}`}</span>
					</Link>
				) : (
					value
				)}
			</dd>
		</div>
	);
}

/**
 * The entity's tile on the banner: an icon for what kind of thing it is (or
 * its initials, where a page has no icon for it), on v3's ringed tile. It is
 * neutral: the accent is for what the operator can act on, and the tile is
 * decorative (the name and facts say the same).
 */
export function BannerTile({
	icon: Icon,
	initials,
	size = "lg",
	"data-testid": testId,
}: (
	| { icon: LucideIcon; initials?: never }
	| { initials: string; icon?: never }
) & {
	/** lg on the banner, sm on the pinned bar. */
	size?: "lg" | "sm";
	"data-testid": string;
}) {
	return (
		<span
			aria-hidden="true"
			data-testid={testId}
			className={cn(
				"inline-flex shrink-0 items-center justify-center border border-border bg-app-well font-semibold text-text-muted",
				size === "lg"
					? "size-16 rounded-card"
					: "size-tile-md rounded-tile type-small",
				size === "lg" && Icon === undefined && "type-display",
			)}
		>
			{Icon ? (
				<Icon className={size === "lg" ? "size-7" : "size-4"} />
			) : (
				initials
			)}
		</span>
	);
}

/**
 * True once `watch` has scrolled up past the sticky top bar, from an
 * IntersectionObserver on the canvas scroller (main#main) with the bar's
 * height taken off its top, so nothing runs while scrolling.
 */
function usePastTop(watch: RefObject<HTMLElement | null>): boolean {
	const [past, setPast] = useState(false);
	useEffect(() => {
		const node = watch.current;
		if (!node) return;
		const main = node.closest("main");
		const bar = main
			? Number.parseFloat(
					getComputedStyle(main).getPropertyValue("--topbar-height"),
				) || 0
			: 0;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry) return;
				const top = (entry.rootBounds?.top ?? 0) + bar;
				// Out of view above the bar, not below the fold.
				setPast(!entry.isIntersecting && entry.boundingClientRect.top < top);
			},
			{ root: main, rootMargin: `-${bar}px 0px 0px 0px` },
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, [watch]);
	return past;
}

/**
 * The banner, pinned (ruling 46): once the banner scrolls away under the top
 * bar, a slim bar with its tile, its name and its tabs stays under the top
 * bar. It is sticky at zero height, so it takes no room in the page and only
 * lies over what has already scrolled past; while it shows, the canvas's
 * scroll padding grows by its height so a focused control is never hidden
 * under it. Hidden, it is inert and out of the accessibility tree. It fades
 * in place; with reduced motion the change is immediate (app.css).
 *
 * Its tabs are plain buttons, not a second tablist, so each tab keeps one id.
 */
export function PinnedBanner({
	watch,
	icon,
	tile,
	name,
	tabs,
	value,
	onSelect,
	className,
	"data-testid": testId,
}: {
	/** The banner it stands in for. */
	watch: RefObject<HTMLElement | null>;
	/** The banner's tile, small: its icon, or a tile of the page's own. */
	icon?: LucideIcon;
	tile?: ReactNode;
	name: string;
	tabs: readonly BannerTab[];
	value: string;
	onSelect: (id: string) => void;
	className?: string;
	"data-testid": string;
}) {
	const shown = usePastTop(watch);
	const bar = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const node = bar.current;
		const main = node?.closest("main");
		if (!shown || !node || !main) return;
		const before = main.style.scrollPaddingTop;
		main.style.scrollPaddingTop = `calc(var(--topbar-height) + ${node.offsetHeight}px)`;
		return () => {
			main.style.scrollPaddingTop = before;
		};
	}, [shown]);
	return (
		<div
			data-testid={testId}
			data-shown={shown || undefined}
			className={cn(
				"sticky top-(--topbar-height) z-(--z-raised) h-0",
				className,
			)}
		>
			<div
				ref={bar}
				aria-hidden={!shown}
				inert={!shown}
				className={cn(
					"absolute inset-x-0 top-0 flex h-12 items-center gap-3 rounded-b-card border border-t-0 border-border bg-app-panel pr-1 pl-3 text-text shadow-popover transition-[opacity,translate] duration-(--duration-micro) ease-avel",
					shown
						? "translate-y-0 opacity-100"
						: "pointer-events-none -translate-y-1 opacity-0",
				)}
			>
				{tile ??
					(icon ? (
						<BannerTile icon={icon} size="sm" data-testid={`${testId}-tile`} />
					) : null)}
				<p
					aria-hidden="true"
					className="min-w-0 shrink truncate type-small font-medium"
				>
					{name}
				</p>
				<nav
					aria-label={`${name}'s page`}
					className="no-scrollbar ml-auto flex h-full min-w-0 items-stretch overflow-x-auto"
				>
					{tabs.map((tab) => (
						<button
							key={tab.id}
							type="button"
							aria-current={tab.id === value ? "true" : undefined}
							data-testid={`${testId}-tab-${tab.id}`}
							onClick={() => onSelect(tab.id)}
							className={cn(
								"focus-inset relative flex flex-none items-center gap-1.5 px-3 type-small transition-colors duration-(--duration-micro) ease-avel hover:text-text",
								tab.id === value
									? "text-text after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent-text"
									: "text-text-muted",
							)}
						>
							{tab.label}
							{tab.count === undefined ? null : (
								<Badge variant="count">{tab.count}</Badge>
							)}
						</button>
					))}
				</nav>
			</div>
		</div>
	);
}
