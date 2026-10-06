import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Client, Engagement } from "avel-server/contract";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClientForm } from "@/components/avel/client-form";
import { ClientStatusConfirm } from "@/components/avel/client-status-dialog";
import { EngagementCloseConfirm } from "@/components/avel/engagement-close";
import { EngagementForm } from "@/components/avel/engagement-form";
import { EngagementList } from "@/components/avel/engagement-list";
import { Dialog } from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiProvider } from "@/lib/api";
import { ENGAGEMENTS_PAGE_SIZE, type Page } from "@/lib/api/clients";
import { queryKeys } from "@/lib/api/keys";
import { PRECONDITION_COPY } from "@/lib/error-map";
import { client, contractError, engagement, fakeApi } from "./clients-fixtures";
import { countText, tagOf, tagWithId, textOfId } from "./render-page";

/** Text as React's server renderer escapes it, for copy with apostrophes. */
const escaped = (text: string) => text.replaceAll("'", "&#x27;");

/**
 * Renders inside the real ApiProvider (with an API client that fails the test
 * on any request) and a QueryClient seeded with exactly the data a case needs.
 * The confirmations are rendered as their dialogs' contents, outside the
 * portal, which server rendering does not draw.
 * Server rendering never fetches, so the seed is the whole world.
 */
function render(node: ReactNode, seed: (qc: QueryClient) => void = () => {}) {
	const qc = new QueryClient({
		defaultOptions: {
			queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
		},
	});
	seed(qc);
	return renderToString(
		<ApiProvider client={fakeApi().client}>
			<QueryClientProvider client={qc}>
				<TooltipProvider>
					{/* Dialog parts need a Dialog's context. The root renders nothing
					    itself, so it changes no other case's markup. */}
					<Dialog open>{node}</Dialog>
				</TooltipProvider>
			</QueryClientProvider>
		</ApiProvider>,
	);
}

const pages = <T,>(...list: Page<T>[]) => ({
	pages: list,
	pageParams: list.map((_, i) => (i === 0 ? undefined : `c${i}`)),
});

/** Seeds one client's engagements, all of them or the active ones only. */
const seedEngagements =
	(c: Client, rows: Engagement[], status?: "active") => (qc: QueryClient) =>
		qc.setQueryData(
			queryKeys.engagements.byClient(c.id, ENGAGEMENTS_PAGE_SIZE, status),
			pages({ data: rows, meta: { nextCursor: null } }),
		);

const engagements = (
	c: Client,
	seed?: (qc: QueryClient) => void,
	activeOnly = false,
) =>
	render(
		<EngagementList
			client={c}
			activeOnly={activeOnly}
			onShowAll={() => {}}
			onNewEngagement={() => {}}
			onCloseEngagement={() => {}}
		/>,
		seed,
	);

describe("a client's engagements", () => {
	const one = client(1);

	it("load quietly until they arrive", () => {
		expect(tagOf(engagements(one), `engagements-${one.id}`)).toContain(
			'data-state="loading"',
		);
	});

	it("show name, status, start date and actions once loaded", () => {
		const e = engagement(1, one.id);
		const html = engagements(one, seedEngagements(one, [e]));
		const row = html.slice(html.indexOf(`data-testid="engagement-${e.id}"`));
		expect(row).toContain(">Engagement 1<");
		expect(tagOf(row, `engagement-status-${e.id}`)).toContain(
			'data-tone="pass"',
		);
		expect(row).toMatch(
			/type-mono-small[^>]*>.*<time datetime="2026-09-01T00:00:00.000Z">2026-09-01<\/time>/i,
		);
		expect(tagOf(row, `engagement-menu-${e.id}`)).toContain(
			'aria-label="Actions for Engagement 1"',
		);
	});

	it("offer a new engagement when there are none, refused with its reason for a closed client", () => {
		const closed = client(3, { status: "closed" });
		const open = engagements(one, seedEngagements(one, []));
		expect(tagOf(open, `engagement-new-${one.id}`)).not.toMatch(
			/\sdisabled=""/,
		);
		const refusedHtml = engagements(closed, seedEngagements(closed, []));
		const refused = tagOf(refusedHtml, `engagement-new-${closed.id}`);
		expect(refused).toMatch(/\sdisabled=""/);
		const id = refused.match(/aria-describedby="([^"]+)"/)?.[1] ?? "";
		expect(textOfId(refusedHtml, id)).toBe(
			"Reopen the client to add an engagement.",
		);
	});
});

describe("showing only active engagements", () => {
	const one = client(1);

	it("reads the active-only list from its own query, and says so", () => {
		const active = engagement(1, one.id);
		const html = engagements(
			one,
			seedEngagements(one, [active], "active"),
			true,
		);
		expect(tagOf(html, `engagements-${one.id}`)).toContain(
			'data-state="success"',
		);
		expect(html).toContain(`data-testid="engagement-${active.id}"`);
		expect(html).toContain("Showing active engagements only.");
		expect(html).toContain(`data-testid="engagements-show-all-${one.id}"`);
	});

	it("does not read the active-only list when showing all", () => {
		// Only the active-only entry is seeded: the full list is still loading.
		const html = engagements(
			one,
			seedEngagements(one, [engagement(1, one.id)], "active"),
		);
		expect(tagOf(html, `engagements-${one.id}`)).toContain(
			'data-state="loading"',
		);
		expect(html).not.toContain(`engagements-filter-${one.id}`);
	});

	it("says there are none active, rather than none at all", () => {
		const html = engagements(one, seedEngagements(one, [], "active"), true);
		expect(html).toContain("No active engagements.");
		expect(html).not.toContain("No engagements yet.");
	});
});

describe("the client form", () => {
	const form = (props: Partial<Parameters<typeof ClientForm>[0]> = {}) =>
		render(
			<ClientForm
				pending={false}
				error={null}
				onSubmit={() => {}}
				{...props}
			/>,
		);

	it("labels every field and marks the optional ones", () => {
		const html = form();
		for (const id of [
			"client-form-name",
			"client-form-contact",
			"client-form-notes",
		]) {
			const control = tagOf(html, id);
			const inputId = control.match(/\sid="([^"]+)"/)?.[1];
			expect(html).toContain(`for="${inputId}"`);
		}
		expect(tagOf(html, "client-form-notes")).toMatch(/^<textarea/);
		expect(html.match(/>Optional</g)).toHaveLength(2);
		expect(html).toMatch(/data-testid="client-form-submit"[^>]*>Add client</);
	});

	it("in edit mode, holds Save until something changes, saying why", () => {
		const html = form({ client: client(1) });
		expect(tagOf(html, "client-form-name")).toContain('value="Client 1"');
		const save = tagOf(html, "client-form-submit");
		expect(save).toMatch(/\sdisabled=""/);
		const id = save.match(/aria-describedby="([^"]+)"/)?.[1] ?? "";
		expect(textOfId(html, id)).toBe("Nothing has changed yet.");
	});

	it("puts server validation errors on their fields, linked and marked invalid", () => {
		const html = form({
			error: contractError(400, "VALIDATION_FAILED", {
				body: [{ path: ["name"], message: "too short" }],
			}),
		});
		const name = tagOf(html, "client-form-name");
		expect(name).toContain('aria-invalid="true"');
		const id = name.match(/aria-describedby="([^"]+)"/)?.[1] ?? "";
		expect(textOfId(html, id)).toBe("Give it a name of 1 to 200 characters.");
		// The attribute, not the primitive's aria-invalid: class variant.
		expect(tagOf(html, "client-form-contact")).not.toMatch(/saria-invalid="/);
		expect(html).toMatch(
			/data-testid="form-error"[^>]*>.*Check the fields marked above/s,
		);
		expect(html).not.toContain("too short");
	});

	it("explains any other failure with the error map's copy", () => {
		const html = form({ error: contractError(409, "CONFLICT") });
		expect(tagOf(html, "form-error")).toContain('role="alert"');
		expect(html).toContain(
			"This conflicts with the current state on the server.",
		);
		expect(html).not.toContain("server message, never shown");
	});
});

describe("the engagement form", () => {
	const form = (error: Parameters<typeof EngagementForm>[0]["error"] = null) =>
		render(
			<EngagementForm
				clientId={client(1).id}
				today="2026-10-05"
				pending={false}
				error={error}
				onSubmit={() => {}}
			/>,
		);

	it("asks for a name, an optional scope, and a start date defaulting to today", () => {
		const html = form();
		expect(tagOf(html, "engagement-form-name")).toMatch(/^<input/);
		expect(tagOf(html, "engagement-form-scope")).toMatch(/^<textarea/);
		const started = tagOf(html, "engagement-form-started");
		expect(started).toContain('type="date"');
		expect(started).toContain('value="2026-10-05"');
	});

	it("says plainly when the client is closed or gone", () => {
		expect(
			form(
				contractError(422, "PRECONDITION_FAILED", { reason: "client_closed" }),
			),
		).toContain(escaped(PRECONDITION_COPY.client_closed.what));
		expect(
			form(
				contractError(422, "PRECONDITION_FAILED", {
					reason: "client_not_found",
				}),
			),
		).toContain(escaped(PRECONDITION_COPY.client_not_found.what));
		// Never the error map's pre-flight copy for these.
		expect(
			form(
				contractError(422, "PRECONDITION_FAILED", { reason: "client_closed" }),
			),
		).not.toContain("pre-flight");
	});
});

describe("closing an engagement", () => {
	const html = render(
		<EngagementCloseConfirm
			name="Engagement 1"
			pending={false}
			error={null}
			onConfirm={() => {}}
		/>,
	);

	it("says it revokes the connections and cannot be undone", () => {
		const consequence = html.slice(
			html.indexOf('data-testid="engagement-close-consequence"'),
		);
		expect(consequence).toMatch(/revokes its connections/);
		expect(consequence).toMatch(/cannot be undone/);
	});

	it("is a held destructive action, not a click", () => {
		const confirm = tagOf(html, "engagement-close-confirm");
		expect(confirm).toContain('data-variant="destructive"');
		const inner = html.slice(
			html.indexOf('data-testid="engagement-close-confirm"'),
		);
		expect(inner).toMatch(/data-slot="button-hold-fill"/);
		expect(inner).toContain("press and hold to confirm");
		expect(html).toContain('data-testid="engagement-close-cancel"');
	});
});

describe("closing a client", () => {
	const c = client(1, { activeEngagementCount: 2 });
	const confirm = (error: Parameters<typeof ClientStatusConfirm>[0]["error"]) =>
		render(
			<ClientStatusConfirm
				client={c}
				to="closed"
				pending={false}
				error={error}
				onConfirm={() => {}}
				onShowEngagements={() => {}}
			/>,
		);

	it("asks first, and says engagements are not closed for you", () => {
		const html = confirm(null);
		expect(html).toContain("Its engagements are not closed for you");
		expect(tagOf(html, "client-status-confirm")).not.toMatch(/\sdisabled=""/);
		expect(tagOf(html, "client-status-confirm")).toContain(
			'data-variant="destructive"',
		);
	});

	it("when refused for active engagements, names the count and offers to show them", () => {
		const html = confirm(
			contractError(422, "PRECONDITION_FAILED", {
				reason: "client_has_active_engagements",
			}),
		);
		// The error map's words, plus the count only this screen knows.
		expect(html).toContain(
			escaped(PRECONDITION_COPY.client_has_active_engagements.what),
		);
		expect(html).toContain(
			escaped(PRECONDITION_COPY.client_has_active_engagements.next),
		);
		expect(html).toMatch(
			/data-testid="form-error-count"[^>]*>2 engagements are active.</,
		);
		expect(html).toContain('data-testid="client-status-show-engagements"');
		const button = tagOf(html, "client-status-confirm");
		expect(button).toMatch(/\sdisabled=""/);
		const id = button.match(/aria-describedby="([^"]+)"/)?.[1] ?? "";
		expect(tagWithId(html, id)).toMatch(/class="sr-only"/);
		expect(countText(html, "Close its active engagements first.")).toBe(1);
	});

	it("reopens as a plain, non-destructive action", () => {
		const html = render(
			<ClientStatusConfirm
				client={client(1, { status: "closed" })}
				to="active"
				pending={false}
				error={null}
				onConfirm={() => {}}
				onShowEngagements={() => {}}
			/>,
		);
		expect(html).toMatch(
			/data-testid="client-status-confirm"[^>]*>Reopen client</,
		);
		expect(tagOf(html, "client-status-confirm")).toContain(
			'data-variant="default"',
		);
	});
});
