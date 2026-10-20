import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
	ChevronRight,
	ChevronsUpDown,
	LogOut,
	Moon,
	PanelLeftClose,
	PanelLeftOpen,
	Sun,
	UserRound,
} from "lucide-react";
import {
	type ReactNode,
	type RefObject,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { Kbd } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useSignedIn } from "./auth-gate";
import { OperatorAvatar } from "./auth-screens";
import { BrandMark } from "./brand-mark";
import {
	isParent,
	isWithin,
	NAV,
	type NavLink,
	type NavParent,
	parentFor,
} from "./nav";
import { OPERATOR_ROLE } from "./operator";
import { useShortcutLabel } from "./shortcut";

/**
 * The sidebar (AVEL-DESIGN.md section 6, rulings 12 to 15 and 17). It sits on
 * bg beside the rounded canvas: 248px open, a 56px rail collapsed, and a
 * drawer below md, which renders this same body inside a Sheet.
 *
 * Geometry is identical open and collapsed. The brand mark, every row's icon
 * and the operator's avatar share one centre line, 28px from the left edge,
 * and rows always fill the nav's width. Collapsing therefore only narrows the
 * sidebar: rows narrow with it, labels fade out first, and nothing re-lays
 * out mid-animation. Spacing is on the 8px grid.
 */
export function SidebarBody({
	collapsed,
	onToggleCollapsed,
	onNavigate,
}: {
	collapsed: boolean;
	/** Absent in the drawer, which closes rather than collapses. */
	onToggleCollapsed?: () => void;
	/** The drawer closes itself when a link is followed. */
	onNavigate?: () => void;
}) {
	const pathname = useLocation({ select: (location) => location.pathname });
	const activeParent = parentFor(pathname)?.label;
	const [openParents, setOpenParents] = useState<ReadonlySet<string>>(
		() => new Set(activeParent ? [activeParent] : []),
	);

	// Arriving on a child page opens its parent. Closing it afterwards is the
	// operator's choice, and stays closed until the next arrival.
	useEffect(() => {
		if (!activeParent) return;
		setOpenParents((open) =>
			open.has(activeParent) ? open : new Set(open).add(activeParent),
		);
	}, [activeParent]);

	const toggle = (label: string) =>
		setOpenParents((open) => {
			const next = new Set(open);
			if (!next.delete(label)) next.add(label);
			return next;
		});

	const navRef = useRef<HTMLElement>(null);
	// What can move the current row: the page, an open parent, the rail.
	const indicator = useActiveIndicator(
		navRef,
		`${pathname}|${[...openParents].join(",")}|${collapsed}`,
	);

	return (
		<div data-testid="sidebar-body" className="flex h-full flex-col">
			<BrandRow collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />

			<nav
				aria-label="Main"
				data-testid="sidebar-nav"
				ref={navRef}
				data-indicator={indicator ? "ready" : undefined}
				// Scrolls, but draws no scrollbar: the rail is too narrow for one.
				// Relative: the sliding indicator is positioned inside it.
				className="group/nav no-scrollbar relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-4"
			>
				<SlidingIndicator box={indicator} />
				{NAV.map((group) => (
					<div key={group.label} className="flex flex-col">
						{/* Faded rather than removed on the rail, so the rows below
						    never move up when the sidebar collapses. */}
						<h2
							className={cn(
								"flex h-7 items-end px-3 pb-1.5 whitespace-nowrap type-eyebrow",
								fade(collapsed),
							)}
						>
							{group.label}
						</h2>
						<ul className="flex flex-col gap-0.5">
							{group.items.map((item) =>
								isParent(item) ? (
									<li key={item.label}>
										<Parent
											parent={item}
											collapsed={collapsed}
											open={openParents.has(item.label)}
											active={item.label === activeParent}
											onToggle={() => toggle(item.label)}
											onNavigate={onNavigate}
										/>
									</li>
								) : (
									<li key={item.to}>
										<NavRow
											link={item}
											collapsed={collapsed}
											onNavigate={onNavigate}
										/>
									</li>
								),
							)}
						</ul>
					</div>
				))}
			</nav>

			<OperatorMenu collapsed={collapsed} onNavigate={onNavigate} />
		</div>
	);
}

/** "All agents" → "all-agents", for data-testid. */
const slug = (label: string) => label.toLowerCase().replace(/\W+/g, "-");

/**
 * Text that disappears on the rail. Collapsing, it fades at once, before the
 * width moves; expanding, it waits for the width, then fades in.
 */
function fade(collapsed: boolean) {
	return cn(
		"transition-opacity duration-(--duration-micro) ease-avel",
		collapsed ? "opacity-0" : "opacity-100 delay-(--duration-state)",
	);
}

// One row for links and parents, v3 .nav-item: muted at rest, a raised fill
// and full-colour label and icon under the pointer. Rows keep 36px and 12px
// to the icon, not v3's 30 and 10, so every icon stays on the 28px centre
// line the brand mark and avatar share on the rail. The current row's label
// is full colour and its icon the accent, which marks selection; its chip and
// glow are the mark beneath it, so the row itself stays transparent over
// them. `isolate` keeps the in-row mark under the label. The focus ring is
// drawn inside, because the nav clips anything outside it.
const ROW =
	"relative isolate flex h-9 w-full items-center gap-2.5 overflow-hidden rounded-control px-3 whitespace-nowrap type-body text-text-muted transition-colors duration-(--duration-micro) ease-avel focus-inset hover:bg-app-raised hover:text-text [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-text-subtle [&>svg]:transition-colors [&>svg]:duration-(--duration-micro) [&>svg]:ease-avel hover:[&>svg]:text-text";
const CURRENT =
	"aria-[current=page]:text-text aria-[current=page]:hover:bg-transparent aria-[current=page]:[&>svg]:text-accent-text";

/**
 * The current row's chip (v3 .nav-item.on, R6): the chip surface above the
 * sidebar, a hairline edge and the button shadow. The edge is a border, not
 * a ring: shadow-btn and a ring both write box-shadow.
 */
const CHIP =
	"overflow-hidden rounded-control border border-border bg-chip shadow-btn";

/**
 * The current page's mark (rulings 12 and 50): the v3 chip, with an accent
 * glow on its right edge and no line. Two layers, each an ellipse anchored at
 * the edge that fades out in every direction, so the glow reads as light
 * coming from the edge rather than as a shape:
 *
 *   core  30% x 90%, at 60% (light) and 50% (dark): the visible light
 *   wash  85% x 140%, at 30% (light) and 25% (dark): the falloff across the row
 *
 * Light is stronger, because the accent on a pale chip reads fainter. Static:
 * it moves only because the current page changed.
 */
function ActiveMark() {
	return (
		<span
			aria-hidden="true"
			data-testid="nav-active-mark"
			// The server's and the first paint's mark. Once the sliding
			// indicator has measured this row, it draws the chip instead.
			// -z-10 inside the row's isolated stack: under the label.
			className={cn(
				CHIP,
				"pointer-events-none absolute inset-0 -z-10 group-data-[indicator=ready]/nav:opacity-0",
			)}
		>
			<Glow />
		</span>
	);
}

/** The glow's two layers: the accent mixed toward transparent, at the right edge. */
function Glow() {
	const layer = "absolute inset-0";
	return (
		<>
			<span
				data-testid="nav-active-wash"
				className={cn(
					layer,
					"bg-[radial-gradient(ellipse_85%_140%_at_100%_50%,color-mix(in_oklab,var(--color-accent)_30%,transparent),transparent)]",
					"in-[.dark]:bg-[radial-gradient(ellipse_85%_140%_at_100%_50%,color-mix(in_oklab,var(--color-accent)_25%,transparent),transparent)]",
				)}
			/>
			<span
				data-testid="nav-active-core"
				className={cn(
					layer,
					"bg-[radial-gradient(ellipse_30%_90%_at_100%_50%,color-mix(in_oklab,var(--color-accent)_60%,transparent),transparent)]",
					"in-[.dark]:bg-[radial-gradient(ellipse_30%_90%_at_100%_50%,color-mix(in_oklab,var(--color-accent)_50%,transparent),transparent)]",
				)}
			/>
		</>
	);
}

type IndicatorBox = {
	x: number;
	y: number;
	width: number;
	height: number;
	animate: boolean;
};

/**
 * Where the current page's row is inside the nav, measured in the browser:
 * the row holding the visible mark (a closed parent's, when its child is out
 * of sight). Re-measured when the page, the open parents or the rail change,
 * and whenever the nav's contents resize, so it follows a parent's rows as
 * they open. The first measure places it without moving; later ones slide.
 */
function useActiveIndicator(
	navRef: RefObject<HTMLElement | null>,
	moved: string,
): IndicatorBox | null {
	const [box, setBox] = useState<IndicatorBox | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `moved` is the trigger, not an input
	useEffect(() => {
		const nav = navRef.current;
		if (!nav) return;
		const measure = () => {
			const row = nav.querySelector<HTMLElement>(
				'[data-testid="nav-active-mark"]',
			)?.parentElement;
			if (!row) return setBox(null);
			const rowBox = row.getBoundingClientRect();
			const navBox = nav.getBoundingClientRect();
			// Left and width too: a nested row's chip starts at the guide line,
			// not at the nav's edge.
			setBox((previous) => ({
				x: rowBox.left - navBox.left,
				y: rowBox.top - navBox.top + nav.scrollTop,
				width: row.offsetWidth,
				height: row.offsetHeight,
				animate: previous !== null,
			}));
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(nav);
		for (const list of nav.querySelectorAll("ul")) observer.observe(list);
		return () => observer.disconnect();
	}, [navRef, moved]);
	return box;
}

/**
 * The current page's chip and glow as one element that slides to the new row
 * when the page changes, over the state duration, rather than vanishing from
 * one row and appearing on the next. Under reduced motion it moves without
 * travelling.
 */
function SlidingIndicator({ box }: { box: IndicatorBox | null }) {
	return (
		<span
			aria-hidden="true"
			data-testid="nav-indicator"
			data-animate={box?.animate || undefined}
			style={{
				transform: `translate(${box?.x ?? 0}px, ${box?.y ?? 0}px)`,
				width: box?.width ?? 0,
				height: box?.height ?? 0,
			}}
			className={cn(
				CHIP,
				"pointer-events-none absolute top-0 left-0",
				"data-animate:transition-[transform,width,height] data-animate:duration-(--duration-state) data-animate:ease-avel motion-reduce:transition-none",
				box ? "opacity-100" : "opacity-0",
			)}
		>
			<Glow />
		</span>
	);
}

function NavRow({
	link,
	collapsed,
	nested = false,
	onNavigate,
}: {
	link: NavLink;
	collapsed: boolean;
	nested?: boolean;
	onNavigate?: () => void;
}) {
	return (
		<Hint label={link.label} show={collapsed}>
			<Link
				to={link.to}
				onClick={onNavigate}
				activeOptions={{ exact: link.to === "/" }}
				data-testid={`nav-${slug(link.label)}`}
				aria-label={collapsed ? link.label : undefined}
				// 21px to the content (guide line at 20px, 1px wide) plus 17px puts a
				// nested label at 38px: under the parent's label, not its icon.
				className={cn(ROW, CURRENT, nested && "h-8 pr-3 pl-[17px] type-small")}
			>
				{({ isActive }) => (
					<>
						{/* Nested rows drop the icon: the guide line already says
						    which parent they belong to. */}
						{nested ? null : <link.icon aria-hidden="true" />}
						<span className={cn("min-w-0 truncate", fade(collapsed))}>
							{link.label}
						</span>
						{isActive ? <ActiveMark /> : null}
					</>
				)}
			</Link>
		</Hint>
	);
}

/**
 * A parent: a button that groups links but is not a page. Open, it shows and
 * hides its children, which hang off a quiet guide line under its icon and
 * expand with a grid-rows transition. On the rail its icon opens a menu of
 * its children to the right instead. A parent holding the current page
 * carries the mark whenever the current row is out of sight.
 */
function Parent({
	parent,
	collapsed,
	open,
	active,
	onToggle,
	onNavigate,
}: {
	parent: NavParent;
	collapsed: boolean;
	open: boolean;
	active: boolean;
	onToggle: () => void;
	onNavigate?: () => void;
}) {
	const listId = useId();
	const expanded = open && !collapsed;
	const testId = `nav-${slug(parent.label)}`;
	const rowClass = cn(
		ROW,
		active && "text-text [&>svg]:text-accent-text",
		active && !expanded && "hover:bg-transparent",
	);
	const face = (
		<>
			<parent.icon aria-hidden="true" />
			<span
				className={cn("min-w-0 flex-1 truncate text-left", fade(collapsed))}
			>
				{parent.label}
			</span>
			<ChevronRight
				aria-hidden="true"
				className={cn(
					"size-3.5! text-text-subtle transition-[rotate,opacity] duration-(--duration-state) ease-avel",
					expanded && "rotate-90",
					collapsed && "opacity-0",
				)}
			/>
			{active && !expanded ? <ActiveMark /> : null}
		</>
	);

	return (
		<>
			{collapsed ? (
				<RailMenu parent={parent} onNavigate={onNavigate}>
					<button
						type="button"
						aria-label={parent.label}
						data-testid={testId}
						className={rowClass}
					>
						{face}
					</button>
				</RailMenu>
			) : (
				<button
					type="button"
					aria-expanded={open}
					aria-controls={listId}
					onClick={onToggle}
					data-testid={testId}
					className={rowClass}
				>
					{face}
				</button>
			)}
			<div
				data-testid={`${testId}-children`}
				data-expanded={expanded || undefined}
				className={cn(
					"grid transition-[grid-template-rows] duration-(--duration-state) ease-avel",
					expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
				)}
			>
				{/* Closed children are inert: out of the tab order and hidden
				    from assistive technology, while the height animates. */}
				<div className="min-h-0 overflow-hidden" inert={!expanded}>
					{/* The guide line: a 1px rule under the parent's icon. */}
					<ul
						id={listId}
						data-testid={`${testId}-ruler`}
						className="mt-0.5 ml-5 flex flex-col gap-0.5 border-l border-border-strong"
					>
						{parent.children.map((link) => (
							<li key={link.to}>
								<NavRow
									link={link}
									collapsed={false}
									nested
									onNavigate={onNavigate}
								/>
							</li>
						))}
					</ul>
				</div>
			</div>
		</>
	);
}

/** On the rail, a parent's children as a menu to its right. */
function RailMenu({
	parent,
	onNavigate,
	children,
}: {
	parent: NavParent;
	onNavigate?: () => void;
	children: ReactNode;
}) {
	const pathname = useLocation({ select: (location) => location.pathname });
	return (
		<DropdownMenu>
			<Hint label={parent.label} show>
				<DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
			</Hint>
			<DropdownMenuContent
				side="right"
				align="start"
				sideOffset={8}
				className="min-w-48"
				data-testid={`nav-${slug(parent.label)}-menu`}
			>
				<DropdownMenuLabel className="type-caption text-text-subtle">
					{parent.label}
				</DropdownMenuLabel>
				{parent.children.map((link) => (
					<DropdownMenuItem key={link.to} asChild>
						<Link
							to={link.to}
							onClick={onNavigate}
							data-testid={`nav-${slug(link.label)}`}
							className={cn(isWithin(pathname, link.to) && "text-text")}
						>
							<link.icon aria-hidden="true" />
							{link.label}
						</Link>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * The mark, the wordmark and the product (ruling 14). The row is exactly the
 * top bar's height and starts one canvas inset down, so the mark and the
 * page title share a line across the seam. The collapse control is at the
 * top: right-aligned when open, under the mark on the rail.
 */
function BrandRow({
	collapsed,
	onToggleCollapsed,
}: {
	collapsed: boolean;
	onToggleCollapsed?: () => void;
}) {
	const shortcut = useShortcutLabel("b");
	const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
	return (
		<div
			data-testid="brand"
			className={cn(
				"relative shrink-0 transition-[height] duration-(--duration-state) ease-avel md:mt-(--canvas-inset)",
				// On the rail the control sits under the mark, one 40px step down.
				collapsed && onToggleCollapsed
					? "h-[calc(var(--topbar-height)+2.5rem)]"
					: "h-(--topbar-height)",
			)}
		>
			<div className="flex h-(--topbar-height) items-center gap-2.5 px-3 whitespace-nowrap">
				<BrandMark />
				<span className={cn("flex min-w-0 flex-col", fade(collapsed))}>
					<span className="type-page text-text">avel</span>
					<span className="type-caption text-text-subtle">Command Center</span>
				</span>
			</div>
			{onToggleCollapsed ? (
				<Hint label={label} keys={shortcut} show>
					<Button
						variant="ghost"
						size="icon-sm"
						data-testid="sidebar-collapse"
						aria-label={label}
						aria-expanded={!collapsed}
						aria-keyshortcuts="Meta+B Control+B"
						onClick={onToggleCollapsed}
						className={cn(
							"absolute text-text-subtle hover:text-text",
							collapsed ? "top-(--topbar-height) left-3" : "top-3 right-3",
						)}
					>
						{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
					</Button>
				</Hint>
			) : null}
		</div>
	);
}

/**
 * Who is signed in, and the way to their account (ruling 15), as a v3 card
 * that answers like a .row-link: raised, with the strong edge, on hover. The
 * avatar has a hairline ring.
 * Name and avatar are the session's GitHub identity; the role is a constant
 * (src/shell/operator.ts). The account page is reached by navigating from a
 * menu item, not by a second link: two links to one page would put two
 * aria-current="page" elements on it. Sign out ends the session, clears
 * everything fetched, and the sign-in gate takes over.
 */
function OperatorMenu({
	collapsed,
	onNavigate,
}: {
	collapsed: boolean;
	onNavigate?: () => void;
}) {
	const navigate = useNavigate();
	const { user, signOut } = useSignedIn();
	// The theme lives here and in the command menu now that the top bar no
	// longer carries a theme button.
	const { theme, setTheme } = useTheme();
	const nextTheme = theme === "dark" ? "light" : "dark";
	const [signingOut, setSigningOut] = useState(false);
	const name = user.name || user.githubLogin;
	return (
		<div className="shrink-0 border-t border-border p-2">
			<DropdownMenu>
				<Hint label={`${name}, ${OPERATOR_ROLE}`} show={collapsed}>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							data-testid="operator-menu"
							aria-label={`${name}, ${OPERATOR_ROLE}. Account menu`}
							className="flex h-12 w-full items-center gap-2.5 overflow-hidden rounded-card border border-border bg-app-panel shadow-card pr-2 pl-[3px] text-left whitespace-nowrap transition-colors duration-(--duration-micro) ease-avel focus-inset hover:border-border-strong hover:bg-app-raised data-[state=open]:bg-app-raised"
						>
							<OperatorAvatar
								user={user}
								className="size-8 ring-1 ring-border-strong"
							/>
							<span
								className={cn("flex min-w-0 flex-1 flex-col", fade(collapsed))}
							>
								<span
									data-testid="operator-name"
									className="truncate type-body font-medium text-text"
								>
									{name}
								</span>
								<span
									data-testid="operator-role"
									className="truncate type-caption text-text-subtle"
								>
									{OPERATOR_ROLE}
								</span>
							</span>
							<ChevronsUpDown
								aria-hidden="true"
								className={cn(
									"size-4 shrink-0 text-text-subtle",
									fade(collapsed),
								)}
							/>
						</button>
					</DropdownMenuTrigger>
				</Hint>
				<DropdownMenuContent
					side={collapsed ? "right" : "top"}
					align={collapsed ? "end" : "start"}
					sideOffset={8}
					className="min-w-56"
					data-testid="operator-menu-content"
				>
					<DropdownMenuLabel className="flex flex-col font-normal">
						<span className="type-body text-text">{name}</span>
						<span className="type-mono text-text-subtle">
							@{user.githubLogin}
						</span>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						data-testid="operator-account"
						onSelect={() => {
							onNavigate?.();
							navigate({ to: "/settings/account" });
						}}
					>
						<UserRound aria-hidden="true" />
						Account settings
					</DropdownMenuItem>
					<DropdownMenuItem
						data-testid="operator-theme"
						onSelect={() => setTheme(nextTheme)}
					>
						{theme === "dark" ? (
							<Sun aria-hidden="true" />
						) : (
							<Moon aria-hidden="true" />
						)}
						Switch to {nextTheme} theme
					</DropdownMenuItem>
					<DropdownMenuItem
						data-testid="operator-sign-out"
						disabled={signingOut}
						onSelect={(event) => {
							// Keep the menu open, showing progress, until the gate takes over.
							event.preventDefault();
							setSigningOut(true);
							signOut().catch(() => setSigningOut(false));
						}}
					>
						<LogOut aria-hidden="true" />
						{signingOut ? "Signing out" : "Sign out"}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

/**
 * A tooltip to the right. Shown only when the label is not already visible,
 * which is the rail, except for controls with no visible label at all. A
 * shortcut, when given, is named beside the label. The delay is the
 * provider's, never set per tooltip.
 */
function Hint({
	label,
	keys,
	show,
	children,
}: {
	label: string;
	keys?: string;
	show: boolean;
	children: ReactNode;
}) {
	if (!show) return children;
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent side="right" className="flex items-center gap-2">
				{label}
				{keys ? <Kbd>{keys}</Kbd> : null}
			</TooltipContent>
		</Tooltip>
	);
}
