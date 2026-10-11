import type { SkillSource } from "avel-server/contract";
import { BookOpen, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loadedRows, type useSkillSources } from "@/lib/api/catalog";
import { CatalogListFooter, CatalogListSkeleton } from "./catalog-sample";
import { SOURCE_KIND_LABEL } from "./catalog-source-form";
import { type DataColumn, DataTable } from "./data-table";
import { EmptyState } from "./empty-state";
import { SectionPanel } from "./section-panel";
import { ErrorState, Surface } from "./surface";

/*
 * Skill sources' Table view, /catalog/sources?view=table: the same live list
 * as the shelf (GET /api/skill-sources), as rows for reading and comparing.
 * The shelf is the page's first view; adding, editing and removing live
 * there and in the top bar.
 */

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
				{SOURCE_KIND_LABEL[row.kind]}
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

export function SourcesTable({
	query,
	onAdd,
}: {
	/** The live list, owned by the route. */
	query: ReturnType<typeof useSkillSources>;
	onAdd: () => void;
}) {
	return (
		<div data-testid="catalog-sources" className="flex flex-col gap-4 pb-6">
			<SectionPanel
				title="Sources"
				description="Imported skills start as drafts and are reviewed before they can be attached."
				data-testid="catalog-sources-panel"
			>
				<Surface
					data-testid="catalog-sources-surface"
					query={query}
					isEmpty={(data) => loadedRows(data).length === 0}
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
								<Button
									size="sm"
									data-testid="catalog-sources-empty-add"
									onClick={onAdd}
								>
									<Plus aria-hidden="true" />
									Add source
								</Button>
							}
						/>
					}
					error={ErrorState}
				>
					{(data) => (
						<div className="flex flex-col gap-2">
							<DataTable
								label="Skill sources"
								data-testid="catalog-sources-table"
								columns={COLUMNS}
								rows={loadedRows(data)}
								getRowId={(row) => row.id}
								stickyHeader={false}
							/>
							<CatalogListFooter
								loaded={loadedRows(data).length}
								total={data.pages[0]?.meta.total}
								hasMore={query.hasNextPage}
								loadingMore={query.isFetchingNextPage}
								onLoadMore={() => query.fetchNextPage()}
								data-testid="catalog-sources-list-footer"
							/>
						</div>
					)}
				</Surface>
			</SectionPanel>
		</div>
	);
}
