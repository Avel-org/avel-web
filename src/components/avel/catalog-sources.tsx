import type { SkillSource, SkillSourceKind } from "avel-server/contract";
import { BookOpen, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CATALOG_MISSING, SAMPLE_SOURCES } from "./catalog-placeholders";
import {
	CatalogListSkeleton,
	type CatalogQuery,
	SampleRegion,
	sampleQuery,
} from "./catalog-sample";
import { type DataColumn, DataTable } from "./data-table";
import { EmptyState } from "./empty-state";
import { SectionPanel } from "./section-panel";
import { ErrorState, Surface } from "./surface";

/*
 * Skill sources, /catalog/sources: the open catalog every skill is traced
 * back to (SKILLS.md, DATA-CONTRACTS-V2.md SkillSource). avel-server has no
 * skillSource procedures yet, so the rows are labelled samples from
 * catalog-placeholders.ts (AVEL-DESIGN.md ruling 32). Adding a source is
 * operator-only and disabled until the routes exist.
 */

export const SOURCE_WRITE_REASON =
	"Adding a source needs skillSource routes, which avel-server doesn't have yet";

export function AddSourceButton({
	"data-testid": testId = "catalog-sources-add",
}: {
	"data-testid"?: string;
}) {
	return (
		<Button size="sm" data-testid={testId} disabledReason={SOURCE_WRITE_REASON}>
			<Plus aria-hidden="true" />
			Add source
		</Button>
	);
}

const KIND_LABEL: Record<SkillSourceKind, string> = {
	internal: "Internal",
	vendor: "Vendor",
	community: "Community",
};

const COLUMNS: DataColumn<SkillSource>[] = [
	{
		id: "name",
		header: "Source",
		cell: (row) => (
			<span className="font-medium text-foreground">{row.name}</span>
		),
	},
	{
		id: "kind",
		header: "Kind",
		width: "8rem",
		// A word, not machine text: an outline badge, not a mono tag.
		cell: (row) => (
			<Badge variant="outline" data-testid="catalog-source-kind">
				{KIND_LABEL[row.kind]}
			</Badge>
		),
	},
	{
		id: "url",
		header: "Address",
		cell: (row) =>
			row.url ? (
				<span className="type-mono-small break-all text-text-muted">
					{row.url}
				</span>
			) : (
				<span className="text-text-subtle">None</span>
			),
	},
	{
		id: "license",
		header: "License",
		width: "8rem",
		// Mono on the value only, so "None" stays prose.
		cell: (row) =>
			row.license ? (
				<span data-testid="catalog-source-license" className="type-mono-small">
					{row.license}
				</span>
			) : (
				<span className="text-text-subtle">None</span>
			),
	},
	{
		id: "skills",
		header: "Skills",
		width: "5rem",
		align: "end",
		mono: true,
		cell: (row) => row.skillCount,
	},
];

export function CatalogSources({
	query = sampleQuery(SAMPLE_SOURCES),
}: {
	query?: CatalogQuery<SkillSource>;
}) {
	return (
		<div data-testid="catalog-sources" className="flex flex-col gap-4 pb-6">
			<SectionPanel
				title="Sources"
				description="Imported skills start as drafts and are reviewed before they can be attached."
				data-testid="catalog-sources-panel"
			>
				<SampleRegion
					missing={CATALOG_MISSING.sources}
					title="Sources"
					what="Every source in the catalog, its kind, address and license, and how many skills come from it."
					data-testid="catalog-sources-sample"
				>
					<Surface
						data-testid="catalog-sources-surface"
						query={query}
						loading={
							<CatalogListSkeleton data-testid="catalog-sources-skeleton" />
						}
						empty={
							<EmptyState
								data-testid="catalog-sources-empty"
								compact
								icon={BookOpen}
								title="No sources yet"
								description="Every skill traces back to a source: AVEL itself, a vendor or a community index. Add one before importing skills from it."
								action={
									<AddSourceButton data-testid="catalog-sources-empty-add" />
								}
							/>
						}
						error={ErrorState}
					>
						{(sources) => (
							<DataTable
								label="Skill sources"
								data-testid="catalog-sources-table"
								columns={COLUMNS}
								rows={[...sources]}
								getRowId={(row) => row.id}
								stickyHeader={false}
							/>
						)}
					</Surface>
				</SampleRegion>
			</SectionPanel>
		</div>
	);
}
