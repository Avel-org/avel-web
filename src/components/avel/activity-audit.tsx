import { Link } from "@tanstack/react-router";
import type { ActivityActorKind, ActivityEntry } from "avel-server/contract";
import { Bot, ChevronDown, Cog, UserRound } from "lucide-react";
import { type KeyboardEvent, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { relativeTime } from "@/lib/api/clients";
import { cn } from "@/lib/utils";
import { ACTION_COPY, ENTITY_LABEL } from "./activity-copy";
import { ActivityTarget } from "./activity-log";
import { INVERSE, payloadFacts, resultOf } from "./activity-record";
import { CodeView } from "./code-view";
import { SectionPanel } from "./section-panel";
import { Surface } from "./surface";

/*
 * The audit log (ruling 36): one row per entry with its time, actor, action,
 * object and result, and below the table the selected entry's decision
 * record. The selection is the URL's `entry`, so a record is a link.
 */

/** Each actor kind's icon, beside the server's display for the actor. */
const ACTOR_ICON = {
	operator: UserRound,
	agent: Bot,
	system: Cog,
} as const satisfies Record<ActivityActorKind, typeof UserRound>;

export function AuditTable({
	entries,
	selectedId,
	onSelect,
	now,
}: {
	entries: ActivityEntry[];
	selectedId: string | undefined;
	onSelect: (id: string | undefined) => void;
	now: number;
}) {
	const keys = (id: string) => (event: KeyboardEvent<HTMLTableRowElement>) => {
		if (event.target !== event.currentTarget) return;
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			onSelect(id === selectedId ? undefined : id);
		}
	};
	return (
		<table
			data-testid="activity-audit"
			className="w-full caption-bottom text-sm"
		>
			<caption className="sr-only">
				Activity. Select a row for its decision record.
			</caption>
			<TableHeader>
				<TableRow className="hover:bg-transparent">
					<TableHead className="w-36">Time</TableHead>
					<TableHead className="w-48">Actor</TableHead>
					<TableHead>Action</TableHead>
					<TableHead>Object</TableHead>
					<TableHead className="w-28">Result</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{entries.map((entry) => {
					const selected = entry.id === selectedId;
					const Icon = ACTOR_ICON[entry.actor.kind];
					return (
						<TableRow
							key={entry.id}
							data-testid={`activity-row-${entry.id}`}
							data-selected={selected || undefined}
							aria-selected={selected}
							tabIndex={0}
							onClick={() => onSelect(selected ? undefined : entry.id)}
							onKeyDown={keys(entry.id)}
							className={cn(
								"focus-inset cursor-pointer",
								selected && "bg-state-selected hover:bg-state-selected",
							)}
						>
							<TableCell>
								<time
									dateTime={entry.at}
									title={entry.at}
									data-testid={`activity-at-${entry.id}`}
									className="type-mono-small text-text-muted tabular-nums"
								>
									{relativeTime(entry.at, now)}
								</time>
							</TableCell>
							<TableCell>
								<span className="inline-flex items-center gap-1.5">
									<Icon
										aria-hidden="true"
										className="size-3.5 text-text-subtle"
									/>
									<span
										data-testid={`activity-actor-${entry.id}`}
										data-actor-kind={entry.actor.kind}
										className="type-small text-text-muted"
									>
										{entry.actor.display}
									</span>
								</span>
							</TableCell>
							<TableCell>
								<span
									data-testid={`activity-action-${entry.id}`}
									className="type-small font-medium text-foreground"
								>
									{ACTION_COPY[entry.action]}
								</span>
							</TableCell>
							<TableCell>
								<ActivityTarget entry={entry} />
							</TableCell>
							<TableCell>
								<Badge
									variant="outline"
									data-testid={`activity-result-${entry.id}`}
								>
									{resultOf(entry)}
								</Badge>
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</table>
	);
}

/** The selected entry's record, or why there is none to show. */
export function DecisionRecord({
	entry,
	selectedId,
	onClose,
}: {
	entry: ActivityEntry | undefined;
	selectedId: string | undefined;
	onClose: () => void;
}) {
	if (selectedId === undefined) return null;
	return (
		<SectionPanel
			title="Decision record"
			data-testid="activity-record"
			actions={
				<Button
					variant="ghost"
					size="sm"
					data-testid="activity-record-close"
					onClick={onClose}
				>
					Close
				</Button>
			}
		>
			{entry ? (
				<RecordBody entry={entry} />
			) : (
				<p
					data-testid="activity-record-missing"
					className="type-small text-text-muted"
				>
					This entry isn't in the pages loaded so far. Load more below, or close
					the record.
				</p>
			)}
		</SectionPanel>
	);
}

function Part({
	title,
	testId,
	children,
}: {
	title: string;
	testId: string;
	children: React.ReactNode;
}) {
	return (
		<section data-testid={testId} className="flex flex-col gap-1.5">
			<h3 className="type-caption text-text-subtle">{title}</h3>
			{children}
		</section>
	);
}

function RecordBody({ entry }: { entry: ActivityEntry }) {
	const inverse = INVERSE[entry.action];
	const facts = payloadFacts(entry.payload);
	const [raw, setRaw] = useState(false);
	const rawId = useId();
	return (
		<div className="grid gap-5 lg:grid-cols-2">
			<Part title="What it did" testId="activity-record-did">
				<p className="type-small text-foreground">
					{`${ACTION_COPY[entry.action]}: ${ENTITY_LABEL[entry.entityType]} `}
					<span className="type-mono-small">{entry.entityId.slice(0, 8)}</span>
					{`, by ${entry.actor.display}.`}
				</p>
				<p className="type-mono-small text-text-subtle">
					<time dateTime={entry.at}>{entry.at}</time>
				</p>
				<p className="type-caption text-text-subtle">
					Request <span className="type-mono-small">{entry.requestId}</span>
				</p>
			</Part>
			<Part title="What it looked at" testId="activity-record-looked">
				{facts.length === 0 ? (
					<p className="type-small text-text-subtle">
						The entry carries no details.
					</p>
				) : (
					<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
						{facts.map((fact) => (
							<div key={fact.key} className="contents">
								<dt className="type-caption text-text-subtle">{fact.label}</dt>
								<dd
									className={cn(
										"min-w-0 break-words",
										fact.mono
											? "type-mono-small text-foreground"
											: "type-small text-foreground",
									)}
								>
									{fact.value}
								</dd>
							</div>
						))}
					</dl>
				)}
				<Button
					variant="ghost"
					size="sm"
					className="self-start"
					aria-expanded={raw}
					aria-controls={rawId}
					data-testid="activity-record-raw-toggle"
					onClick={() => setRaw(!raw)}
				>
					<ChevronDown
						aria-hidden="true"
						className={cn(
							"transition-transform duration-(--duration-state) ease-avel",
							raw && "rotate-180",
						)}
					/>
					{raw ? "Hide the raw payload" : "Show the raw payload"}
				</Button>
				<div id={rawId}>
					{raw ? (
						<CodeView
							label="The entry's raw payload"
							text={JSON.stringify(entry.payload, null, 2)}
							data-testid="activity-record-raw"
						/>
					) : null}
				</div>
			</Part>
			<Part title="What rule applied" testId="activity-record-rule">
				<Surface
					data-testid="activity-record-rule-surface"
					notBuilt={{
						title: "The rule that applied",
						what: "avel-server logs only what it applied, never what it refused, so no rule is recorded yet. Every entry here was applied.",
						needs: [],
						compact: true,
					}}
				/>
			</Part>
			<Part title="How confident" testId="activity-record-confidence">
				<p className="type-small text-text-muted">
					n/a: this entry carries no confidence.
				</p>
			</Part>
			<Part title="How to reverse it" testId="activity-record-reverse">
				{inverse ? (
					<div className="flex flex-col gap-1">
						<p className="flex flex-wrap items-baseline gap-2">
							<span className="type-mono-small text-foreground">
								{inverse.request}
							</span>
							<span className="type-mono-small text-text-subtle">
								{inverse.route}
							</span>
						</p>
						<p className="type-small text-text-muted">{inverse.note}</p>
					</div>
				) : (
					<p className="type-small text-text-muted">
						No inverse: the contract has no request that undoes this.
					</p>
				)}
			</Part>
		</div>
	);
}

/** On a phone: the two-line rows, each with a way into its record. */
export function RecordLink({ id }: { id: string }) {
	return (
		<Link
			to="/activity"
			search={(prev) => ({ ...prev, entry: id })}
			data-testid={`activity-record-open-${id}`}
			className="type-caption text-accent-text underline-offset-4 hover:underline"
		>
			Decision record
		</Link>
	);
}
