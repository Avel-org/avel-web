import { Link } from "@tanstack/react-router";
import type { ActivityEntry } from "avel-server/contract";
import { ChevronDown, X } from "lucide-react";
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
import { ActivityActor, ActivityActorName } from "./activity-actor";
import { AgentDid } from "./activity-agent";
import { ACTION_COPY, ENTITY_LABEL } from "./activity-copy";
import { ActivityTarget } from "./activity-log";
import {
	type ActivityResult,
	entityNameOf,
	INVERSE,
	type PayloadFact,
	payloadFacts,
	resultOf,
} from "./activity-record";
import { CodeView } from "./code-view";
import { SectionPanel } from "./section-panel";
import { HiddenId, ShortHash } from "./short-hash";
import { Surface } from "./surface";

/*
 * The audit log (ruling 36): the entries by day under sticky eyebrows, one
 * row each led by its actor's mark, then action, object, result and time;
 * the selected entry's decision record docks beside it, nothing over it.
 * The selection is the URL's `entry`, so a record is a link.
 */

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

/**
 * An entry's day, as the log heads it, in words: "Today", "Yesterday", then
 * "Fri 17 Oct", with the year only when it isn't this one. UTC, as the
 * stored times are, so a day never splits by the viewer's zone.
 */
export function dayLabel(iso: string, now: number): string {
	const day = iso.slice(0, 10);
	const today = new Date(now).toISOString().slice(0, 10);
	const yesterday = new Date(now - 86_400_000).toISOString().slice(0, 10);
	if (day === today) return "Today";
	if (day === yesterday) return "Yesterday";
	const d = new Date(`${day}T00:00:00.000Z`);
	const label = `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
	return day.slice(0, 4) === today.slice(0, 4)
		? label
		: `${label} ${d.getUTCFullYear()}`;
}

/** A short absolute time, "17 Oct, 02:13" (UTC), beside its relative age. */
export function shortStamp(iso: string): string {
	const d = new Date(iso);
	const hh = String(d.getUTCHours()).padStart(2, "0");
	const mm = String(d.getUTCMinutes()).padStart(2, "0");
	return `${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}, ${hh}:${mm}`;
}

/** The clock time, "14:02", in UTC as the day headings are. */
export function clockTime(iso: string): string {
	const d = new Date(iso);
	const hh = String(d.getUTCHours()).padStart(2, "0");
	const mm = String(d.getUTCMinutes()).padStart(2, "0");
	return `${hh}:${mm}`;
}

/**
 * An entry's time under its day heading: the clock only, since the heading
 * already says the day, with the full stamp on hover. UTC, so a time never
 * sits under a heading for a different day than the one it reads.
 */
export function ClockTime({
	at,
	id,
	mono = false,
}: {
	at: string;
	id: string;
	mono?: boolean;
}) {
	return (
		<time
			dateTime={at}
			title={`${shortStamp(at)} UTC (${at})`}
			data-testid={`activity-at-${id}`}
			className={cn(
				"tabular-nums",
				mono ? "type-mono text-text-muted" : "type-small text-text-subtle",
			)}
		>
			{clockTime(at)}
		</time>
	);
}

/**
 * The result, shown only when it is not Applied. Every logged entry is
 * applied today (resultOf), so a pill on each row says nothing; a quiet dash
 * keeps the column's shape, and a held, stopped or reverted entry, once the
 * server logs one, is the only pill and stands out.
 */
export function ResultCell({
	id,
	result,
}: {
	id: string;
	result: ActivityResult;
}) {
	const testId = `activity-result-${id}`;
	if (result === "Applied")
		return (
			<span
				data-testid={testId}
				data-result="Applied"
				title="Applied"
				className="type-small text-text-subtle"
			>
				<span aria-hidden="true">–</span>
				<span className="sr-only">Applied</span>
			</span>
		);
	return (
		<Badge variant="outline" data-testid={testId} data-result={result}>
			{result}
		</Badge>
	);
}

/** Entries in their order, cut into runs of one day each. */
export function groupByDay<T extends Pick<ActivityEntry, "at">>(
	entries: readonly T[],
): { day: string; entries: T[] }[] {
	const groups: { day: string; entries: T[] }[] = [];
	for (const entry of entries) {
		const day = entry.at.slice(0, 10);
		const last = groups.at(-1);
		if (last && last.day === day) last.entries.push(entry);
		else groups.push({ day, entries: [entry] });
	}
	return groups;
}

/** A day's heading in the log: an eyebrow that stays while its rows scroll. */
const DAY_HEADING =
	"sticky top-(--topbar-height) z-10 border-b border-border bg-app-band px-3 py-1.5 text-left type-eyebrow";

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
			className="w-full caption-bottom type-body"
		>
			<caption className="sr-only">
				Activity, by day. Select a row for its decision record.
			</caption>
			<TableHeader>
				<TableRow className="hover:bg-transparent">
					{/* Who acted leads each row: the mark reads first (audit F3). */}
					<TableHead className="w-52">Actor</TableHead>
					<TableHead>Action</TableHead>
					<TableHead>Object</TableHead>
					<TableHead className="w-28">Result</TableHead>
					{/* The day heads each group, so the column is the clock, in UTC
					    as the headings are. */}
					<TableHead className="w-32">Time (UTC)</TableHead>
				</TableRow>
			</TableHeader>
			{groupByDay(entries).map((group) => (
				<TableBody key={group.day} data-testid={`activity-day-${group.day}`}>
					<TableRow className="hover:bg-transparent">
						<th
							scope="colgroup"
							colSpan={5}
							title={group.day}
							className={DAY_HEADING}
						>
							{dayLabel(group.entries[0]?.at ?? group.day, now)}
						</th>
					</TableRow>
					{group.entries.map((entry) => {
						const selected = entry.id === selectedId;
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
									selected && "bg-selected hover:bg-selected",
								)}
							>
								<TableCell>
									<ActivityActor entry={entry} />
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
									<ResultCell id={entry.id} result={resultOf(entry)} />
								</TableCell>
								<TableCell>
									<ClockTime at={entry.at} id={entry.id} mono />
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			))}
		</table>
	);
}

const RULE_NOT_BUILT =
	"avel-server logs only what it applied, never what it refused, so no rule is recorded yet. Every entry here was applied.";

/** The selected entry's record, or why there is none to show. */
export function DecisionRecord({
	entry,
	selectedId,
	onClose,
	now,
}: {
	entry: ActivityEntry | undefined;
	selectedId: string | undefined;
	/** The page's fixed clock, for the record's age. */
	now: number;
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
					aria-keyshortcuts="Escape"
					onClick={onClose}
				>
					<X aria-hidden="true" />
					Close
				</Button>
			}
		>
			{entry ? (
				<RecordBody entry={entry} now={now} />
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

/** A fact's value: its text, or its id hidden, or its hash short, with Copy. */
function FactValue({ fact }: { fact: PayloadFact }) {
	if (fact.ref?.kind === "hash")
		return <ShortHash value={fact.ref.full} label={fact.label.toLowerCase()} />;
	if (fact.ref?.kind === "id")
		return (
			<HiddenId id={fact.ref.full} label={fact.label.toLowerCase()}>
				<span className="text-text-subtle">{fact.value}</span>
			</HiddenId>
		);
	return <>{fact.value}</>;
}

function RecordBody({ entry, now }: { entry: ActivityEntry; now: number }) {
	const inverse = INVERSE[entry.action];
	const facts = payloadFacts(entry.payload);
	const name = entityNameOf(entry);
	const [raw, setRaw] = useState(false);
	const rawId = useId();
	return (
		<div className="grid gap-5 lg:grid-cols-2">
			<Part title="What it did" testId="activity-record-did">
				<p className="type-small text-foreground">
					{entry.entityType === "agent_template" ? (
						<AgentDid entry={entry} action={ACTION_COPY[entry.action]} />
					) : (
						<span title={entry.entityId}>
							{`${ACTION_COPY[entry.action]}: ${ENTITY_LABEL[entry.entityType]}`}
							{name ? ` ${name}` : null}
						</span>
					)}
					{", by "}
					<ActivityActorName
						actor={entry.actor}
						data-testid={`activity-record-actor-${entry.id}`}
					/>
					.
				</p>
				{/* Its age and a short time, the full ISO on hover: a mono stamp
				    in this column would break mid-token. */}
				<p className="type-caption whitespace-nowrap text-text-subtle">
					<time
						dateTime={entry.at}
						title={entry.at}
						data-testid="activity-record-at"
					>
						{`${relativeTime(entry.at, now)}, ${shortStamp(entry.at)}`}
					</time>
				</p>
				<p className="type-caption text-text-subtle">
					<HiddenId
						id={entry.requestId}
						label="the request reference"
						data-testid="activity-record-request"
					>
						Request reference
					</HiddenId>
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
											? "type-mono text-foreground"
											: "type-small text-foreground",
									)}
								>
									<FactValue fact={fact} />
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
				{/* The fifth state on one line, so the record reads at a glance. */}
				<Surface
					data-testid="activity-record-rule-surface"
					notBuilt={{
						title: "The rule that applied",
						what: RULE_NOT_BUILT,
						needs: [],
						size: "inline",
						line: "Not recorded yet.",
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
							<span className="type-mono text-foreground">
								{inverse.request}
							</span>
							<span className="type-mono text-text-subtle">
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
			className="py-1.5 -my-1.5 type-caption text-accent-text underline-offset-4 hover:underline"
		>
			Decision record
		</Link>
	);
}
