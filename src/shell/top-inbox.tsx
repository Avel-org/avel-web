import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { MissionListItem } from "avel-server/contract";
import { Inbox as InboxIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
	type MissionList,
	missionListQuery,
	NEEDS_YOU_COPY,
	rowsOf,
} from "@/components/avel/mission-data";
import {
	ORIGIN_LABEL,
	ORIGINS,
	type Origin,
} from "@/components/avel/mission-search";
import {
	ProposalsSection,
	proposalCountLabel,
} from "@/components/avel/proposal-inbox";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useApiClient } from "@/lib/api";
import { usePendingProposals } from "@/lib/api/proposals";
import { missionLabel } from "./command-search";

/** At most this many missions per origin in the popover. */
export const INBOX_PER_ORIGIN = 5;

/**
 * The missions that need the operator, for one origin: the Missions page's
 * own list with the server's needsYou filter, so its count is
 * meta.counts.needsYou and its rows are the newest ones waiting.
 */
export function inboxParams(origin: Origin) {
	return {
		origin,
		q: "",
		sort: "lastActivity" as const,
		includeArchived: false,
		needsYou: true,
	};
}

/** What one origin's needs-you query says, or undefined while unknown. */
export type InboxOrigin = {
	count: number;
	missions: MissionListItem[];
};

export function inboxOf(list: MissionList): InboxOrigin | undefined {
	if (list.status !== "success") return undefined;
	const first = list.data.pages[0];
	if (!first) return undefined;
	return {
		count: first.meta.counts.needsYou,
		missions: rowsOf(list).slice(0, INBOX_PER_ORIGIN),
	};
}

/**
 * The inbox's name, with the split always in it. Client and internal
 * missions are never counted as one figure without saying which is which
 * (DATA-CONTRACTS-V2.md, Mission), so the total only ever appears with its
 * parts; pending proposals are a part of their own. Undefined parts are
 * still loading or failed, and are left out.
 */
export function inboxLabel(
	counts: Partial<Record<Origin, number>>,
	proposals?: number,
): string {
	const known = ORIGINS.filter((o) => counts[o] !== undefined);
	if (known.length === 0 && proposals === undefined) return "Inbox";
	const total =
		known.reduce((sum, o) => sum + (counts[o] ?? 0), 0) + (proposals ?? 0);
	if (total === 0) return "Inbox, nothing needs you";
	const parts = [
		...known.map((o) => `${counts[o]} ${ORIGIN_LABEL[o].toLowerCase()}`),
		...(proposals === undefined ? [] : [proposalCountLabel(proposals)]),
	].join(", ");
	return `Inbox, ${total} ${total === 1 ? "item needs" : "items need"} you (${parts})`;
}

export function Inbox() {
	const api = useApiClient();
	const client = useInfiniteQuery(missionListQuery(api, inboxParams("client")));
	const internal = useInfiniteQuery(
		missionListQuery(api, inboxParams("internal")),
	);
	const byOrigin: Record<Origin, MissionList> = { client, internal };
	const inbox: Partial<Record<Origin, InboxOrigin>> = {
		client: inboxOf(client),
		internal: inboxOf(internal),
	};
	const counts: Partial<Record<Origin, number>> = {
		client: inbox.client?.count,
		internal: inbox.internal?.count,
	};
	const proposals = usePendingProposals();
	const proposalCount = proposals.data?.meta.total;
	const label = inboxLabel(counts, proposalCount);
	const total =
		(counts.client ?? 0) + (counts.internal ?? 0) + (proposalCount ?? 0);

	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							aria-label={label}
							data-testid="global-inbox"
							className="relative"
						>
							<InboxIcon aria-hidden="true" />
							<InboxBadge total={total} />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent sideOffset={6}>{label}</TooltipContent>
			</Tooltip>
			<PopoverContent
				align="end"
				className="w-[min(24rem,calc(100vw-1rem))] p-0"
				data-testid="global-inbox-panel"
			>
				<InboxPanel
					sections={ORIGINS.map((origin) => ({
						origin,
						inbox: inbox[origin],
						failed: byOrigin[origin].status === "error",
					}))}
					proposals={{
						count: proposalCount,
						node: (
							<ProposalsSection
								proposals={proposals.data?.data}
								count={proposalCount}
								failed={proposals.status === "error"}
							/>
						),
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}

/** The count on the icon. Gone at zero: an empty inbox shows no number. */
export function InboxBadge({ total }: { total: number }) {
	if (total === 0) return null;
	return (
		<span
			aria-hidden="true"
			data-testid="global-inbox-badge"
			// The ring is the top bar's own surface: it cuts the badge out of the
			// glyph it sits on, so neither reads as clipped.
			className="type-mono absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-gate-warn-line bg-gate-warn-soft px-1 text-gate-warn ring-2 ring-app-page"
		>
			{total > 99 ? "99+" : total}
		</span>
	);
}

/**
 * The popover: pending proposals, then one labelled section per origin,
 * never mixed. Proposals show only while some are waiting.
 */
export function InboxPanel({
	sections,
	proposals,
}: {
	sections: { origin: Origin; inbox?: InboxOrigin; failed: boolean }[];
	proposals?: { count: number | undefined; node: ReactNode };
}) {
	const waiting = (proposals?.count ?? 0) > 0;
	const nothing = sections.every((s) => s.inbox?.count === 0) && !waiting;
	return (
		<div className="flex flex-col">
			<p className="type-title border-b border-border px-3 py-2 text-foreground">
				Needs you
			</p>
			{nothing ? (
				<p
					data-testid="global-inbox-empty"
					className="type-small px-3 py-6 text-center text-text-muted"
				>
					Nothing needs you.
				</p>
			) : (
				<>
					{waiting ? proposals?.node : null}
					{sections.map((section) => (
						<InboxSection key={section.origin} {...section} />
					))}
				</>
			)}
			<div className="border-t border-border px-3 py-2">
				<Button variant="link" size="sm" className="h-auto px-0" asChild>
					<Link
						to="/missions"
						search={{ status: "needs-you" }}
						data-testid="global-inbox-open"
					>
						Open Needs you
					</Link>
				</Button>
			</div>
		</div>
	);
}

function InboxSection({
	origin,
	inbox,
	failed,
}: {
	origin: Origin;
	inbox?: InboxOrigin;
	failed: boolean;
}) {
	const testid = `global-inbox-${origin}`;
	return (
		<section
			aria-label={`${ORIGIN_LABEL[origin]} missions`}
			data-testid={testid}
			className="border-b border-border px-3 py-2 last-of-type:border-b-0"
		>
			<p className="type-caption mb-1 flex justify-between text-text-subtle">
				<span>{ORIGIN_LABEL[origin]} missions</span>
				{inbox ? (
					<span data-testid={`${testid}-count`} className="type-mono">
						{inbox.count}
					</span>
				) : null}
			</p>
			{failed ? (
				<p
					data-testid={`${testid}-error`}
					className="type-small text-text-subtle"
				>
					Could not load these.
				</p>
			) : !inbox ? (
				<p
					data-testid={`${testid}-loading`}
					className="type-small text-text-subtle"
				>
					Loading
				</p>
			) : inbox.missions.length === 0 ? (
				<p
					data-testid={`${testid}-none`}
					className="type-small text-text-subtle"
				>
					None.
				</p>
			) : (
				<ul className="flex flex-col">
					{inbox.missions.map((mission) => (
						<li key={mission.id}>
							{/* A mission that needs you opens its full page, where it is
							    acted on (audit F6); list rows open the panel. */}
							<Link
								to="/missions/$id"
								params={{ id: mission.id }}
								data-testid={`global-inbox-mission-${mission.id}`}
								// The reason under the name, as the Needs you panel shows it:
								// side by side, the reason took the room the name needs.
								className="flex flex-col gap-0.5 rounded-control px-1 py-1.5 hover:bg-app-raised"
							>
								<span className="type-small min-w-0 truncate text-foreground">
									{missionLabel(mission)}
								</span>
								<span className="type-caption text-gate-warn">
									{mission.needsYou
										? NEEDS_YOU_COPY[mission.needsYou.reason]
										: ""}
								</span>
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
