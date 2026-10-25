import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InlineModals } from "@/components/avel/action-modal";
import { NewIntakeForm } from "@/components/avel/intake-new";
import { NewMissionModal } from "@/components/avel/mission-new";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, ApiProvider } from "@/lib/api";
import { clientEngagementsQuery, clientsQuery } from "@/lib/api/clients";
import { client, engagement, fakeApi } from "./clients-fixtures";
import { tagOf } from "./render-page";

/*
 * New mission: a mission is created when its intake is approved, so New
 * mission starts the intake, choosing the client first and then one of its
 * active engagements.
 */

const C1 = client(1);
const C2 = client(2);
const E1 = engagement(1, C1.id);

const page = <T,>(data: T[]) => ({
	pages: [{ data, meta: { nextCursor: null } }],
	pageParams: [undefined],
});

function render(clients: ReturnType<typeof client>[] | null) {
	const { client: api } = fakeApi();
	const qc = new QueryClient({
		defaultOptions: {
			queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
		},
	});
	if (clients) {
		qc.setQueryData(
			clientsQuery(api, undefined, "active").queryKey,
			page(clients) as never,
		);
		qc.setQueryData(
			clientEngagementsQuery(api, C1.id, "active").queryKey,
			page([E1]) as never,
		);
	}
	return renderToString(
		<ApiProvider client={api}>
			<QueryClientProvider client={qc}>
				<TooltipProvider>
					<InlineModals>
						<NewMissionModal open onOpenChange={() => {}} />
					</InlineModals>
				</TooltipProvider>
			</QueryClientProvider>
		</ApiProvider>,
	);
}

describe("New mission", () => {
	it("asks for a client first, and holds Create until one is chosen", () => {
		const html = render([C1, C2]);
		expect(html).toContain("New mission");
		expect(html).toContain(`data-testid="mission-new-client-${C1.id}"`);
		expect(html).toContain(`data-testid="mission-new-client-${C2.id}"`);
		// No engagement step until there is a client to read them for.
		expect(html).not.toContain("intake-new-engagement");
		expect(tagOf(html, "intake-new-submit")).toContain('disabled=""');
	});

	it("chooses the only client, then its only engagement, and offers Create", () => {
		const html = render([C1]);
		expect(tagOf(html, `mission-new-client-${C1.id}`)).toContain(
			'data-state="checked"',
		);
		expect(tagOf(html, `intake-new-engagement-${E1.id}`)).toContain(
			'data-state="checked"',
		);
		expect(tagOf(html, "intake-new-submit")).not.toContain('disabled=""');
	});

	it("says to add a client when there is no active one", () => {
		const html = render([]);
		expect(html).toContain('data-testid="mission-new-no-client"');
		expect(tagOf(html, "intake-new-submit")).toContain('disabled=""');
	});

	it("drops an engagement chosen under another client while the new one's load", () => {
		const { client: api } = fakeApi();
		const html = renderToString(
			<ApiProvider client={api}>
				<QueryClientProvider client={new QueryClient()}>
					<TooltipProvider>
						<InlineModals>
							<NewIntakeForm
								clientName={C2.name}
								clientPicker={<span />}
								// Chosen under C1, before the picker moved to C2.
								engagementId={E1.id}
								engagements={undefined}
								pending={false}
								error={null}
								onSubmit={() => {}}
							/>
						</InlineModals>
					</TooltipProvider>
				</QueryClientProvider>
			</ApiProvider>,
		);
		expect(tagOf(html, "intake-new-submit")).toContain('disabled=""');
	});

	it("says why the clients could not be read, with a retry, instead of loading forever", () => {
		const { client: api } = fakeApi();
		// As after the retries ran out: mounting does not start another.
		const qc = new QueryClient({
			defaultOptions: { queries: { retryOnMount: false } },
		});
		const key = clientsQuery(api, undefined, "active").queryKey;
		qc.getQueryCache()
			.build(qc, { queryKey: key })
			.setState({
				status: "error",
				error: new ApiError({
					method: "GET",
					path: "/api/clients",
					kind: "unreachable",
				}),
				fetchStatus: "idle",
			} as never);
		const html = renderToString(
			<ApiProvider client={api}>
				<QueryClientProvider client={qc}>
					<TooltipProvider>
						<InlineModals>
							<NewMissionModal open onOpenChange={() => {}} />
						</InlineModals>
					</TooltipProvider>
				</QueryClientProvider>
			</ApiProvider>,
		);
		expect(html).toContain('data-testid="surface-error"');
		expect(html).not.toContain("mission-new-clients-loading");
	});

	it("draws the clients loading", () => {
		expect(render(null)).toContain('data-testid="mission-new-clients-loading"');
	});
});
