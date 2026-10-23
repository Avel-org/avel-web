import { Link } from "@tanstack/react-router";
import type { SkillSource } from "avel-server/contract";
import { BookOpen } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loadedRows, useSkillSources } from "@/lib/api/catalog";
import {
	CATALOG_MISSING,
	type SampleRegistryEntry,
	sampleRegistry,
} from "./catalog-placeholders";
import { CatalogListSkeleton, SampleRegion } from "./catalog-sample";
import { SKILL_WRITE_REASON } from "./catalog-skill-inspector";
import { EmptyState } from "./empty-state";
import { SearchField } from "./search-field";
import { ShortHash } from "./short-hash";
import { ErrorState, Surface } from "./surface";

/*
 * Discover: what the vendor and community sources offer, not yet imported.
 * The sources are live (GET /api/skill-sources); what each offers is a
 * labelled sample keyed off the source's id, since no route lists a
 * source's index yet. Importing never installs a skill ready to use: it
 * creates a draft, which an operator reviews, pins by hash and approves.
 * Rows rank by source, then name, and show the hash; there is no install
 * count to rank by.
 */

/** Entries whose name, path or description holds the text, ignoring case. */
export function filterRegistry(
	entries: readonly SampleRegistryEntry[],
	q: string,
): SampleRegistryEntry[] {
	const needle = q.trim().toLowerCase();
	return entries.filter(
		(entry) =>
			needle === "" ||
			entry.name.toLowerCase().includes(needle) ||
			entry.path.toLowerCase().includes(needle) ||
			entry.description.toLowerCase().includes(needle),
	);
}

export function SkillDiscover() {
	const sources = useSkillSources();
	const [q, setQ] = useState("");
	return (
		<section
			aria-labelledby="discover-title"
			data-testid="skill-discover"
			className="flex flex-col gap-4 pb-6"
		>
			<header className="flex flex-col gap-1">
				<h2 id="discover-title" className="type-page text-foreground">
					Discover
				</h2>
				<p className="type-body text-text-muted">
					Skills the vendor and community sources offer. Importing one makes a
					draft for review; nothing is attached until it is approved.
				</p>
			</header>
			<SearchField
				data-testid="skill-discover-search"
				label="Search the sources"
				placeholder="Search the sources"
				value={q}
				onChange={setQ}
			/>
			<Surface
				data-testid="skill-discover-surface"
				query={sources}
				// AVEL's own skills are already in the library: Discover offers
				// only what vendor and community sources hold.
				isEmpty={(data) =>
					loadedRows(data).filter((s) => s.kind !== "internal").length === 0
				}
				loading={<CatalogListSkeleton data-testid="skill-discover-skeleton" />}
				empty={
					<EmptyState
						data-testid="skill-discover-empty"
						compact
						icon={BookOpen}
						title="No vendor or community sources"
						description="Discover lists what outside sources offer. None is registered yet; skills from one appear here, grouped by source."
						action={
							<Button size="sm" variant="outline" asChild>
								<Link
									to="/catalog/skills"
									search={{ view: "sources" }}
									data-testid="skill-discover-add-source"
								>
									Add a source
								</Link>
							</Button>
						}
					/>
				}
				error={ErrorState}
			>
				{(data) => <DiscoverIndex sources={loadedRows(data)} q={q} />}
			</Surface>
		</section>
	);
}

/** The sample index of every vendor and community source, filtered by q. */
function DiscoverIndex({
	sources: allSources,
	q,
}: {
	sources: readonly SkillSource[];
	q: string;
}) {
	const sources = allSources.filter((source) => source.kind !== "internal");
	const entries = filterRegistry(sampleRegistry(sources), q);
	return (
		<SampleRegion
			missing={CATALOG_MISSING.registry}
			title="Discover"
			what="Each vendor and community source's skills, ranked by source, with their hashes."
			data-testid="skill-discover-sample"
		>
			{entries.length === 0 ? (
				<p
					data-testid="skill-discover-none"
					className="px-3 py-2 type-small text-text-subtle"
				>
					Nothing in the sources matches.
				</p>
			) : (
				<div className="flex flex-col gap-4">
					{sources.map((source) => {
						const rows = entries
							.filter((entry) => entry.sourceId === source.id)
							.sort((a, b) => a.name.localeCompare(b.name));
						if (rows.length === 0) return null;
						return (
							<section
								key={source.id}
								aria-label={source.name}
								data-testid={`skill-discover-source-${source.id}`}
								data-kind={source.kind}
								className="flex flex-col gap-1"
							>
								<h3 className="flex items-center gap-2 px-1 type-caption text-text-subtle">
									<span className="font-medium text-text-muted">
										{source.name}
									</span>
									<Badge variant="outline">{source.kind}</Badge>
								</h3>
								<ul className="flex flex-col divide-y divide-border overflow-hidden rounded-control border border-border bg-app-hollow">
									{rows.map((entry) => (
										<RegistryEntryRow key={entry.id} entry={entry} />
									))}
								</ul>
							</section>
						);
					})}
				</div>
			)}
		</SampleRegion>
	);
}

/** One skill a source offers: name, where it lives, its hash, and Import. */
function RegistryEntryRow({ entry }: { entry: SampleRegistryEntry }) {
	return (
		<li
			data-testid={`skill-discover-entry-${entry.id}`}
			data-name={entry.name}
			className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2"
		>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="type-small font-medium text-foreground">
					{entry.name}
				</span>
				<span className="type-mono truncate text-text-subtle">
					{entry.path}
				</span>
				<span className="type-caption text-text-muted">
					{entry.description}
				</span>
			</div>
			<ShortHash
				value={entry.contentSha256}
				label={`the hash of ${entry.name}`}
				data-testid={`skill-discover-hash-${entry.id}`}
			/>
			{/* Real control, disabled until the import route exists. Sits in the
			    sample row because the row is the thing it would import. */}
			<Button
				size="sm"
				variant="outline"
				data-testid={`skill-discover-import-${entry.id}`}
				disabledReason={SKILL_WRITE_REASON.import}
			>
				Import as draft
			</Button>
		</li>
	);
}
