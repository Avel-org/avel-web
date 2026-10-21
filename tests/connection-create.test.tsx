import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InlineModals } from "@/components/avel/action-modal";
import {
	type ConnectionDraft,
	ConnectionForm,
	connectionBodyOf,
	draftIssues,
	EMPTY_CONNECTION_DRAFT,
} from "@/components/avel/connection-create";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiProvider } from "@/lib/api";
import {
	afterConnectionCreated,
	createConnectionRequest,
} from "@/lib/api/connections";
import { queryKeys } from "@/lib/api/keys";
import { describeError } from "@/lib/error-map";
import { contractError, fakeApi } from "./clients-fixtures";
import { tagOf } from "./render-page";
import { visibleText } from "./visible-text";

/*
 * Add connection (POST /api/connections): what the form sends, what it
 * refuses before sending (the contract's own schema decides), and where a
 * refusal lands. A connection names the variable that holds its token, so
 * a pasted token is refused on the field, never sent.
 */

const ENG = "00000000-0000-4000-8000-0000000000e1";
const CLIENT = "00000000-0000-4000-8000-0000000000c1";

const valid: ConnectionDraft = {
	...EMPTY_CONNECTION_DRAFT,
	label: "  Meridian app ",
	clientId: CLIENT,
	engagementId: ENG,
	scopeValue: " meridian-co/app ",
	credentialRef: "MERIDIAN_GITHUB_TOKEN",
};

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
					<InlineModals>{node}</InlineModals>
				</TooltipProvider>
			</QueryClientProvider>
		</ApiProvider>,
	);
}

const noop = () => {};

describe("the body Add connection sends", () => {
	it("trims the name and scope, and sends the variable's name as typed", () => {
		expect(connectionBodyOf(valid)).toEqual({
			engagementId: ENG,
			label: "Meridian app",
			scopeType: "repo",
			scopeValue: "meridian-co/app",
			credentialRef: "MERIDIAN_GITHUB_TOKEN",
		});
	});

	it("sends no engagement for AVEL's own work, whatever was picked before", () => {
		expect(connectionBodyOf({ ...valid, for: "avel" }).engagementId).toBeNull();
	});

	it("sends an expiry as the day's start in UTC, and none when empty", () => {
		expect(connectionBodyOf({ ...valid, expires: "2027-01-31" })).toMatchObject(
			{ expiresAt: "2027-01-31T00:00:00.000Z" },
		);
		expect(connectionBodyOf(valid)).not.toHaveProperty("expiresAt");
	});

	it("posts it to /api/connections", async () => {
		const { client, calls } = fakeApi(() => ({
			status: 201,
			body: { success: true, data: {} },
		}));
		await createConnectionRequest(client, connectionBodyOf(valid)).catch(
			() => {},
		);
		expect(calls).toEqual([
			{
				method: "POST",
				path: "http://avel.test/api/connections",
				body: connectionBodyOf(valid),
			},
		]);
	});

	it("refreshes every connections read and the log once it lands", async () => {
		const queryClient = new QueryClient();
		const spy = vi.spyOn(queryClient, "invalidateQueries");
		await afterConnectionCreated(queryClient);
		expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([
			queryKeys.connections.all(),
			queryKeys.activity.all(),
		]);
	});
});

describe("what the form refuses before sending", () => {
	it("passes a valid draft", () => {
		expect(draftIssues(valid)).toEqual({});
		expect(draftIssues({ ...valid, for: "avel", engagementId: "" })).toEqual(
			{},
		);
	});

	it("names every missing field in its own words", () => {
		expect(draftIssues(EMPTY_CONNECTION_DRAFT)).toEqual({
			label: "Give it a name of 1 to 200 characters.",
			engagementId: "Choose the engagement it is for.",
			scopeValue: "Give owner/repo, such as meridian-co/app.",
			credentialRef:
				"Give the name of an environment variable (for example MERIDIAN_GITHUB_TOKEN), never a token",
		});
	});

	it("refuses a pasted token on the credential field", () => {
		for (const token of [
			"ghp_16C7e42F292c6912E7710c838347Ae178B4a",
			"github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz",
			"meridian_github_token",
		]) {
			expect(draftIssues({ ...valid, credentialRef: token })).toEqual({
				credentialRef: expect.stringContaining("never a token"),
			});
		}
	});

	it("holds a scope to its type, in the contract's words", () => {
		expect(
			draftIssues({
				...valid,
				scopeType: "owner",
				scopeValue: "meridian-co/app",
			}),
		).toEqual({
			scopeValue: "An owner scope is one GitHub owner: meridian-co",
		});
		expect(draftIssues({ ...valid, scopeValue: "meridian-co" })).toEqual({
			scopeValue: "A repo scope is owner/repo: meridian-co/app",
		});
	});
});

describe("the Add connection form", () => {
	it("explains the token variable plainly in its hint", () => {
		const html = render(
			<ConnectionForm pending={false} error={null} onSubmit={noop} />,
		);
		expect(tagOf(html, "connection-form")).toContain('data-size="form"');
		expect(visibleText(html)).toContain("Add connection");
		expect(html).toContain(
			"The name of the environment variable on the server that holds the token. Never the token itself.",
		);
		// The credential is machine text, never spell-checked or autofilled.
		const credential = tagOf(html, "connection-form-credential");
		expect(credential).toContain('spellCheck="false"');
		expect(credential).toContain('autoComplete="off"');
		expect(credential).toContain('placeholder="MERIDIAN_GITHUB_TOKEN"');
	});

	it("asks for the client and engagement only when it is for one", () => {
		const forEngagement = render(
			<ConnectionForm pending={false} error={null} onSubmit={noop} />,
		);
		expect(forEngagement).toContain('data-testid="connection-form-client"');
		expect(forEngagement).toContain('data-testid="connection-form-engagement"');
		const forAvel = render(
			<ConnectionForm
				initial={{ ...EMPTY_CONNECTION_DRAFT, for: "avel" }}
				pending={false}
				error={null}
				onSubmit={noop}
			/>,
		);
		expect(forAvel).not.toContain('data-testid="connection-form-client"');
		expect(forAvel).not.toContain('data-testid="connection-form-engagement"');
	});

	it("labels the scope field by its type", () => {
		const owner = render(
			<ConnectionForm
				initial={{ ...EMPTY_CONNECTION_DRAFT, scopeType: "owner" }}
				pending={false}
				error={null}
				onSubmit={noop}
			/>,
		);
		expect(tagOf(owner, "connection-form-scope-value")).toContain(
			'placeholder="meridian-co"',
		);
	});

	it("puts a refused field's issue on that field", () => {
		const error = contractError(400, "VALIDATION_FAILED", {
			body: [
				{
					path: ["credentialRef"],
					message: "Give the name of an environment variable, never a token",
				},
			],
		});
		const html = render(
			<ConnectionForm pending={false} error={error} onSubmit={noop} />,
		);
		expect(tagOf(html, "connection-form-credential")).toContain(
			'aria-invalid="true"',
		);
		expect(html).toContain('data-testid="connection-form-credential-error"');
		expect(visibleText(html)).toContain("Check the fields marked above.");
	});

	it("says what a closed engagement means, in the error map's words", () => {
		const error = contractError(422, "PRECONDITION_FAILED", {
			reason: "engagement_closed",
		});
		const html = render(
			<ConnectionForm
				initial={valid}
				pending={false}
				error={error}
				onSubmit={noop}
			/>,
		);
		expect(html).toContain('data-testid="action-modal-refusal"');
		expect(visibleText(html)).toContain(
			describeError(error).what.replaceAll("'", "&#x27;"),
		);
	});
});
