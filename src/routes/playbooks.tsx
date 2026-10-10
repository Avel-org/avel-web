import { createFileRoute } from "@tanstack/react-router";
import {
	PlaybookList,
	playbookCountLabel,
} from "@/components/avel/playbook-list";
import { catalogTotal } from "@/lib/api/catalog";
import { usePlaybooks } from "@/lib/api/playbooks";
import { Page, pageHead } from "../shell/page";

export const Route = createFileRoute("/playbooks")({
	staticData: { device: "construction" },
	head: pageHead("/playbooks"),
	component: PlaybooksPage,
});

function PlaybooksPage() {
	const playbooks = usePlaybooks();
	const total = catalogTotal(playbooks.data);
	return (
		<Page
			to="/playbooks"
			subtitle={total === undefined ? undefined : playbookCountLabel(total)}
		>
			<PlaybookList query={playbooks} />
		</Page>
	);
}
