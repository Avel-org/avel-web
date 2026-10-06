import { createFileRoute } from "@tanstack/react-router";
import {
	AddSourceButton,
	CatalogSources,
} from "@/components/avel/catalog-sources";
import { Page, pageHead } from "../shell/page";

export const Route = createFileRoute("/catalog/sources")({
	staticData: { device: "construction" },
	head: pageHead("/catalog/sources"),
	component: CatalogSourcesPage,
});

function CatalogSourcesPage() {
	return (
		<Page to="/catalog/sources" actions={<AddSourceButton />}>
			<CatalogSources />
		</Page>
	);
}
