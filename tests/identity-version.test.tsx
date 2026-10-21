import { QueryClient } from "@tanstack/react-query";
import {
	type IdentityVersion,
	identityVersionSchema,
} from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DispatchEvidence } from "@/components/avel/dispatch-evidence";
import {
	IdentityVersionBody,
	IdentityVersionSheet,
	lookupRef,
} from "@/components/avel/identity-version-sheet";
import { VersionChip } from "@/components/avel/version-chip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { identityVersionByRefQuery } from "@/lib/api/catalog";
import { queryKeys } from "@/lib/api/keys";
import { inProviders, notFoundError, seededClient } from "./catalog-fixtures";
import { fakeApi } from "./clients-fixtures";
import { tagOf } from "./render-page";
import { visibleText } from "./visible-text";

// The sheet portals in a browser; drawn in place so the server render shows it.
vi.mock("@/components/ui/sheet", () => import("./missions-sheet-inline"));

/*
 * An identity version opened where it is named (GET
 * /api/identity-versions/:ref): a dispatch's pinned version, a report's
 * version chip. Read by the recorded hash when there is one, since a sha
 * resolves even for a deleted agent; by slug@vN otherwise.
 */

const SHA = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

const VERSION: IdentityVersion = identityVersionSchema.parse({
	ref: "kel@v2",
	number: 2,
	sha256: SHA,
	identityTokens: 640,
	depthTokens: 210,
	generatedBy: null,
	createdAt: "2026-10-14T09:00:00.000Z",
	agentTemplateId: "a7a5a7a5-5eed-4000-8000-000000000001",
	identityMd: "# Kel\n\nYou build the booking flow.",
	depthMd: "## Depth\n\nRead the plan first.",
	inputs: {
		generatorVersion: "3",
		slug: "kel",
		name: "Kel",
		kind: "feature",
		roles: ["interface"],
		writablePaths: ["src/booking/**", "tests/booking/**"],
		definitionsSha256: "a".repeat(64),
		skills: [
			{
				id: "5c5c5c5c-5eed-4000-8000-000000000001",
				contentSha256: "b".repeat(64),
			},
		],
	},
});

describe("looking a version up", () => {
	it("prefers the recorded hash, then the display ref", () => {
		expect(lookupRef("kel@v2", SHA)).toBe(SHA);
		expect(lookupRef("kel@v2", null)).toBe("kel@v2");
		expect(lookupRef("kel@v2", undefined)).toBe("kel@v2");
		expect(lookupRef(null, null)).toBeNull();
	});

	it("reads GET /api/identity-versions/:ref, by hash or by slug@vN", async () => {
		const { client, calls } = fakeApi(() => ({
			status: 200,
			body: { success: true, data: VERSION },
		}));
		const qc = new QueryClient();
		expect(await qc.fetchQuery(identityVersionByRefQuery(client, SHA))).toEqual(
			VERSION,
		);
		await qc.fetchQuery(identityVersionByRefQuery(client, "kel@v2"));
		expect(calls.map((c) => [c.method, decodeURIComponent(c.path)])).toEqual([
			["GET", `http://avel.test/api/identity-versions/${SHA}`],
			["GET", "http://avel.test/api/identity-versions/kel@v2"],
		]);
	});

	it("never goes stale, and a regenerate reads it again", () => {
		expect(identityVersionByRefQuery(fakeApi().client, SHA).staleTime).toBe(
			Number.POSITIVE_INFINITY,
		);
		// Under agentTemplatesAll, which afterRegenerate invalidates: a slug@vN
		// that named nothing may name the new version.
		expect(queryKeys.catalog.identityVersionByRef(SHA).slice(0, 2)).toEqual(
			queryKeys.catalog.agentTemplatesAll(),
		);
	});
});

describe("what opens it", () => {
	const html = (node: React.ReactNode) =>
		renderToString(<TooltipProvider>{node}</TooltipProvider>);

	it("a version chip opens the version it names, by hash when it has one", () => {
		const chip = tagOf(
			html(
				<VersionChip
					versionRef="kel@v2"
					sha256={SHA}
					source="recorded"
					data-testid="chip"
				/>,
			),
			"chip-ref",
		);
		expect(chip).toContain('type="button"');
		expect(chip).toContain('aria-haspopup="dialog"');
		expect(chip).toContain(`data-lookup="${SHA}"`);
		expect(chip).toContain('aria-label="Open identity version kel@v2"');
		const byRef = tagOf(
			html(
				<VersionChip
					versionRef="kel@v2"
					source="recorded"
					data-testid="chip"
				/>,
			),
			"chip-ref",
		);
		expect(byRef).toContain('data-lookup="kel@v2"');
	});

	it("a rebuilt version still opens, and keeps its dashed edge and words", () => {
		const out = html(
			<VersionChip
				versionRef="kel@v2"
				source="reconstructed"
				data-testid="chip"
			/>,
		);
		expect(tagOf(out, "chip-ref")).toContain("border-dashed");
		expect(out).toContain('data-testid="chip-source"');
	});

	it("a chip with no ref has nothing to open", () => {
		const out = html(
			<VersionChip
				versionRef={null}
				sha256={SHA}
				source="recorded"
				data-testid="chip"
			/>,
		);
		expect(out).not.toContain('data-testid="chip-ref"');
	});

	it("a closed dispatch's evidence opens the version by its report's hash", () => {
		const out = html(
			<DispatchEvidence
				dispatch={{
					id: "d1",
					agent: {
						templateId: VERSION.agentTemplateId,
						slug: "kel",
						name: "Kel",
						title: null,
					},
				}}
				report={
					{
						status: "complete",
						haltReason: null,
						filedBy: "agent",
						filesTouched: 3,
						edgeMismatches: [],
						agentVersionRef: "kel@v2",
						agentVersionSha256: SHA,
						versionSource: "recorded",
					} as never
				}
			/>,
		);
		expect(tagOf(out, "dispatch-evidence-version-d1-ref")).toContain(
			`data-lookup="${SHA}"`,
		);
	});
});

describe("the identity version sheet", () => {
	it("shows who it is for, when, its inputs, and its text", () => {
		const qc = seededClient();
		qc.setQueryData(queryKeys.catalog.identityVersionByRef(SHA), VERSION);
		const out = inProviders(
			<IdentityVersionSheet lookup={SHA} label="kel@v2" onClose={() => {}} />,
			qc,
		);
		expect(tagOf(out, "identity-version-sheet")).toContain(
			'data-sheet-side="right"',
		);
		expect(tagOf(out, "identity-version-body")).toContain(
			'data-state="success"',
		);
		expect(tagOf(out, "identity-version-agent")).toContain(
			'href="/catalog/agents/kel"',
		);
		const text = visibleText(out);
		expect(text).toContain("kel@v2");
		expect(text).toContain("Seed");
		expect(text).toContain("interface");
		expect(text).toContain("src/booking/**, tests/booking/**");
		expect(text).toContain("You build the booking flow.");
		expect(text).toContain("Read the plan first.");
		expect(out).toContain('data-testid="identity-version-number"');
		// The hash shows short, the full value to screen readers and Copy.
		expect(out).toContain(`data-full="${SHA}"`);
	});

	it("loads in the text's shape, and says when nothing has the ref", () => {
		const loading = inProviders(
			<IdentityVersionBody lookup="kel@v9" />,
			seededClient(),
		);
		expect(tagOf(loading, "identity-version-body")).toContain(
			'data-state="loading"',
		);
		expect(loading).toContain('data-testid="identity-version-skeleton"');

		const qc = seededClient();
		qc.getQueryCache()
			.build(qc, { queryKey: queryKeys.catalog.identityVersionByRef("kel@v9") })
			.setState({
				status: "error",
				fetchStatus: "idle",
				error: notFoundError("/api/identity-versions/kel@v9"),
			});
		const gone = inProviders(<IdentityVersionBody lookup="kel@v9" />, qc);
		expect(tagOf(gone, "identity-version-body")).toContain(
			'data-state="error"',
		);
		expect(gone).toContain('data-testid="surface-error"');
	});
});
