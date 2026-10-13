import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { ClientDetail } from "@/components/avel/client-detail";
import { useClientOverlays } from "@/components/avel/client-overlays";
import { CLIENT_TABS, useClient } from "@/lib/api/clients";
import { Page } from "../shell/page";

/**
 * The open tab, and whether Engagements lists active ones only. Both are
 * links: a refused close lands here on the active engagements that blocked it.
 */
export const clientPageSearch = z.object({
	tab: z.enum(CLIENT_TABS).optional().catch(undefined),
	active: z.boolean().optional().catch(undefined),
});

// Not nested under /clients (the trailing underscore): the board renders a
// whole page with no outlet, and this page replaces it. Breadcrumbs still
// lead back to Clients, its sidebar ancestor.
export const Route = createFileRoute("/clients_/$id")({
	// Its id is never shown: the tab says "Client", and the crumb and the
	// page's title name it once it is read.
	staticData: {
		device: "construction",
		crumb: "Client",
		useCrumbName: ({ id }) => useClient(id ?? "").data?.name,
	},
	validateSearch: clientPageSearch,
	head: () => ({ meta: [{ title: "Client · Clients · AVEL" }] }),
	component: ClientRoute,
});

function ClientRoute() {
	const { id } = Route.useParams();
	const { tab = "overview", active = false } = Route.useSearch();
	const navigate = Route.useNavigate();
	// The page reads the same client, so its name is in the cache.
	const client = useClient(id);
	const [now] = useState(() => Date.now());
	const { actions, modals } = useClientOverlays({
		onShowEngagements: () =>
			navigate({
				search: { tab: "engagements", active: true },
				replace: true,
			}),
	});
	return (
		<Page
			title={client.data?.name ?? "Client"}
			definition="One client: its engagements, its files and what has happened to it."
		>
			<ClientDetail
				clientId={id}
				tab={tab}
				activeOnly={active}
				onTab={(next) =>
					navigate({
						search: (prev) => ({
							...prev,
							tab: next === "overview" ? undefined : next,
						}),
						replace: true,
					})
				}
				onActiveOnlyChange={(on) =>
					navigate({
						search: (prev) => ({ ...prev, active: on ? true : undefined }),
						replace: true,
					})
				}
				actions={actions}
				now={now}
			/>
			{modals}
		</Page>
	);
}
