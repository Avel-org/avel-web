import { ChevronRight } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useStoredState } from "@/lib/stored";
import { cn } from "@/lib/utils";
import { StatusGlyph, type StatusTone } from "./status-pill";

/** What a panel's header glyph says about the rows inside it. */
export type DataPanelTone = "neutral" | "warn" | "pending" | "block" | "pass";

const OPEN_STATES = ["open", "closed"] as const;
// useStoredState needs a key even when the panel remembers nothing. It reads
// this one harmlessly and is never asked to write it.
const NO_KEY = "avel.data-panel.unkeyed";

/**
 * A titled, collapsible panel for a group of rows, such as missions grouped by
 * state. The header is one full-width button (chevron, glyph, title, count);
 * the actions sit beside it, outside the button, so they stay their own tab
 * stops. The body collapses by animating its grid row from 1fr to 0fr, and is
 * inert while closed, so nothing hidden can take focus.
 *
 * `count` is a number the caller knows; leave it undefined when the total is
 * not known, and the badge says "—" rather than inventing a zero.
 *
 * `storageKey` remembers the open state per viewer (src/lib/stored.ts). The
 * server always renders `defaultOpen`; a remembered state applies after mount.
 *
 * It is a v3 card. The header sits on the band surface, as a table header
 * does, so the rows below read as its body.
 *
 * It clips with overflow-clip, not overflow-hidden: hidden makes a scroll
 * container, which would pin a DataTable's sticky header inside the panel
 * instead of under the page's top bar.
 *
 * One anatomy for every panel: a 48px header (title, count, actions at its
 * end), the body, and an optional `footer` band (bg-app-band, a hairline
 * above) for the region's read age on the left and its "All …" link on the
 * right. `toolbar` is the header's second row: the controls for the panel's
 * list (search, filters, view, sort), wrapping as the width needs.
 */
export function DataPanel({
	title,
	count,
	tone = "neutral",
	actions,
	toolbar,
	footer,
	defaultOpen = true,
	storageKey,
	hideCount = false,
	className,
	children,
	"data-testid": testId,
}: {
	title: string;
	count?: number;
	/** A panel that counts nothing (a page's section) shows no badge. */
	hideCount?: boolean;
	/** Layout only (a grid span); the panel's look is its own. */
	className?: string;
	tone?: DataPanelTone;
	actions?: ReactNode;
	/** The list's controls: the header's second row, wrapping as needed. */
	toolbar?: ReactNode;
	/** A band under the body: read age on the left, an "All …" link on the right. */
	footer?: ReactNode;
	defaultOpen?: boolean;
	storageKey?: string;
	children: ReactNode;
	"data-testid": string;
}) {
	const bodyId = useId();
	const titleId = useId();
	const [stored, setStored] = useStoredState(
		storageKey ?? NO_KEY,
		defaultOpen ? "open" : "closed",
		OPEN_STATES,
	);
	const [local, setLocal] = useState(defaultOpen);
	const open = storageKey ? stored === "open" : local;
	const toggle = () => {
		if (storageKey) setStored(open ? "closed" : "open");
		else setLocal(!open);
	};

	return (
		<section
			data-testid={testId}
			data-state={open ? "open" : "closed"}
			aria-labelledby={titleId}
			className={cn(
				"overflow-clip rounded-card border border-border bg-app-panel shadow-card",
				className,
			)}
		>
			<header
				data-testid={`${testId}-header`}
				className={cn(
					// Wraps: on a phone the actions drop under the title, in one row
					// at its end, rather than squeezing it (v3 UX 7).
					"flex flex-wrap items-center gap-x-2 border-b bg-app-band pr-2 transition-[border-color] duration-(--duration-state) ease-avel",
					open ? "border-border" : "border-transparent",
				)}
			>
				<button
					type="button"
					data-testid={`${testId}-toggle`}
					// A count that changes is a new badge (keyed by its number)
					// and fades in (motion.ts).
					data-enter="fade"
					aria-expanded={open}
					aria-controls={bodyId}
					onClick={toggle}
					className="focus-inset flex h-12 min-w-[min(100%,12rem)] flex-1 items-center gap-2 px-3 text-left transition-colors duration-(--duration-micro) ease-avel hover:bg-app-raised"
				>
					<ChevronRight
						aria-hidden="true"
						className={cn(
							"size-4 shrink-0 text-text-muted transition-transform duration-(--duration-state) ease-avel",
							open && "rotate-90",
						)}
					/>
					{tone === "neutral" ? null : <PanelGlyph tone={tone} />}
					<h2 id={titleId} className="type-title truncate text-text">
						{title}
					</h2>
					{hideCount ? null : (
						<Badge
							key={count ?? "unknown"}
							variant="count"
							data-testid={`${testId}-count`}
						>
							{count === undefined ? "—" : count}
						</Badge>
					)}
				</button>
				{/* Actions before the toolbar: they end the title's row (section
				    10), and the toolbar's full-width row falls beneath both. */}
				{actions ? (
					<div
						data-testid={`${testId}-actions`}
						className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1 max-sm:pb-2 max-sm:pl-3"
					>
						{actions}
					</div>
				) : null}
				{toolbar ? (
					<div
						data-testid={`${testId}-toolbar`}
						className="flex min-w-0 basis-full flex-wrap items-center gap-2 px-3 pb-3"
					>
						{toolbar}
					</div>
				) : null}
			</header>
			<div
				id={bodyId}
				data-testid={`${testId}-body`}
				inert={!open}
				className={cn(
					"grid grid-cols-[minmax(0,1fr)] transition-[grid-template-rows] duration-(--duration-state) ease-avel",
					open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
				)}
			>
				{/* min-w-0: clip, unlike hidden, leaves a grid item's minimum
				    width at its content's, so one long line would widen the
				    panel past its column. */}
				{/* What replaces the body's content (loaded data for its
				    skeleton, Table for Board) fades in (motion.ts). */}
				<div data-enter="fade" className="min-h-0 min-w-0 overflow-clip">
					{children}
					{footer ? (
						<div
							data-testid={`${testId}-footer`}
							className="flex items-center justify-between gap-2 border-t border-border bg-app-band px-4 py-2"
						>
							{footer}
						</div>
					) : null}
				</div>
			</div>
		</section>
	);
}

// Panel tones are the status tones less "stale", which no group of rows is.
const PANEL_TONE: Record<Exclude<DataPanelTone, "neutral">, StatusTone> = {
	warn: "warn",
	pending: "pending",
	block: "block",
	pass: "pass",
};

function PanelGlyph({ tone }: { tone: Exclude<DataPanelTone, "neutral"> }) {
	const colour = {
		warn: "text-gate-warn",
		pending: "text-gate-pending",
		block: "text-gate-block",
		pass: "text-gate-pass",
	}[tone];
	return (
		<span data-testid="data-panel-glyph" data-tone={tone} className={colour}>
			<StatusGlyph tone={PANEL_TONE[tone]} />
		</span>
	);
}
