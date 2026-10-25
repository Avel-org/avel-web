import { Link } from "@tanstack/react-router";
import type { Playbook } from "avel-server/contract";
import { ListChecks } from "lucide-react";
import { useState } from "react";
import { catalogTotal } from "@/lib/api/catalog";
import { loadedPlaybooks, usePlaybooks } from "@/lib/api/playbooks";
import { DataPanel } from "./data-panel";
import { Paging, PanelFooter } from "./panel-footer";
import { filterPlaybooks, PlaybookList } from "./playbook-list";
import { SearchField } from "./search-field";

/*
 * Playbooks, the second section of Teams: the process each kind of mission
 * follows, beside the squads that run it. A playbook names the team a
 * mission of its type starts from (defaultPresetId), so the two read
 * together: each playbook card says its team, and a team lists the
 * playbooks that start from it.
 */

/** The section's glyph, wherever it is named. */
export const PLAYBOOKS_ICON = ListChecks;

/** The Playbooks panel, keeping its search for as long as the section is open. */
export function PlaybooksSection() {
	const [search, setSearch] = useState("");
	return <PlaybooksPanel search={search} onSearch={setSearch} />;
}

/**
 * The panel: the search in its toolbar, paging and read age below. The
 * board is its one view (ruling 55). The search filters the loaded playbooks in place, so the footer's
 * "Showing" counts the matches against the server's total.
 */
export function PlaybooksPanel({
	search,
	onSearch,
}: {
	search: string;
	onSearch: (search: string) => void;
}) {
	const playbooks = usePlaybooks();
	const total = catalogTotal(playbooks.data);
	return (
		<DataPanel
			data-testid="playbooks-panel"
			title="Playbooks"
			count={total}
			toolbar={
				<SearchField
					data-testid="playbooks-search"
					label="Search playbooks by name or mission type"
					placeholder="Search playbooks"
					shortcut="/"
					value={search}
					onChange={onSearch}
					className="w-full max-w-sm"
				/>
			}
			footer={
				<PanelFooter data-testid="playbooks-read-age" queries={[playbooks]}>
					{playbooks.data ? (
						<Paging
							testIdPrefix="playbooks"
							loaded={
								filterPlaybooks(loadedPlaybooks(playbooks.data), search).length
							}
							total={total}
							hasMore={playbooks.hasNextPage}
							loadingMore={playbooks.isFetchingNextPage}
							onLoadMore={() => playbooks.fetchNextPage()}
						/>
					) : null}
				</PanelFooter>
			}
		>
			<PlaybookList
				query={playbooks}
				search={search}
				onClearSearch={() => onSearch("")}
			/>
		</DataPanel>
	);
}

/** The playbooks whose missions start from this team, of those loaded. */
export function playbooksStartingFrom<
	T extends Pick<Playbook, "defaultPresetId">,
>(playbooks: readonly T[], presetId: string): T[] {
	return playbooks.filter((p) => p.defaultPresetId === presetId);
}

/**
 * On a team: the playbooks that start their missions from it, each a link to
 * its builder. Nothing when none does.
 */
export function TeamPlaybooks({ presetId }: { presetId: string }) {
	const playbooks = usePlaybooks();
	const using = playbooks.data
		? playbooksStartingFrom(loadedPlaybooks(playbooks.data), presetId)
		: [];
	if (using.length === 0) return null;
	return (
		<p
			data-testid="team-playbooks"
			className="flex flex-wrap items-center gap-1.5 type-small text-text-muted"
		>
			<ListChecks aria-hidden="true" className="size-4 text-text-subtle" />
			{using.length === 1
				? "Default team of"
				: "Default team of these playbooks:"}
			{using.map((p) => (
				<Link
					key={p.missionType}
					to="/presets/playbooks/$missionType"
					params={{ missionType: p.missionType }}
					data-testid={`team-playbook-${p.missionType}`}
					className="inline-flex h-6 items-center rounded-sm border border-border bg-app-panel px-2 type-small text-text transition-colors duration-(--duration-micro) ease-avel hover:border-border-strong hover:bg-app-raised"
				>
					{p.name}
				</Link>
			))}
		</p>
	);
}
