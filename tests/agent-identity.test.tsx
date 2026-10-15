import { QueryClient } from "@tanstack/react-query";
import type {
	AgentTemplate,
	IdentityInputs,
	IdentityVersionSummary,
} from "avel-server/contract";
import { describe, expect, it, vi } from "vitest";
import {
	DiffBody,
	generatedByLabel,
	IdentityVersions,
	inputChanges,
	isPerson,
	lineDiff,
	overCapLine,
	PERSON_REASON,
	RegenerateIdentity,
	regenerateOutcome,
} from "@/components/avel/agent-identity";
import { ApiError } from "@/lib/api";
import { afterRegenerate, regenerateIdentityRequest } from "@/lib/api/catalog";
import { queryKeys } from "@/lib/api/keys";
import { describeError } from "@/lib/error-map";
import { agent, inProviders } from "./catalog-fixtures";
import { fakeApi } from "./clients-fixtures";
import { tagOf } from "./render-page";

/*
 * Module 5, step 5: Regenerate and the live identity versions. Writes can't
 * be checked live (no sign-in; the preview is GET-only), so each of
 * regenerate's answers is stubbed here, and the screens read seeded caches.
 */

const atlas = agent("atlas");
const ME = "00000000-0000-4000-8000-0000000000aa";

function summary(number: number, over: Partial<IdentityVersionSummary> = {}) {
	return {
		ref: `atlas@v${number}`,
		number,
		sha256: String(number).repeat(64).slice(0, 64),
		identityTokens: 400 + number,
		depthTokens: 100 + number,
		generatedBy: null,
		createdAt: `2026-10-1${number}T12:00:00.000Z`,
		...over,
	} satisfies IdentityVersionSummary;
}

const inputs = (over: Partial<IdentityInputs> = {}): IdentityInputs => ({
	generatorVersion: "1",
	slug: "atlas",
	name: "Atlas",
	kind: "feature",
	roles: ["domain"],
	writablePaths: ["src/server/**"],
	definitionsSha256: "a".repeat(64),
	skills: [],
	...over,
});

const ok = (status: number, data: unknown) => ({
	status,
	body: { success: true, data },
});

const refused = (status: number, error: Record<string, unknown>) => ({
	status,
	body: { success: false, error: { requestId: "req-1", ...error } },
});

describe("regenerate's answers", () => {
	it("posts to the template's regenerate route, with no body", async () => {
		const { client, calls } = fakeApi(() =>
			ok(201, { created: true, version: summary(4) }),
		);
		await regenerateIdentityRequest(client, atlas.id);
		expect(calls).toEqual([
			{
				method: "POST",
				path: `http://avel.test/api/agent-templates/${atlas.id}/identity/regenerate`,
				body: undefined,
			},
		]);
	});

	it("201: says it generated the ref, and refreshes the template and the log", async () => {
		const { client } = fakeApi(() =>
			ok(201, { created: true, version: summary(4) }),
		);
		const result = await regenerateIdentityRequest(client, atlas.id);
		expect(regenerateOutcome(result)).toBe("Generated atlas@v4");
		const queryClient = new QueryClient();
		const spy = vi.spyOn(queryClient, "invalidateQueries");
		await afterRegenerate(queryClient, result);
		expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([
			queryKeys.catalog.agentTemplatesAll(),
			queryKeys.activity.all(),
		]);
	});

	it("200 unchanged: says the identity already matches, and refreshes nothing", async () => {
		const { client } = fakeApi(() =>
			ok(200, { created: false, reused: false, version: summary(3) }),
		);
		const result = await regenerateIdentityRequest(client, atlas.id);
		expect(regenerateOutcome(result)).toBe(
			"No change: the identity already matches atlas@v3",
		);
		const queryClient = new QueryClient();
		const spy = vi.spyOn(queryClient, "invalidateQueries");
		await afterRegenerate(queryClient, result);
		expect(spy).not.toHaveBeenCalled();
	});

	it("200 reused: names the earlier version already in force, and refreshes nothing", async () => {
		const { client } = fakeApi(() =>
			ok(200, { created: false, reused: true, version: summary(2) }),
		);
		const result = await regenerateIdentityRequest(client, atlas.id);
		expect(regenerateOutcome(result)).toBe(
			"No change: the identity matches the earlier version atlas@v2, which is already in force.",
		);
		const queryClient = new QueryClient();
		const spy = vi.spyOn(queryClient, "invalidateQueries");
		await afterRegenerate(queryClient, result);
		expect(spy).not.toHaveBeenCalled();
	});

	it("422 over the cap: the error map's copy, and the file's size against the response's cap", async () => {
		const { client } = fakeApi(() =>
			refused(422, {
				code: "PRECONDITION_FAILED",
				message: "over",
				details: {
					reason: "identity_over_token_cap",
					file: "depth",
					tokens: 1350,
					cap: 1200,
				},
			}),
		);
		const error = await regenerateIdentityRequest(client, atlas.id).catch(
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(ApiError);
		expect(describeError(error as ApiError).what).toBe(
			"This agent's identity is longer than its token limit.",
		);
		expect(overCapLine(error)).toBe(
			"depth.md is 1,350 tokens; its limit is 1,200.",
		);
	});

	it("422 for a person: the error map says the operator has no identity", async () => {
		const { client } = fakeApi(() =>
			refused(422, {
				code: "PRECONDITION_FAILED",
				message: "person",
				details: { reason: "identity_role_unsupported" },
			}),
		);
		const error = await regenerateIdentityRequest(client, atlas.id).catch(
			(e: unknown) => e,
		);
		expect(describeError(error as ApiError).what).toBe(
			"The operator is a person, so it has no identity to generate.",
		);
		expect(overCapLine(error)).toBeNull();
	});

	it("401 in the preview: the normal signed-out copy, nothing about identities", async () => {
		const { client } = fakeApi(() =>
			refused(401, { code: "UNAUTHENTICATED", message: "no session" }),
		);
		const error = (await regenerateIdentityRequest(client, atlas.id).catch(
			(e: unknown) => e,
		)) as ApiError;
		expect(error.failure).toMatchObject({ code: "UNAUTHENTICATED" });
		expect(describeError(error).what).not.toMatch(/identity/i);
		expect(overCapLine(error)).toBeNull();
	});
});

describe("the Regenerate button", () => {
	const render = (a: AgentTemplate) =>
		inProviders(<RegenerateIdentity agent={a} />, new QueryClient());

	it("is offered for an agent, and held with its reason for the operator", () => {
		expect(isPerson(atlas)).toBe(false);
		const button = tagOf(render(atlas), "agent-identity-regenerate");
		expect(button).not.toMatch(/\sdisabled=""/);
		const operator = {
			...atlas,
			slug: "operator",
			roles: ["foundations"],
		} as AgentTemplate;
		expect(isPerson(operator)).toBe(true);
		const held = render(operator);
		expect(tagOf(held, "agent-identity-regenerate")).toMatch(/\sdisabled=""/);
		expect(held).toContain(PERSON_REASON);
	});

	it("reads Generate identity, as the primary button, until a first version exists", () => {
		expect(atlas.identityVersion).toBeNull();
		const first = render(atlas);
		const button = tagOf(first, "agent-identity-regenerate");
		expect(button).toContain('data-due="true"');
		expect(button).toContain('data-variant="default"');
		expect(first).toContain("Generate identity</button>");
		const current = render({
			...atlas,
			identityVersion: 1,
			identityStale: false,
		});
		const again = tagOf(current, "agent-identity-regenerate");
		expect(again).not.toContain("data-due");
		expect(again).toContain('data-variant="outline"');
		expect(current).toContain("Regenerate</button>");
		const stale = render({ ...atlas, identityVersion: 1, identityStale: true });
		expect(tagOf(stale, "agent-identity-regenerate")).toContain(
			'data-due="true"',
		);
	});
});

describe("the live versions", () => {
	const ROWS = [
		summary(3, { generatedBy: ME }),
		summary(2, { generatedBy: "00000000-0000-4000-8000-0000000000bb" }),
		summary(1),
	];
	const render = (a: AgentTemplate) => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(queryKeys.catalog.identityVersions(a.id), ROWS);
		return inProviders(<IdentityVersions agent={a} me={ME} />, queryClient);
	};

	it("lists every version newest first, with ref, hash, tokens, author and date", () => {
		const html = render({ ...atlas, identityVersion: 3 });
		const order = [
			...html.matchAll(/data-testid="agent-identity-version-(\d+)"/g),
		].map((m) => Number(m[1]));
		expect(order).toEqual([3, 2, 1]);
		for (const v of ROWS) {
			expect(html).toContain(`>${v.ref}<`);
			expect(
				tagOf(html, `agent-identity-version-${v.number}-sha`),
			).toBeTruthy();
			expect(html).toContain(`title="${v.sha256}"`);
			expect(html).toContain(`>${v.identityTokens} + ${v.depthTokens} tokens<`);
			expect(html).toContain(`>${v.createdAt.slice(0, 10)}<`);
		}
		const by = (n: number) =>
			html.match(
				new RegExp(
					`data-testid="agent-identity-version-${n}-by"[^>]*>([^<]+)<`,
				),
			)?.[1];
		expect([by(3), by(2), by(1)]).toEqual(["You", "An operator", "Seed"]);
	});

	it("marks the version in force, and only it", () => {
		const html = render({ ...atlas, identityVersion: 2 });
		expect(
			html.match(/data-testid="agent-identity-version-current"/g),
		).toHaveLength(1);
		expect(tagOf(html, "agent-identity-version-2")).toContain(
			'data-current="true"',
		);
		expect(render(atlas)).not.toContain("agent-identity-version-current");
	});

	it("holds Compare until two versions are chosen", () => {
		const html = render({ ...atlas, identityVersion: 3 });
		expect(tagOf(html, "agent-identity-compare")).toMatch(/\sdisabled=""/);
		expect(html).toContain("Choose two versions to compare.");
	});

	it("says when there are none", () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(queryKeys.catalog.identityVersions(atlas.id), []);
		const html = inProviders(
			<IdentityVersions agent={atlas} me={ME} />,
			queryClient,
		);
		expect(html).toContain('data-testid="agent-identity-versions-empty"');
	});
});

describe("a diff between two versions", () => {
	it("keeps the common lines and marks what was removed and added, in order", () => {
		expect(lineDiff("a\nb\nc", "a\nx\nc\nd")).toEqual([
			{ kind: "same", text: "a" },
			{ kind: "remove", text: "b" },
			{ kind: "add", text: "x" },
			{ kind: "same", text: "c" },
			{ kind: "add", text: "d" },
		]);
		expect(lineDiff("same", "same")).toEqual([{ kind: "same", text: "same" }]);
	});

	it("names the inputs that moved, in plain words", () => {
		const changes = inputChanges(
			inputs(),
			inputs({ roles: ["domain", "api-surface"], name: "Atlas Two" }),
		);
		expect(changes.map((c) => [c.label, c.from, c.to])).toEqual([
			["name", "Atlas", "Atlas Two"],
			["roles", "domain", "domain, api-surface"],
		]);
		expect(inputChanges(inputs(), inputs())).toEqual([]);
	});

	it("renders both files' changes and the moved inputs", () => {
		const html = inProviders(
			<DiffBody
				before={{ identityMd: "# A\nold", depthMd: "", inputs: inputs() }}
				after={{
					identityMd: "# A\nnew",
					depthMd: "",
					inputs: inputs({ roles: ["schema"] }),
				}}
			/>,
			new QueryClient(),
		);
		expect(html).toContain('data-kind="remove"');
		expect(html).toContain('data-kind="add"');
		expect(html).toContain("Removed: ");
		expect(tagOf(html, "agent-identity-diff-inputs")).toContain(
			'data-count="1"',
		);
	});
});

describe("who wrote a version", () => {
	it("reads Seed, You or An operator, never an id", () => {
		expect(generatedByLabel(null, ME)).toBe("Seed");
		expect(generatedByLabel(ME, ME)).toBe("You");
		expect(generatedByLabel("other", ME)).toBe("An operator");
		expect(generatedByLabel("other", undefined)).toBe("An operator");
	});
});
