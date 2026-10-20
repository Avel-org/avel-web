import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { DataPanel } from "@/components/avel/data-panel";
import { Paging, PanelFooter } from "@/components/avel/panel-footer";
import {
	PLAYBOOK_VIEWS,
	PlaybookList,
	playbookCountLabel,
} from "@/components/avel/playbook-list";
import { NewPlaybookModal } from "@/components/avel/playbook-new";
import { ViewToggle } from "@/components/avel/view-toggle";
import { Button } from "@/components/ui/button";
import { catalogTotal } from "@/lib/api/catalog";
import { loadedPlaybooks, usePlaybooks } from "@/lib/api/playbooks";
import { Page, pageHead } from "../shell/page";

/**
 * The page's state in the URL. `view` is Board (cards, the default) or
 * Table (ruling 36), so the chosen view survives a reload and is a link.
 */
export const playbooksSearch = z.object({
	view: z.enum(["board", "table"]).optional().catch(undefined),
});

export const Route = createFileRoute("/playbooks")({
	staticData: { device: "construction" },
	validateSearch: playbooksSearch,
	head: pageHead("/playbooks"),
	component: PlaybooksPage,
});

function PlaybooksPage() {
	const playbooks = usePlaybooks();
	const total = catalogTotal(playbooks.data);
	const view = Route.useSearch().view ?? "board";
	const navigate = Route.useNavigate();
	const [creating, setCreating] = useState(false);
	return (
		<Page
			to="/playbooks"
			subtitle={total === undefined ? undefined : playbookCountLabel(total)}
			actions={
				<Button
					size="sm"
					data-testid="playbooks-new"
					onClick={() => setCreating(true)}
				>
					<Plus aria-hidden="true" />
					New playbook
				</Button>
			}
		>
			{/* One panel, as every list page: the view in its toolbar, the
				    paging and read age in its footer band. */}
			<DataPanel
				data-testid="playbooks-panel"
				title="Playbooks"
				count={total}
				toolbar={
					<ViewToggle
						options={PLAYBOOK_VIEWS}
						testIdPrefix="playbooks-view"
						view={view}
						className="ml-auto"
						onChange={(next) =>
							navigate({
								search: next === "board" ? {} : { view: next },
								replace: true,
							})
						}
					/>
				}
				footer={
					<PanelFooter data-testid="playbooks-read-age" queries={[playbooks]}>
						{playbooks.data ? (
							<Paging
								testIdPrefix="playbooks"
								loaded={loadedPlaybooks(playbooks.data).length}
								total={total}
								hasMore={playbooks.hasNextPage}
								loadingMore={playbooks.isFetchingNextPage}
								onLoadMore={() => playbooks.fetchNextPage()}
							/>
						) : null}
					</PanelFooter>
				}
			>
				<PlaybookList query={playbooks} view={view} />
			</DataPanel>
			<NewPlaybookModal open={creating} onOpenChange={setCreating} />
		</Page>
	);
}
