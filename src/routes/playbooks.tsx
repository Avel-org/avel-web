import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import {
	PLAYBOOK_VIEWS,
	PlaybookList,
	playbookCountLabel,
} from "@/components/avel/playbook-list";
import { NewPlaybookModal } from "@/components/avel/playbook-new";
import { ViewToggle } from "@/components/avel/view-toggle";
import { Button } from "@/components/ui/button";
import { catalogTotal } from "@/lib/api/catalog";
import { usePlaybooks } from "@/lib/api/playbooks";
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
				<>
					<Button
						size="sm"
						data-testid="playbooks-new"
						onClick={() => setCreating(true)}
					>
						<Plus aria-hidden="true" />
						New playbook
					</Button>
					<ViewToggle
						options={PLAYBOOK_VIEWS}
						testIdPrefix="playbooks-view"
						view={view}
						onChange={(next) =>
							navigate({
								search: next === "board" ? {} : { view: next },
								replace: true,
							})
						}
					/>
				</>
			}
		>
			<PlaybookList query={playbooks} view={view} />
			<NewPlaybookModal open={creating} onOpenChange={setCreating} />
		</Page>
	);
}
