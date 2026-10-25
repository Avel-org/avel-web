import { createFileRoute } from "@tanstack/react-router";
import type { RepoPolicy } from "avel-server/contract";
import { Plus } from "lucide-react";
import { useState } from "react";
import { DataPanel } from "@/components/avel/data-panel";
import { Paging, PanelFooter } from "@/components/avel/panel-footer";
import {
	RepoPolicyBoard,
	RepoPolicyModal,
} from "@/components/avel/repo-policy";
import { Button } from "@/components/ui/button";
import { loadedRepoPolicies, useRepoPolicies } from "@/lib/api/repo-policies";
import { Page, pageHead } from "../shell/page";

export const Route = createFileRoute("/settings/repositories")({
	staticData: { device: "construction" },
	head: pageHead("/settings/repositories"),
	component: SettingsRepositoriesPage,
});

/** One overlay at a time: a new policy, or one policy's edit. */
type Open =
	| { kind: "none" }
	| { kind: "new" }
	| { kind: "edit"; policy: RepoPolicy };

/**
 * Repository policies (contract.repoPolicies): a card each, newest first.
 * The top bar counts from meta.total, never the rows loaded.
 */
function SettingsRepositoriesPage() {
	const policies = useRepoPolicies();
	const [open, setOpen] = useState<Open>({ kind: "none" });
	const total = policies.data?.pages[0]?.meta.total;
	const loaded = loadedRepoPolicies(policies.data).length;
	return (
		<Page
			to="/settings/repositories"
			subtitle={
				total === undefined
					? undefined
					: total === 1
						? "1 policy"
						: `${total} policies`
			}
			actions={
				<Button
					size="sm"
					aria-haspopup="dialog"
					data-testid="repo-policies-new"
					onClick={() => setOpen({ kind: "new" })}
				>
					<Plus aria-hidden="true" />
					New policy
				</Button>
			}
		>
			<DataPanel
				data-testid="repo-policies"
				title="Repository policies"
				count={total}
				footer={
					<PanelFooter
						data-testid="repo-policies-read-age"
						queries={[policies]}
					>
						{policies.data ? (
							<Paging
								loaded={loaded}
								total={total ?? loaded}
								hasMore={policies.hasNextPage}
								loadingMore={policies.isFetchingNextPage}
								onLoadMore={() => policies.fetchNextPage()}
								testIdPrefix="repo-policies"
							/>
						) : null}
					</PanelFooter>
				}
			>
				<RepoPolicyBoard
					query={policies}
					onNew={() => setOpen({ kind: "new" })}
					onEdit={(policy) => setOpen({ kind: "edit", policy })}
				/>
			</DataPanel>
			<RepoPolicyModal
				open={open.kind !== "none"}
				policy={open.kind === "edit" ? open.policy : null}
				onOpenChange={(next) => {
					if (!next) setOpen({ kind: "none" });
				}}
			/>
		</Page>
	);
}
