import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InlineModals } from "@/components/avel/action-modal";
import {
	EngagementEditForm,
	engagementEditBody,
} from "@/components/avel/engagement-form";
import { ClientIntakes } from "@/components/avel/intake-list";
import { NewIntakeForm, newIntakeBody } from "@/components/avel/intake-new";
import { Dialog } from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiProvider } from "@/lib/api";
import { createIntakeOptions } from "@/lib/api/intakes";
import { client, engagement, fakeApi } from "./clients-fixtures";
import { tagOf } from "./render-page";

/*
 * A new intake (POST /api/intakes) and an engagement's edit (PATCH
 * /api/engagements/:id): what each form sends, and when it holds Save.
 */

function render(node: ReactNode) {
	const qc = new QueryClient({
		defaultOptions: {
			queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
		},
	});
	return renderToString(
		<ApiProvider client={fakeApi().client}>
			<QueryClientProvider client={qc}>
				<TooltipProvider>
					<InlineModals>
						<Dialog open>{node}</Dialog>
					</InlineModals>
				</TooltipProvider>
			</QueryClientProvider>
		</ApiProvider>,
	);
}

const C = client(1);
const E1 = engagement(1, C.id);
const E2 = engagement(2, C.id);

const form = (props: Partial<Parameters<typeof NewIntakeForm>[0]> = {}) =>
	render(
		<NewIntakeForm
			clientName={C.name}
			engagements={[E1, E2]}
			pending={false}
			error={null}
			onSubmit={() => {}}
			{...props}
		/>,
	);

/** Whether the engagement's radio is the checked one. */
const checked = (html: string, id: string) =>
	tagOf(html, `intake-new-engagement-${id}`).includes('data-state="checked"');

describe("the new intake's body", () => {
	it("sends the trimmed source, and the questions only when there are any", () => {
		expect(newIntakeBody(E1.id, "  Booking app  ", " \n ")).toEqual({
			engagementId: E1.id,
			sourceMd: "Booking app",
		});
		expect(
			newIntakeBody(E1.id, "x", "Which provider?\n\nWhich provider?\nWhen?"),
		).toEqual({
			engagementId: E1.id,
			sourceMd: "x",
			openQuestions: ["Which provider?", "When?"],
		});
	});

	it("posts it to /api/intakes", async () => {
		const { client: api, calls } = fakeApi(() => ({
			status: 201,
			body: { success: true, data: {} },
		}));
		const options = createIntakeOptions(api, new QueryClient());
		await options
			.mutationFn({ engagementId: E1.id, sourceMd: "x" })
			.catch(() => {});
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			"POST http://avel.test/api/intakes",
		]);
		expect(calls[0]?.body).toEqual({ engagementId: E1.id, sourceMd: "x" });
	});
});

describe("the new intake form", () => {
	it("asks for the engagement, what the client asked for, and optional questions", () => {
		const html = form();
		expect(html).toContain("New intake");
		expect(tagOf(html, "intake-new-source")).toMatch(/^<textarea/);
		expect(tagOf(html, "intake-new-questions")).toMatch(/^<textarea/);
	});

	it("holds Create until an engagement is chosen, when there are several", () => {
		const html = form();
		expect(checked(html, E1.id)).toBe(false);
		expect(checked(html, E2.id)).toBe(false);
		expect(tagOf(html, "intake-new-submit")).toContain('disabled=""');
	});

	it("chooses the only engagement, or the one it was opened from", () => {
		const one = form({ engagements: [E1] });
		expect(checked(one, E1.id)).toBe(true);
		expect(tagOf(one, "intake-new-submit")).not.toContain('disabled=""');
		expect(checked(form({ engagementId: E2.id }), E2.id)).toBe(true);
	});

	it("with no active engagement, says to start one and holds Create", () => {
		const html = form({ engagements: [] });
		expect(html).toContain('data-testid="intake-new-no-engagement"');
		expect(tagOf(html, "intake-new-submit")).toContain('disabled=""');
	});

	it("draws the engagements loading", () => {
		expect(form({ engagements: undefined })).toContain(
			'data-testid="intake-new-engagements-loading"',
		);
	});
});

describe("the Intakes tab's New intake", () => {
	const tab = (over: Partial<typeof C>) =>
		render(<ClientIntakes client={{ ...C, ...over }} onNewIntake={() => {}} />);

	it("is offered under an active engagement", () => {
		expect(
			tagOf(tab({ activeEngagementCount: 1 }), "client-intakes-new"),
		).not.toContain('disabled=""');
	});

	it("is held, with why, without one or on a closed client", () => {
		expect(
			tagOf(tab({ activeEngagementCount: 0 }), "client-intakes-new"),
		).toContain('disabled=""');
		expect(
			tagOf(
				tab({ status: "closed", activeEngagementCount: 0 }),
				"client-intakes-new",
			),
		).toContain('disabled=""');
	});
});

describe("editing an engagement", () => {
	const before = { name: "Booking", scopeMd: "Online booking" };

	it("sends only what changed, and clears an emptied scope", () => {
		expect(engagementEditBody(before, " Booking ", "Online booking")).toEqual(
			{},
		);
		expect(engagementEditBody(before, "Booking v2", "Online booking")).toEqual({
			name: "Booking v2",
		});
		expect(engagementEditBody(before, "Booking", "  ")).toEqual({
			scopeMd: null,
		});
		expect(
			engagementEditBody({ ...before, scopeMd: null }, "Booking", ""),
		).toEqual({});
	});

	it("opens on the current name and scope, with Save held until something changes", () => {
		const html = render(
			<EngagementEditForm
				engagement={before}
				pending={false}
				error={null}
				onSubmit={() => {}}
			/>,
		);
		expect(tagOf(html, "engagement-edit-name")).toContain('value="Booking"');
		expect(html).toContain("Online booking");
		expect(tagOf(html, "engagement-edit-submit")).toContain('disabled=""');
	});
});
