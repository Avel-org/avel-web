import { Link } from "@tanstack/react-router";
import {
	type AgentTemplate,
	ROLES,
	type Role,
	type SkillStatus,
	WAVES,
	type Wave,
} from "avel-server/contract";
import { ArrowLeft, Check, Copy } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiError } from "@/lib/api/errors";
import { useCopy } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { SampleData } from "./sample-data";
import { StatusPill, type StatusTone } from "./status-pill";
import type { SurfaceQuery } from "./surface";

/*
 * Pieces shared by the three catalog pages (AVEL-DESIGN.md rulings 29 and
 * 32). The lists are live; a SampleRegion marks what still has no route.
 */

/**
 * One sample region: a dashed frame, the "Sample data" pill naming the route
 * it waits for, then the real layout with sample values inside. Every sample
 * on a catalog page sits in one of these, so the pill and the frame cannot
 * be left off. `title` and `what` describe the region in words, for the day
 * it shows real data or falls back to <Surface notBuilt>.
 */
export function SampleRegion({
	missing,
	title,
	what,
	children,
	className,
	"data-testid": testId,
}: {
	/**
	 * The route the region waits for, as its page's placeholder module names
	 * it (CATALOG_MISSING, AGENT_MISSING). Tests check each page's own set.
	 */
	missing: string;
	title: string;
	what: string;
	children: ReactNode;
	className?: string;
	"data-testid": string;
}) {
	return (
		<section
			aria-label={`${title}, sample data`}
			data-testid={testId}
			data-sample-region={missing}
			data-what={what}
			className={cn(
				"flex min-w-0 flex-col gap-2 rounded-sm border border-dashed border-border p-2",
				className,
			)}
		>
			<SampleData missing={missing} />
			{children}
		</section>
	);
}

/**
 * A hash: the first twelve characters in mono, the full value on hover and
 * to screen readers, and a copy button that copies the full value
 * (AVEL-DESIGN.md section 12).
 */
export function SampleHash({
	value,
	label,
	"data-testid": testId,
}: {
	value: string;
	/** What the hash is of, for the copy button's name. */
	label: string;
	"data-testid": string;
}) {
	const { status, copy } = useCopy();
	return (
		<span data-testid={testId} className="inline-flex items-center gap-1">
			<code
				title={value}
				data-full={value}
				className="type-mono-small text-text-muted"
			>
				{/* Not selectable, so a hand copy takes only the full value. */}
				<span aria-hidden="true" className="select-none">
					{value.slice(0, 12)}
				</span>
				<span className="sr-only">{value}</span>
			</code>
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label={`Copy ${label}`}
				data-testid={`${testId}-copy`}
				onClick={() => copy(value)}
			>
				{status === "Copied" ? (
					<Check aria-hidden="true" />
				) : (
					<Copy aria-hidden="true" />
				)}
			</Button>
			{/* Says whether the copy worked: the clipboard can refuse. */}
			<span
				aria-live="polite"
				data-testid={`${testId}-copy-status`}
				className="sr-only"
			>
				{status}
			</span>
		</span>
	);
}

/** Keyed on the contract's status union, so a new status fails the build. */
const SKILL_STATUS = {
	draft: { tone: "pending", label: "Draft" },
	approved: { tone: "pass", label: "Approved" },
	retired: { tone: "stale", label: "Retired" },
} as const satisfies Record<SkillStatus, { tone: StatusTone; label: string }>;

export function SkillStatusPill({
	status,
	"data-testid": testId,
}: {
	status: SkillStatus;
	"data-testid"?: string;
}) {
	const { tone, label } = SKILL_STATUS[status];
	return (
		<StatusPill size="sm" tone={tone} label={label} data-testid={testId} />
	);
}

/**
 * Text that wraps inside a DataTable cell or header, which the Table
 * primitive sets nowrap. For prose columns, so a table fits its pane.
 */
export function Wrap({ children }: { children: ReactNode }) {
	return <span className="whitespace-normal">{children}</span>;
}

/**
 * Back to a catalog list, for widths where a selection replaces the list
 * (below lg). The outline back button the mission and client pages use.
 */
export function CatalogBack({
	to,
	label,
	"data-testid": testId,
}: {
	to: "/catalog/agents" | "/catalog/skills";
	label: string;
	"data-testid": string;
}) {
	return (
		<Button
			variant="outline"
			size="sm"
			className="self-start lg:hidden"
			asChild
		>
			<Link to={to} data-testid={testId}>
				<ArrowLeft aria-hidden="true" />
				{label}
			</Link>
		</Button>
	);
}

/** A role, as machine text. */
export function RoleTag({ role }: { role: string }) {
	return (
		<Badge variant="tag" data-testid="catalog-role">
			{role}
		</Badge>
	);
}

const LINK =
	"rounded-xs text-accent-text underline-offset-4 transition-colors duration-(--duration-micro) ease-avel hover:underline";

/** A link to an agent's page. */
export function AgentLink({ agent }: { agent: AgentTemplate }) {
	return (
		<Link
			to="/catalog/agents/$slug"
			params={{ slug: agent.slug }}
			data-testid={`catalog-agent-link-${agent.slug}`}
			className={cn("type-small", LINK)}
		>
			{agent.name}
		</Link>
	);
}

/** A label and its value, in a definition list. */
export function CatalogField({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="flex min-w-0 flex-col gap-0.5">
			<dt className="type-caption text-text-subtle">{label}</dt>
			<dd className="type-small min-w-0 text-foreground">{children}</dd>
		</div>
	);
}

/**
 * A list's query, as <Surface> reads it. The catalog pages pass their live
 * queries; the Drive (drive.tsx, ruling 33) still passes its samples through
 * sampleQuery until its routes exist.
 */
export type CatalogQuery<T> = SurfaceQuery<readonly T[], ApiError>;

export function sampleQuery<T>(data: readonly T[]): CatalogQuery<T> {
	return { status: "success", data };
}

/**
 * How much of a paged list is loaded, and a way to load the rest, as the
 * Clients list does it. Nothing renders when the server gave no total and
 * there is no next page: there is nothing to say.
 */
export function CatalogListFooter({
	loaded,
	total,
	hasMore,
	loadingMore,
	onLoadMore,
	"data-testid": testId,
}: {
	loaded: number;
	total: number | undefined;
	hasMore: boolean;
	loadingMore: boolean;
	onLoadMore: () => void;
	"data-testid": string;
}) {
	if (total === undefined && !hasMore) return null;
	return (
		<div
			data-testid={testId}
			className="flex items-center justify-between gap-2 px-3"
		>
			{total === undefined ? (
				<span />
			) : (
				<p
					data-testid={`${testId}-showing`}
					className="type-caption text-text-subtle tabular-nums"
				>
					{`Showing ${loaded} of ${total}`}
				</p>
			)}
			{hasMore ? (
				<Button
					variant="ghost"
					size="sm"
					data-testid={`${testId}-load-more`}
					disabled={loadingMore}
					onClick={onLoadMore}
				>
					{loadingMore ? "Loading" : "Load more"}
				</Button>
			) : null}
		</div>
	);
}

/** Roles in the contract's catalog order (ROLES.md), never the data's. */
export function inCatalogOrder(roles: readonly Role[]): Role[] {
	return [...roles].sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b));
}

/** Waves in the contract's order, A to E. */
export function inWaveOrder(waves: readonly Wave[]): Wave[] {
	return [...waves].sort((a, b) => WAVES.indexOf(a) - WAVES.indexOf(b));
}

/** Rows in a list's real shape, while it loads: a title line and a meta line. */
export function CatalogListSkeleton({
	"data-testid": testId,
}: {
	"data-testid": string;
}) {
	return (
		<div data-testid={testId} className="flex flex-col gap-0.5">
			{[0, 1, 2].map((i) => (
				<div key={i} className="flex flex-col gap-1.5 px-3 py-2">
					<span className="flex items-center gap-2">
						<Skeleton className="h-4 flex-1" />
						<Skeleton className="h-5 w-14 rounded-full" />
					</span>
					<Skeleton className="h-3 w-36" />
				</div>
			))}
		</div>
	);
}
