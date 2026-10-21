import { Link } from "@tanstack/react-router";
import type { IdentityVersion } from "avel-server/contract";
import { type ReactNode, useState } from "react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIdentityVersionByRef } from "@/lib/api/catalog";
import { cn } from "@/lib/utils";
import { whenLabel } from "./agent-activity";
import { generatedByLabel } from "./agent-identity";
import { IdentityText } from "./catalog-agent-inspector";
import { ErrorState, Surface } from "./surface";
import { writablePathText } from "./writable-path";

/*
 * The identity version a dispatch, a report or an agent page names, opened
 * where it is named (GET /api/identity-versions/:ref). A full sha256 names
 * one version across every template, deleted ones included, so a recorded
 * hash always resolves; slug@vN names the live template's version. The
 * sheet shows what the agent was told: its identity.md and depth.md, and
 * what they were generated from. Versions never change, so it reads once.
 */

/** The sha when there is one, since it resolves even for a deleted agent. */
export function lookupRef(
	versionRef: string | null,
	sha256: string | null | undefined,
): string | null {
	return sha256 ?? versionRef;
}

/**
 * A control that names an identity version and opens it in a sheet. The
 * sheet's body mounts only while open, so nothing is read until asked.
 */
export function IdentityVersionTrigger({
	lookup,
	label,
	className,
	children,
	"data-testid": testId,
}: {
	/** A full sha256, or slug@vN. */
	lookup: string;
	/** What the control opens, for its accessible name: "kel@v2". */
	label: string;
	className?: string;
	children: ReactNode;
	"data-testid"?: string;
}) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<button
				type="button"
				aria-haspopup="dialog"
				aria-label={`Open identity version ${label}`}
				data-testid={testId}
				data-lookup={lookup}
				className={cn(
					"cursor-pointer rounded-xs underline decoration-border underline-offset-2 transition-colors duration-(--duration-micro) ease-avel hover:decoration-current",
					className,
				)}
				// Cards that hold a version are often clickable themselves.
				onClick={(event) => {
					event.stopPropagation();
					setOpen(true);
				}}
			>
				{children}
			</button>
			{open ? (
				<IdentityVersionSheet
					lookup={lookup}
					label={label}
					onClose={() => setOpen(false)}
				/>
			) : null}
		</>
	);
}

/** The sheet itself, open while mounted. */
export function IdentityVersionSheet({
	lookup,
	label,
	onClose,
}: {
	lookup: string;
	label: string;
	onClose: () => void;
}) {
	return (
		<Sheet open onOpenChange={(next) => !next && onClose()}>
			<SheetContent
				side="right"
				data-testid="identity-version-sheet"
				className="w-full gap-0 p-0 sm:max-w-xl"
			>
				<SheetHeader>
					<SheetTitle className="type-mono">{label}</SheetTitle>
					<SheetDescription>
						The identity the agent ran as: its text, and what it was generated
						from. A version is never changed.
					</SheetDescription>
				</SheetHeader>
				<div className="app-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
					<IdentityVersionBody lookup={lookup} />
				</div>
			</SheetContent>
		</Sheet>
	);
}

/** The version read by its ref, in the four states every data region has. */
export function IdentityVersionBody({ lookup }: { lookup: string }) {
	const query = useIdentityVersionByRef(lookup);
	return (
		<Surface
			data-testid="identity-version-body"
			query={query}
			// A version exists or it is not found; it is never empty.
			isEmpty={() => false}
			empty={null}
			loading={
				<div
					data-testid="identity-version-skeleton"
					className="flex flex-col gap-3"
				>
					<Skeleton className="h-4 w-48" />
					<Skeleton className="h-4 w-64" />
					<Skeleton className="h-40 w-full rounded-control" />
				</div>
			}
			error={ErrorState}
		>
			{(version) => <IdentityVersionView version={version} />}
		</Surface>
	);
}

/** One version: who it is for, when and by whom, its inputs, then its text. */
export function IdentityVersionView({ version }: { version: IdentityVersion }) {
	const { inputs } = version;
	return (
		<div data-testid="identity-version-view" className="flex flex-col gap-5">
			<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 type-small">
				<dt className="text-text-subtle">Agent</dt>
				<dd className="min-w-0">
					<Link
						to="/catalog/agents/$slug"
						params={{ slug: inputs.slug }}
						data-testid="identity-version-agent"
						className="text-text underline decoration-border underline-offset-2 hover:decoration-current"
					>
						{inputs.name}
					</Link>
					<span className="ml-2 type-mono text-text-subtle">{inputs.slug}</span>
				</dd>
				<dt className="text-text-subtle">Version</dt>
				<dd
					data-testid="identity-version-number"
					className="type-mono text-text"
				>
					{`v${version.number}`}
				</dd>
				<dt className="text-text-subtle">Written</dt>
				<dd data-testid="identity-version-written" className="text-text">
					{`${generatedByLabel(version.generatedBy, undefined)}, `}
					<time dateTime={version.createdAt}>
						{whenLabel(version.createdAt)}
					</time>
				</dd>
				<dt className="text-text-subtle">Roles</dt>
				<dd
					data-testid="identity-version-roles"
					className="type-mono text-text-muted"
				>
					{inputs.roles.join(", ")}
				</dd>
				<dt className="text-text-subtle">May change</dt>
				<dd
					data-testid="identity-version-paths"
					className="type-mono break-words text-text-muted"
				>
					{inputs.writablePaths.map(writablePathText).join(", ")}
				</dd>
				<dt className="text-text-subtle">Skills</dt>
				<dd
					data-testid="identity-version-skills"
					className="type-mono text-text-muted"
				>
					{inputs.skills.length}
				</dd>
				<dt className="text-text-subtle">Generator</dt>
				<dd className="type-mono text-text-muted">{inputs.generatorVersion}</dd>
			</dl>
			{/* Its text as it was: an old version is never stale. */}
			<IdentityText
				agent={{ name: inputs.name, identityStale: false, staleInputs: [] }}
				version={version}
			/>
		</div>
	);
}
