import type { ExportWire } from "avel-server/contract";
import { ChevronRight, FilePen, FilePlus, FileX } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { tabsListVariants } from "@/components/ui/tabs";
import {
	CONTRACT_ERROR_COPY,
	type CodeCopy,
	PRECONDITION_COPY,
} from "@/lib/error-map";
import { cn } from "@/lib/utils";
import { RESULT } from "./gate-copy";
import { fileSize } from "./intake-files";
import { ShortHash } from "./short-hash";
import { StatusGlyph, StatusPill } from "./status-pill";

/*
 * What an export ships (modules 10 and 11): the package as a map of the
 * files the work wrote and deleted against the mission's base, grouped by
 * folder, with every path the delivery rules refuse marked where it sits.
 * And the delivery check: the server's guards in the order they run, so the
 * operator sees which one would stop delivery and that the rest passed.
 */

export type Change = "create" | "overwrite" | "delete";

/** One row of the map: a file the package writes or a path it deletes. */
export type PackageEntry = {
	path: string;
	change: Change;
	bytes: number | null;
	mode: string | null;
	violations: ExportWire["violations"];
};

const CHANGE = {
	create: { label: "Created", icon: FilePlus, ink: "text-gate-pass" },
	overwrite: { label: "Changed", icon: FilePen, ink: "text-text-muted" },
	delete: { label: "Deleted", icon: FileX, ink: "text-gate-block" },
} as const;

/** The package's files and deletes, each with the violations on its path. */
export function packageEntries(exp: ExportWire): PackageEntry[] {
	const byPath = new Map<string, ExportWire["violations"]>();
	for (const v of exp.violations)
		byPath.set(v.path, [...(byPath.get(v.path) ?? []), v]);
	const entries: PackageEntry[] = [
		...exp.package.files.map((f) => ({
			path: f.path,
			change: f.change,
			bytes: f.bytes,
			mode: f.mode,
			violations: byPath.get(f.path) ?? [],
		})),
		...exp.package.deletes.map((path) => ({
			path,
			change: "delete" as const,
			bytes: null,
			mode: null,
			violations: byPath.get(path) ?? [],
		})),
	];
	// Codepoint order, as the server lists them, so a folder's rows hold still.
	return entries.sort((a, b) =>
		a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
	);
}

const folderOf = (path: string) => {
	const at = path.lastIndexOf("/");
	return at === -1 ? "" : path.slice(0, at);
};
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

type Filter = "all" | Change | "violations";

const FILTERS: { id: Filter; label: string }[] = [
	{ id: "all", label: "All" },
	{ id: "create", label: "Created" },
	{ id: "overwrite", label: "Changed" },
	{ id: "delete", label: "Deleted" },
	{ id: "violations", label: "Refused" },
];

const matches = (entry: PackageEntry, filter: Filter) =>
	filter === "all" ||
	(filter === "violations"
		? entry.violations.length > 0
		: entry.change === filter);

/**
 * The package as folders of files. A filter narrows it to one kind of
 * change, or to the refused paths; a folder holding a refused path opens.
 */
export function PackageMap({
	exp,
	"data-testid": testId = "export-package",
}: {
	exp: ExportWire;
	"data-testid"?: string;
}) {
	const entries = packageEntries(exp);
	const refused = entries.filter((e) => e.violations.length > 0).length;
	const [filter, setFilter] = useState<Filter>(
		refused > 0 ? "violations" : "all",
	);
	const shown = entries.filter((e) => matches(e, filter));
	const folders = new Map<string, PackageEntry[]>();
	for (const e of shown) {
		const folder = folderOf(e.path);
		folders.set(folder, [...(folders.get(folder) ?? []), e]);
	}
	const count = (f: Filter) => entries.filter((e) => matches(e, f)).length;
	return (
		<div data-testid={testId} className="flex flex-col gap-3">
			<fieldset
				data-testid={`${testId}-filter`}
				className={cn(tabsListVariants({ variant: "default" }), "flex-wrap")}
			>
				<legend className="sr-only">Show</legend>
				{FILTERS.map((f) => {
					const n = count(f.id);
					if (f.id === "violations" && n === 0) return null;
					return (
						<Button
							key={f.id}
							type="button"
							variant="segment"
							aria-pressed={filter === f.id}
							data-testid={`${testId}-filter-${f.id}`}
							onClick={() => setFilter(f.id)}
						>
							{f.label}
							<span className="tabular-nums text-text-subtle">{n}</span>
						</Button>
					);
				})}
			</fieldset>
			{shown.length === 0 ? (
				<p className="type-small text-text-subtle">
					{entries.length === 0
						? "The work changed no files."
						: "Nothing of this kind in the package."}
				</p>
			) : (
				<ul
					aria-label="Package"
					className="flex flex-col divide-y divide-border rounded-card border border-border"
				>
					{[...folders].map(([folder, rows]) => (
						<Folder
							key={folder}
							folder={folder}
							rows={rows}
							testId={`${testId}-folder-${folder || "root"}`}
						/>
					))}
				</ul>
			)}
			<p className="type-caption text-text-subtle">
				The package also carries the gate's receipt at{" "}
				<code className="type-mono">.avel/receipt.json</code>
				{exp.targetKind === "zip" ? (
					<>
						, and its deletes at{" "}
						<code className="type-mono">.avel/deletes.json</code>, since a zip
						can't delete
					</>
				) : null}
				.
			</p>
		</div>
	);
}

function Folder({
	folder,
	rows,
	testId,
}: {
	folder: string;
	rows: PackageEntry[];
	testId: string;
}) {
	const refused = rows.some((r) => r.violations.length > 0);
	// Small folders and refused paths open: what stops delivery is read first.
	const [open, setOpen] = useState(refused || rows.length <= 4);
	const panelId = useId();
	const tally = (c: Change) => rows.filter((r) => r.change === c).length;
	return (
		<li data-testid={testId} data-refused={refused || undefined}>
			<button
				type="button"
				aria-expanded={open}
				aria-controls={panelId}
				onClick={() => setOpen((o) => !o)}
				data-testid={`${testId}-toggle`}
				className="flex h-10 w-full items-center gap-2.5 px-3 text-left hover:bg-app-raised"
			>
				<ChevronRight
					aria-hidden="true"
					className={cn(
						"size-3.5 shrink-0 text-text-subtle transition-transform duration-(--duration-micro) ease-avel",
						open && "rotate-90",
					)}
				/>
				<span className="min-w-0 flex-1 truncate type-mono text-text">
					{folder === "" ? "/" : `${folder}/`}
				</span>
				{refused ? (
					<StatusGlyph tone="block" className="text-gate-block" />
				) : null}
				<span className="flex items-center gap-2 type-caption tabular-nums text-text-subtle">
					{(["create", "overwrite", "delete"] as const).map((c) => {
						const n = tally(c);
						if (n === 0) return null;
						const Icon = CHANGE[c].icon;
						return (
							<span key={c} className="inline-flex items-center gap-0.5">
								<Icon
									aria-hidden="true"
									className={cn("size-3.5", CHANGE[c].ink)}
								/>
								{n}
								<span className="sr-only">{` ${CHANGE[c].label.toLowerCase()}`}</span>
							</span>
						);
					})}
				</span>
			</button>
			{open ? (
				<ul
					id={panelId}
					className="flex flex-col border-t border-border bg-app-band py-1"
				>
					{rows.map((row) => (
						<Row key={`${row.change}:${row.path}`} row={row} />
					))}
				</ul>
			) : null}
		</li>
	);
}

function Row({ row }: { row: PackageEntry }) {
	const { icon: Icon, ink, label } = CHANGE[row.change];
	const refused = row.violations.length > 0;
	return (
		<li
			data-testid={`export-file-${row.path}`}
			data-change={row.change}
			data-refused={refused || undefined}
			className={cn(
				"flex flex-col gap-1 px-3 py-1.5 pl-9",
				refused && "bg-gate-block-soft",
			)}
		>
			<span className="flex min-w-0 items-center gap-2">
				<Icon aria-hidden="true" className={cn("size-3.5 shrink-0", ink)} />
				<span className="sr-only">{`${label}: `}</span>
				<span
					title={row.path}
					className={cn(
						"min-w-0 flex-1 truncate type-mono text-text",
						row.change === "delete" && "line-through decoration-gate-block",
					)}
				>
					{nameOf(row.path)}
				</span>
				{row.mode === "100755" ? (
					<span className="type-caption text-text-subtle">executable</span>
				) : null}
				{row.bytes !== null ? (
					<span className="type-caption tabular-nums text-text-subtle">
						{fileSize(row.bytes)}
					</span>
				) : null}
			</span>
			{row.violations.map((v) => (
				<span
					key={v.code}
					data-testid={`export-violation-${v.code}-${row.path}`}
					className="flex flex-wrap items-baseline gap-x-2 pl-5.5 type-caption"
				>
					<code className="type-mono text-gate-block">{v.code}</code>
					<span className="text-text">{v.detail}</span>
				</span>
			))}
		</li>
	);
}

// ---------------------------------------------------------------------------
// The delivery check.

/** The guards in the order checkDeliverable runs them. */
const CHECKS = [
	{
		id: "verified",
		label: "The gate verified the work",
		reasons: ["gate_pass_not_verified", "gate_failed"],
	},
	{
		id: "paths",
		label: "Every path is one the delivery may write",
		reasons: ["blast_radius_violation"],
	},
	{
		id: "preview",
		label: "Delivered from a matching, fresh preview",
		reasons: ["preview_required", "preview_mission_mismatch", "preview_stale"],
	},
	{
		id: "hash",
		label: "The package hashes the same as its preview",
		reasons: ["package_hash_version_mismatch", "package_hash_mismatch"],
	},
] as const satisfies readonly {
	id: string;
	label: string;
	reasons: readonly NonNullable<ExportWire["blocked"]>["reason"][];
}[];

type CheckState = "pass" | "block" | "pending";

/**
 * Each guard passing, blocking, or not reached: the server stops at the
 * first refusal, so the checks after it say nothing yet. The paths check is
 * the exception: the preview lists its violations whichever guard stopped
 * first, so a refused path blocks there too. A done export passed them all.
 */
export function checkStates(exp: ExportWire): CheckState[] {
	const blocked = exp.blocked;
	const at = blocked
		? CHECKS.findIndex((c) =>
				(c.reasons as readonly string[]).includes(blocked.reason),
			)
		: CHECKS.length;
	return CHECKS.map((check, i) =>
		check.id === "paths" && exp.violations.length > 0
			? "block"
			: i < at
				? "pass"
				: i === at
					? "block"
					: "pending",
	);
}

/** A write's side of a copy that differs by method. */
const asWrite = (v: string | { write: string }) =>
	typeof v === "string" ? v : v.write;

/**
 * blocked in the error map's words: the copy a create refused with it would
 * show, a precondition by its reason and every other code by itself.
 */
function blockedCopy(blocked: NonNullable<ExportWire["blocked"]>) {
	const copy: CodeCopy | undefined =
		blocked.code === "PRECONDITION_FAILED"
			? (PRECONDITION_COPY as Record<string, CodeCopy | undefined>)[
					blocked.reason
				]
			: CONTRACT_ERROR_COPY[blocked.code];
	return copy
		? { what: copy.what, next: asWrite(copy.next) }
		: { what: blocked.message, next: "" };
}

export function DeliveryChecks({ exp }: { exp: ExportWire }) {
	const states = checkStates(exp);
	const first = exp.blocked;
	// The guard that refused says why; a refused path found past it says so.
	const copyOf = (check: (typeof CHECKS)[number]) =>
		first && (check.reasons as readonly string[]).includes(first.reason)
			? blockedCopy(first)
			: check.id === "paths"
				? blockedCopy({
						code: "BLAST_RADIUS_VIOLATION",
						reason: "blast_radius_violation",
						message: "",
					})
				: null;
	return (
		<ul
			aria-label="Delivery checks"
			data-testid="export-checks"
			className="flex flex-col gap-1"
		>
			{CHECKS.map((check, i) => {
				const state = states[i] ?? "pending";
				const copy = state === "block" ? copyOf(check) : null;
				const block = copy !== null;
				return (
					<li
						key={check.id}
						data-testid={`export-check-${check.id}`}
						data-state={state}
						className={cn(
							"flex items-start gap-2.5 rounded-control px-3 py-2",
							block && "border border-gate-block-line bg-gate-block-soft",
						)}
					>
						<StatusGlyph
							tone={state}
							className={cn(
								"mt-[3px]",
								state === "pass"
									? "text-gate-pass"
									: state === "block"
										? "text-gate-block"
										: "text-gate-pending",
							)}
						/>
						<div className="flex min-w-0 flex-col gap-1">
							<p
								className={cn(
									"type-small",
									block ? "font-medium text-foreground" : "text-text-muted",
								)}
							>
								{check.label}
								<span className="sr-only">
									{state === "pass"
										? ": passes"
										: state === "block"
											? ": blocks delivery"
											: ": not checked yet"}
								</span>
							</p>
							{block ? (
								<>
									<p className="type-small text-foreground">{copy?.what}</p>
									<p className="type-caption text-text-muted">{copy?.next}</p>
								</>
							) : null}
						</div>
					</li>
				);
			})}
		</ul>
	);
}

/** The package's identity: its hash, what it was rendered from, and its size. */
export function PackageFacts({ exp }: { exp: ExportWire }) {
	const result = RESULT[exp.gateRun.result];
	const bytes = exp.package.files.reduce((sum, f) => sum + f.bytes, 0);
	return (
		<dl data-testid="export-facts" className="flex flex-col gap-2.5 type-small">
			<Fact label="Gate run">
				<StatusPill size="sm" tone={result.tone} label={result.label} />
			</Fact>
			<Fact label="Commit">
				<ShortHash
					value={exp.gateRun.commitSha}
					label="the integration commit"
					data-testid="export-commit"
				/>
			</Fact>
			<Fact label="Base">
				<ShortHash
					value={exp.gateRun.baseSha}
					label="the mission's base commit"
					data-testid="export-base"
				/>
			</Fact>
			<Fact label="Package">
				<ShortHash
					value={exp.package.sha256}
					label="the package's SHA-256"
					data-testid="export-package-sha"
				/>
				<span className="type-caption text-text-subtle">{`v${exp.package.hashVersion}`}</span>
			</Fact>
			<Fact label="Size">
				<span className="tabular-nums text-text">
					{`${exp.package.files.length} ${exp.package.files.length === 1 ? "file" : "files"}, ${fileSize(bytes)}`}
					{exp.package.deletes.length > 0
						? `, ${exp.package.deletes.length} deleted`
						: ""}
				</span>
			</Fact>
			{exp.zip ? (
				<Fact label="Zip">
					<ShortHash
						value={exp.zip.sha256}
						label="the zip's SHA-256"
						data-testid="export-zip-sha"
					/>
					<span className="type-caption tabular-nums text-text-subtle">
						{fileSize(exp.zip.bytes)}
					</span>
				</Fact>
			) : null}
		</dl>
	);
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<dt className="text-text-muted">{label}</dt>
			<dd className="flex items-center gap-1.5">{children}</dd>
		</div>
	);
}
