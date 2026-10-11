import type {
	SkillLayer,
	SkillSource,
	SkillSourceKind,
} from "avel-server/contract";
import {
	BookOpen,
	Building2,
	ExternalLink,
	Pencil,
	Store,
	Trash2,
	Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	loadedRows,
	useSkillSourceCount,
	type useSkillSources,
	useSourceLayerCount,
} from "@/lib/api/catalog";
import { cn } from "@/lib/utils";
import { CatalogListFooter } from "./catalog-sample";
import { SOURCE_KIND_LABEL } from "./catalog-source-form";
import { EmptyState } from "./empty-state";
import { ErrorState, Surface } from "./surface";

const SOURCE_KINDS: readonly SkillSourceKind[] = [
	"internal",
	"vendor",
	"community",
];
const LAYERS: readonly SkillLayer[] = ["role", "stack", "domain"];

const KIND_ICON = {
	internal: Building2,
	vendor: Store,
	community: Users,
} as const satisfies Record<SkillSourceKind, unknown>;

/**
 * A layer's tone on the bar. Borrowed from existing tones until layer tokens
 * are decided; swapping them is this one table.
 */
const LAYER_TONE: Record<SkillLayer, string> = {
	role: "bg-accent",
	stack: "bg-gate-pass",
	domain: "bg-gate-warn",
};

export type SourceActions = {
	onOpen: (source: SkillSource) => void;
	onEdit: (source: SkillSource) => void;
	onRemove: (source: SkillSource) => void;
	onAdd: () => void;
};

/**
 * Skill sources as a library shelf: kind tabs with their counts, then a tile
 * per source with its skill count, a bar of its skills by layer and its
 * address. A tile opens the source's skills; edit and remove sit on it.
 */
export function SourceShelf({
	query,
	kind,
	onKind,
	actions,
}: {
	query: ReturnType<typeof useSkillSources>;
	kind: SkillSourceKind | undefined;
	onKind: (kind: SkillSourceKind | undefined) => void;
	actions: SourceActions;
}) {
	return (
		<div data-testid="source-shelf" className="flex flex-col gap-4">
			<KindTabs value={kind} onChange={onKind} />
			<Surface
				data-testid="catalog-sources-surface"
				query={query}
				isEmpty={(data) => loadedRows(data).length === 0}
				loading={<ShelfSkeleton />}
				empty={
					<EmptyState
						data-testid="catalog-sources-empty"
						compact
						icon={BookOpen}
						title={
							kind === undefined
								? "No sources yet"
								: `No ${SOURCE_KIND_LABEL[kind].toLowerCase()} sources`
						}
						description="Every skill traces back to a source: AVEL itself, a vendor or a community index. Add one before importing skills from it."
						action={
							<Button
								size="sm"
								data-testid="catalog-sources-empty-add"
								onClick={actions.onAdd}
							>
								Add source
							</Button>
						}
					/>
				}
				error={ErrorState}
			>
				{(data) => (
					<div className="flex flex-col gap-3">
						<ul
							data-testid="source-tiles"
							className="grid gap-3 stagger-in md:grid-cols-2 2xl:grid-cols-3"
						>
							{loadedRows(data).map((source) => (
								<li key={source.id}>
									<SourceTile source={source} actions={actions} />
								</li>
							))}
						</ul>
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
		</div>
	);
}

/** All, then each kind, each with its count from the server's meta.total. */
function KindTabs({
	value,
	onChange,
}: {
	value: SkillSourceKind | undefined;
	onChange: (kind: SkillSourceKind | undefined) => void;
}) {
	return (
		<fieldset
			data-testid="source-kinds"
			className="flex flex-wrap items-center gap-1"
		>
			<legend className="sr-only">Kind</legend>
			<Button
				size="sm"
				variant="ghost"
				aria-pressed={value === undefined}
				data-testid="source-kind-all"
				onClick={() => onChange(undefined)}
				className="aria-pressed:bg-state-selected"
			>
				All
			</Button>
			{SOURCE_KINDS.map((kind) => (
				<KindTab
					key={kind}
					kind={kind}
					pressed={value === kind}
					onClick={() => onChange(kind)}
				/>
			))}
		</fieldset>
	);
}

function KindTab({
	kind,
	pressed,
	onClick,
}: {
	kind: SkillSourceKind;
	pressed: boolean;
	onClick: () => void;
}) {
	const count = useSkillSourceCount(kind);
	const Icon = KIND_ICON[kind];
	return (
		<Button
			size="sm"
			variant="ghost"
			aria-pressed={pressed}
			data-testid={`source-kind-${kind}`}
			onClick={onClick}
			className="aria-pressed:bg-state-selected"
		>
			<Icon aria-hidden="true" />
			{SOURCE_KIND_LABEL[kind]}
			{count.data === undefined || count.data === null ? null : (
				<span
					data-testid={`source-kind-${kind}-count`}
					className="type-mono-small text-text-subtle tabular-nums"
				>
					{count.data}
				</span>
			)}
		</Button>
	);
}

function SourceTile({
	source,
	actions,
}: {
	source: SkillSource;
	actions: Pick<SourceActions, "onOpen" | "onEdit" | "onRemove">;
}) {
	const Icon = KIND_ICON[source.kind];
	return (
		<article
			aria-label={source.name}
			data-testid={`source-tile-${source.id}`}
			className="plate plate-interactive flex h-full flex-col gap-3 rounded-md border p-4"
		>
			<header className="flex items-start gap-2">
				<Icon
					aria-hidden="true"
					className="mt-0.5 size-4 shrink-0 text-text-subtle"
				/>
				<Button
					variant="link"
					data-testid={`source-open-${source.id}`}
					onClick={() => actions.onOpen(source)}
					className="h-auto min-w-0 flex-1 justify-start p-0 type-panel-title text-foreground"
				>
					<span className="truncate">{source.name}</span>
				</Button>
				<span
					data-testid={`source-skill-count-${source.id}`}
					className="type-mono-small shrink-0 text-text-muted tabular-nums"
				>
					{source.skillCount}
				</span>
			</header>
			<LayerBar source={source} />
			{source.url ? (
				<a
					href={source.url}
					target="_blank"
					rel="noopener noreferrer"
					data-testid={`source-url-${source.id}`}
					className="type-mono-small inline-flex min-w-0 items-center gap-1 break-all text-text-muted underline-offset-4 hover:underline"
				>
					{source.url}
					<ExternalLink aria-hidden="true" className="size-3 shrink-0" />
				</a>
			) : (
				<span className="type-small text-text-subtle">No address</span>
			)}
			<footer className="mt-auto flex items-center gap-1">
				<span className="type-caption mr-auto text-text-subtle">
					{SOURCE_KIND_LABEL[source.kind]}
					{source.license ? ` · ${source.license}` : ""}
				</span>
				<Button
					size="icon-xs"
					variant="ghost"
					aria-label={`Edit ${source.name}`}
					data-testid={`source-edit-${source.id}`}
					onClick={() => actions.onEdit(source)}
				>
					<Pencil aria-hidden="true" />
				</Button>
				<Button
					size="icon-xs"
					variant="ghost"
					aria-label={`Remove ${source.name}`}
					data-testid={`source-remove-${source.id}`}
					onClick={() => actions.onRemove(source)}
				>
					<Trash2 aria-hidden="true" />
				</Button>
			</footer>
		</article>
	);
}

/**
 * A layer's share of the bar, from three counts. Null while any count is
 * unknown; an empty list when the source has no skills.
 */
export function layerShares(
	counts: Record<SkillLayer, number | null | undefined>,
): Array<{ layer: SkillLayer; count: number; share: number }> | null {
	if (LAYERS.some((l) => counts[l] === null || counts[l] === undefined)) {
		return null;
	}
	const total = LAYERS.reduce((sum, l) => sum + (counts[l] ?? 0), 0);
	if (total === 0) return [];
	return LAYERS.filter((l) => (counts[l] ?? 0) > 0).map((layer) => ({
		layer,
		count: counts[layer] ?? 0,
		share: (counts[layer] ?? 0) / total,
	}));
}

/** The source's skills by layer, role, stack and domain, each counted by the server. */
function LayerBar({ source }: { source: SkillSource }) {
	const role = useSourceLayerCount(source.id, "role");
	const stack = useSourceLayerCount(source.id, "stack");
	const domain = useSourceLayerCount(source.id, "domain");
	const shares = layerShares({
		role: role.data,
		stack: stack.data,
		domain: domain.data,
	});
	if (shares === null) {
		return (
			<Skeleton
				data-testid={`source-layers-loading-${source.id}`}
				className="h-1.5 w-full rounded-full"
			/>
		);
	}
	if (shares.length === 0) {
		return (
			<p
				data-testid={`source-layers-${source.id}`}
				className="type-caption text-text-subtle"
			>
				No skills yet
			</p>
		);
	}
	return (
		<div className="flex flex-col gap-1">
			<ol
				aria-label="Skills by layer"
				data-testid={`source-layers-${source.id}`}
				className="flex h-1.5 gap-px overflow-hidden rounded-full"
			>
				{shares.map(({ layer, count, share }) => (
					<li
						key={layer}
						data-layer={layer}
						data-count={count}
						title={`${layer}: ${count}`}
						style={{ width: `${share * 100}%` }}
						// Each segment grows in from the left; still when motion is reduced.
						className={cn("motion-safe:grow-x", LAYER_TONE[layer])}
					>
						<span className="sr-only">{`${layer}: ${count}`}</span>
					</li>
				))}
			</ol>
			<p className="type-caption flex gap-3 text-text-subtle tabular-nums">
				{shares.map(({ layer, count }) => (
					<span key={layer} className="inline-flex items-center gap-1">
						<span
							aria-hidden="true"
							className={cn("size-2 rounded-full", LAYER_TONE[layer])}
						/>
						{`${layer} ${count}`}
					</span>
				))}
			</p>
		</div>
	);
}

function ShelfSkeleton() {
	return (
		<div
			data-testid="catalog-sources-skeleton"
			className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3"
		>
			{[0, 1, 2].map((i) => (
				<div
					key={i}
					className="plate flex flex-col gap-3 rounded-md border p-4"
				>
					<Skeleton className="h-5 w-40" />
					<Skeleton className="h-1.5 w-full rounded-full" />
					<Skeleton className="h-4 w-48" />
				</div>
			))}
		</div>
	);
}
