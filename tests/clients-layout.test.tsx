import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type { Client } from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiOverrideProvider } from "@/lib/api";
import { CLIENTS_PAGE_SIZE, type Page } from "@/lib/api/clients";
import { queryKeys } from "@/lib/api/keys";
import { SessionSourceProvider } from "@/lib/auth";
import { routeTree } from "../src/routeTree.gen";
import { signedIn } from "./auth-session";
import { client } from "./clients-fixtures";
import { tagOf } from "./render-page";

/*
 * The Clients list and detail split at lg (the catalog visual pass,
 * 2026-10-06). At md the 20rem list and the sidebar left the detail too
 * narrow to read, so between md and lg a selection replaces the list, as it
 * does on a phone-sized window.
 */

const TWO: Page<Client> = {
	data: [client(1), client(2)],
	meta: { nextCursor: null, total: 2 },
};
const [FIRST] = TWO.data as [Client, Client];

async function render(path: string, detail?: Client): Promise<string> {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
		},
	});
	queryClient.setQueryData(
		queryKeys.clients.list(CLIENTS_PAGE_SIZE, undefined),
		{
			pages: [TWO],
			pageParams: [undefined],
		},
	);
	if (detail) {
		queryClient.setQueryData(queryKeys.clients.detail(detail.id), detail);
	}
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [path] }),
	});
	await router.load();
	return renderToString(
		<SessionSourceProvider source={signedIn()}>
			<ApiOverrideProvider queryClient={queryClient}>
				<RouterProvider router={router} />
			</ApiOverrideProvider>
		</SessionSourceProvider>,
	);
}

const classes = (html: string, testid: string): string[] =>
	(tagOf(html, testid).match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/);

describe("Clients splits into list and detail at lg", () => {
	it("keeps no two-pane class at md", async () => {
		const html = await render("/clients");
		const panes = [
			...classes(html, "clients-list-pane"),
			...classes(html, "clients-detail-pane"),
		];
		expect(panes.filter((c) => c.startsWith("md:"))).toEqual([]);
		expect(classes(html, "clients-list-pane")).toEqual(
			expect.arrayContaining(["lg:w-80", "lg:shrink-0"]),
		);
		expect(classes(html, "clients-detail-pane")).toEqual(
			expect.arrayContaining(["lg:border-l", "lg:pl-6"]),
		);
	});

	it("shows the way back only below lg, once a client is chosen", async () => {
		const html = await render(`/clients?client=${FIRST.id}`, FIRST);
		expect(classes(html, "client-back")).toContain("lg:hidden");
		expect(classes(html, "client-back")).not.toContain("md:hidden");
	});
});
