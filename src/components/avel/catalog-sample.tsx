import { Link } from "@tanstack/react-router";
import {
	type AgentTemplate,
	ROLES,
	type Role,
	type SkillListItem,
	type SkillStatus,
	WAVES,
	type Wave,
} from "avel-server/contract";
import { Copy } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { CatalogMissing } from "./catalog-placeholders";
import { SampleData } from "./sample-data";
import { StatusPill, type StatusTone } from "./status-pill";
import type { SurfaceQuery } from "./surface";

/*
 * Pieces shared by the three catalog pages (AVEL-DESIGN.md rulings 29 and
 * 32). Every value they show comes from catalog-placeholders.ts.
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
	missing: CatalogMissing;
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
	return (
		<span data-testid={testId} className="inline-flex items-center gap-1">
			<code
				title={value}
				data-full={value}
				className="type-mono-small text-text-muted"
			>
				<span aria-hidden="true">{value.slice(0, 12)}</span>
				<span className="sr-only">{value}</span>
			</code>
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label={`Copy ${label}`}
				data-testid={`${testId}-copy`}
				onClick={() => navigator.clipboard?.writeText(value)}
			>
				<Copy aria-hidden="true" />
			</Button>
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

/** A role, as machine text. */
export function RoleTag({ role }: { role: string }) {
	return (
		<Badge variant="tag" data-testid="catalog-role">
			{role}
		</Badge>
	);
}

/** A skill's layer and type, as two tags. */
export function SkillKind({ skill }: { skill: SkillListItem }) {
	return (
		<span data-testid="catalog-skill-kind" className="inline-flex gap-1">
			<Badge variant="tag">{skill.layer}</Badge>
			<Badge variant="tag">{skill.type}</Badge>
		</span>
	);
}

const LINK =
	"rounded-xs text-accent-text underline-offset-4 transition-colors duration-(--duration-micro) ease-avel hover:underline";

/** A link to a skill on /catalog/skills. */
export function SkillLink({ skill }: { skill: SkillListItem }) {
	return (
		<Link
			to="/catalog/skills"
			search={{ skill: skill.slug }}
			data-testid={`catalog-skill-link-${skill.slug}`}
			className={cn("type-small", LINK)}
		>
			{skill.name}
		</Link>
	);
}

/** A link to an agent on /catalog/agents. */
export function AgentLink({ agent }: { agent: AgentTemplate }) {
	return (
		<Link
			to="/catalog/agents"
			search={{ agent: agent.slug }}
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
 * A list's query. Today it is always the samples, already loaded; when a
 * route is mounted the page passes the real query instead, and the list's
 * loading, empty and error states, already built, take over.
 */
export type CatalogQuery<T> = SurfaceQuery<readonly T[], ApiError>;

export function sampleQuery<T>(data: readonly T[]): CatalogQuery<T> {
	return { status: "success", data };
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
