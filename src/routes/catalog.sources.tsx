import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type SkillSource, skillSourceKind } from "avel-server/contract";
import { LayoutGrid, Plus, Rows3 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { SourceDetailModal } from "@/components/avel/catalog-source-detail";
import { SourceFormModal } from "@/components/avel/catalog-source-form";
import { RemoveSourceModal } from "@/components/avel/catalog-source-remove";
import { SourceShelf } from "@/components/avel/catalog-source-shelf";
import { SourcesTable } from "@/components/avel/catalog-sources";
import { type ViewOption, ViewToggle } from "@/components/avel/view-toggle";
import { Button } from "@/components/ui/button";
import {
	catalogCountLabel,
	catalogTotal,
	useSkillSources,
} from "@/lib/api/catalog";
import { Page, pageHead } from "../shell/page";

/**
 * The page's state in the URL: `view` is "table" for rows, absent for the
 * shelf; `kind` keeps one kind of source, absent for all.
 */
export const catalogSourcesSearch = z.object({
	view: z.literal("table").optional().catch(undefined),
	kind: skillSourceKind.optional().catch(undefined),
});

export const Route = createFileRoute("/catalog/sources")({
	staticData: { device: "construction" },
	validateSearch: catalogSourcesSearch,
	head: pageHead("/catalog/sources"),
	component: CatalogSourcesPage,
});

type View = "shelf" | "table";

/** Shelf first: sources as a library; Table is for reading them as rows. */
const SOURCE_VIEWS = [
	{ id: "shelf", label: "Shelf", icon: LayoutGrid },
	{ id: "table", label: "Table", icon: Rows3 },
] as const satisfies readonly ViewOption<View>[];

/** The route owns the list; the top bar counts from meta.total, never the rows loaded. */
function CatalogSourcesPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: "/catalog/sources" });
	const view: View = search.view === "table" ? "table" : "shelf";
	const sources = useSkillSources(search.kind);
	const total = catalogTotal(sources.data);
	// The source being edited, or null to add; held while the form closes, so
	// the closing modal keeps its title, values and request.
	const [editing, setEditing] = useState<SkillSource | null>(null);
	const [formOpen, setFormOpen] = useState(false);
	// Held while closing, so each modal's closing animation shows its source.
	const [removing, setRemoving] = useState<SkillSource | null>(null);
	const [removeOpen, setRemoveOpen] = useState(false);
	const [opened, setOpened] = useState<SkillSource | null>(null);
	const [detailOpen, setDetailOpen] = useState(false);
	const add = () => {
		setEditing(null);
		setFormOpen(true);
	};

	return (
		<Page
			to="/catalog/sources"
			subtitle={
				total === undefined
					? undefined
					: catalogCountLabel(total, "source", "sources")
			}
			actions={
				<Button size="sm" data-testid="catalog-sources-add" onClick={add}>
					<Plus aria-hidden="true" />
					Add source
				</Button>
			}
		>
			<div data-testid="catalog-sources" className="flex flex-col gap-4 pb-6">
				<ViewToggle
					options={SOURCE_VIEWS}
					view={view}
					onChange={(next) =>
						navigate({
							search: (prev) => ({
								...prev,
								view: next === "table" ? "table" : undefined,
							}),
							replace: true,
						})
					}
					testIdPrefix="catalog-sources-view"
					className="self-end"
				/>
				{view === "table" ? (
					<SourcesTable query={sources} onAdd={add} />
				) : (
					<SourceShelf
						query={sources}
						kind={search.kind}
						onKind={(kind) =>
							navigate({ search: (prev) => ({ ...prev, kind }), replace: true })
						}
						actions={{
							onAdd: add,
							onOpen: (source) => {
								setOpened(source);
								setDetailOpen(true);
							},
							onEdit: (source) => {
								setEditing(source);
								setFormOpen(true);
							},
							onRemove: (source) => {
								setRemoving(source);
								setRemoveOpen(true);
							},
						}}
					/>
				)}
			</div>
			<SourceFormModal
				open={formOpen}
				onOpenChange={setFormOpen}
				source={editing ?? undefined}
			/>
			<RemoveSourceModal
				source={removing}
				open={removeOpen}
				onOpenChange={setRemoveOpen}
			/>
			<SourceDetailModal
				source={opened}
				open={detailOpen}
				onOpenChange={setDetailOpen}
			/>
		</Page>
	);
}
