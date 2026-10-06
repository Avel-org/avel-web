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
 * It clips with overflow-clip, not overflow-hidden: hidden makes a scroll
 * container, which would pin a DataTable's sticky header inside the panel
 * instead of under the page's top bar.
 */
export function DataPanel({
	title,
	count,
	tone = "neutral",
	actions,
	defaultOpen = true,
	storageKey,
	children,
	"data-testid": testId,
}: {
	title: string;
	count?: number;
	tone?: DataPanelTone;
	actions?: ReactNode;
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
			className="surface-steel overflow-clip rounded-md border border-border bg-card"
		>
			<header
				data-testid={`${testId}-header`}
				className={cn(
					"flex items-center gap-2 bg-app-band pr-2 transition-colors duration-(--duration-state) ease-avel",
					open ? "border-b border-border" : "border-b border-transparent",
				)}
			>
				<button
					type="button"
					data-testid={`${testId}-toggle`}
					aria-expanded={open}
					aria-controls={bodyId}
					onClick={toggle}
					className="focus-inset flex h-10 min-w-0 flex-1 items-center gap-2 px-3 text-left transition-colors duration-(--duration-micro) ease-avel hover:bg-state-hover"
				>
					<ChevronRight
						aria-hidden="true"
						className={cn(
							"size-4 shrink-0 text-text-muted transition-transform duration-(--duration-state) ease-avel",
							open && "rotate-90",
						)}
					/>
					{tone === "neutral" ? null : <PanelGlyph tone={tone} />}
					<h2
						id={titleId}
						className="type-panel-title truncate text-foreground"
					>
						{title}
					</h2>
					<Badge
						variant="tag"
						data-testid={`${testId}-count`}
						className="type-mono-small"
					>
						{count === undefined ? "—" : count}
					</Badge>
				</button>
				{actions ? (
					<div
						data-testid={`${testId}-actions`}
						className="flex shrink-0 items-center gap-1"
					>
						{actions}
					</div>
				) : null}
			</header>
			<div
				id={bodyId}
				data-testid={`${testId}-body`}
				inert={!open}
				className={cn(
					"grid transition-[grid-template-rows] duration-(--duration-state) ease-avel",
					open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
				)}
			>
				<div className="min-h-0 overflow-clip">{children}</div>
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
