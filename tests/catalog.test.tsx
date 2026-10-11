import { ROLES } from "avel-server/contract";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { InlineModals } from "@/components/avel/action-modal";
import {
	agentsOfSkill,
	attachability,
	CATALOG_MISSING,
	carryingRoles,
	enforcementBadge,
	SAMPLE_ROLE_ATTACHMENTS,
	SAMPLE_ROLE_FAMILY,
	sampleHistory,
	sampleRegistry,
	sampleRoleAttachments,
	sampleSha256,
	sampleUuid,
	skillsOfAgent,
} from "@/components/avel/catalog-placeholders";
import {
	filterSkills,
	SourceSkills,
} from "@/components/avel/catalog-source-detail";
import { SourceForm } from "@/components/avel/catalog-source-form";
import {
	RemoveSourceConfirm,
	removeHeldReason,
	skillsFromLine,
} from "@/components/avel/catalog-source-remove";
import { layerShares } from "@/components/avel/catalog-source-shelf";
import {
	CATALOG_PAGE_SIZE,
	changedSourceFields,
	sourceBodyOf,
	sourceDraftOf,
	sourceProblems,
} from "@/lib/api/catalog";
import { queryKeys } from "@/lib/api/keys";
import { PRECONDITION_COPY } from "@/lib/error-map";
import {
	AGENTS,
	CONNECTIONS,
	inProviders,
	internalError,
	renderSeeded,
	type Seed,
	SKILLS,
	SOURCES,
	seededClient,
	source,
} from "./catalog-fixtures";
import { contractError } from "./clients-fixtures";
import { renderPage, tagOf } from "./render-page";

/*
 * The catalog's shared rules and /catalog/sources. The sources are live
 * (GET /api/skill-sources), so the page is rendered through the real router
 * with a seeded QueryClient, in each of its four states. What is still a
 * sample (catalog-placeholders.ts) keys off live records and is tested as
 * pure functions of them.
 */

// ---------------------------------------------------------------------------
// Markup helpers. The node environment has no DOM; tests read the markup.

/** One element from its opening tag to its matching close, by start index. */
function elementAt(html: string, start: number): string {
	const tag = /^<([a-z0-9]+)/.exec(html.slice(start))?.[1] ?? "";
	const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
	re.lastIndex = start;
	let depth = 0;
	for (let m = re.exec(html); m; m = re.exec(html)) {
		depth += m[0].startsWith("</") ? -1 : 1;
		if (depth === 0) return html.slice(start, re.lastIndex);
	}
	throw new Error(`unclosed element at ${start}`);
}

/** One element by test id. */
function element(html: string, testid: string): string {
	const at = html.indexOf(`data-testid="${testid}"`);
	expect(at, testid).toBeGreaterThan(-1);
	return elementAt(html, html.lastIndexOf("<", at));
}

const SOURCES_PATH = "/api/skill-sources";

// ---------------------------------------------------------------------------
// The samples that remain: pure functions of live records.

describe("catalog samples", () => {
	it("name no route avel-server serves: the lists are live", () => {
		const values = Object.values(CATALOG_MISSING);
		expect(values).toHaveLength(5);
		for (const missing of values) {
			expect(missing).not.toMatch(
				/^GET \/api\/(agent-templates|skills|skill-sources)(\/by-slug)?$/,
			);
			expect(missing).not.toMatch(/^GET \/api\/skills\/by-slug/);
		}
		// Only module 5's attachment read is named as a route at all.
		expect(values.filter((m) => m.startsWith("GET "))).toEqual([
			CATALOG_MISSING.roleAttachments,
		]);
	});

	it("are deterministic: the same key always gives the same value", () => {
		expect(sampleSha256("x")).toBe(sampleSha256("x"));
		expect(sampleSha256("x")).not.toBe(sampleSha256("y"));
		expect(sampleSha256("x")).toMatch(/^[0-9a-f]{64}$/);
		expect(sampleUuid("a")).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
		);
	});

	it("give every version its own hash, in SHA-256's shape, keyed by the live slug", () => {
		const hashes = AGENTS.flatMap((a) =>
			sampleHistory(a).versions.map((v) => v.sha256),
		);
		for (const hash of hashes) expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(new Set(hashes).size).toBe(hashes.length);
		for (const a of AGENTS) {
			expect(sampleHistory(a)).toEqual(sampleHistory({ ...a }));
		}
	});

	it("number versions newest first, down to 1, from the live version, under the token cap", () => {
		for (const a of AGENTS) {
			const history = sampleHistory(a);
			expect(history.versions.map((v) => v.version)).toEqual(
				Array.from({ length: a.version }, (_, i) => a.version - i),
			);
			expect(history.identityTokens).toBeLessThanOrEqual(800);
			// A horizontal agent works the whole project; a feature agent has a territory.
			for (const row of history.outcomes) {
				if (a.kind === "horizontal") expect(row.territory).toBeNull();
				else expect(row.territory).not.toBeNull();
			}
		}
	});

	it("never let a draft or retired skill be attached", () => {
		for (const s of SKILLS) {
			expect(attachability(s).attachable).toBe(s.status === "approved");
		}
		const imported = SKILLS.find((s) => s.slug === "database-read");
		expect(imported?.status).toBe("draft");
		expect(imported && attachability(imported)).toEqual({
			attachable: false,
			reason:
				"An imported draft can't be attached until it is reviewed and approved.",
		});
	});

	it("never let a badge claim enforcement no room provides", () => {
		expect(enforcementBadge("capability", false)).toEqual({
			label: "Not enforced: no room is running",
			enforced: false,
		});
		expect(enforcementBadge("capability", true).enforced).toBe(true);
		expect(enforcementBadge("knowledge", true).enforced).toBe(false);
	});

	it("cross-link both ways over the live lists: an agent carries a skill when the skill names it", () => {
		for (const s of SKILLS) {
			for (const a of AGENTS) {
				const { role, dispatch } = skillsOfAgent(a, SKILLS);
				const carries = [...role, ...dispatch].includes(s);
				expect(agentsOfSkill(s, AGENTS).includes(a)).toBe(carries);
			}
		}
		const atlas = AGENTS.find((a) => a.slug === "atlas");
		expect(atlas).toBeDefined();
		if (!atlas) return;
		const { role, dispatch } = skillsOfAgent(atlas, SKILLS);
		expect(role.every((s) => s.layer === "role")).toBe(true);
		expect(dispatch.every((s) => s.layer !== "role")).toBe(true);
		// Nothing carries anything when there is nothing to carry.
		for (const s of SKILLS) expect(agentsOfSkill(s, [])).toEqual([]);
		expect(skillsOfAgent(atlas, [])).toEqual({ role: [], dispatch: [] });
	});

	it("attach a role skill by its slug: the named set, or a fixed pick for a new slug", () => {
		for (const [slug, roles] of Object.entries(SAMPLE_ROLE_ATTACHMENTS)) {
			expect(sampleRoleAttachments(slug)).toBe(roles);
		}
		const picked = sampleRoleAttachments("a-skill-the-seed-never-named");
		expect(picked.length).toBeGreaterThanOrEqual(1);
		expect(picked.length).toBeLessThanOrEqual(2);
		expect(picked).toEqual(
			sampleRoleAttachments("a-skill-the-seed-never-named"),
		);
		for (const role of picked) {
			expect(ROLES).toContain(role);
			// Platform roles are code: nothing attaches to them.
			expect(SAMPLE_ROLE_FAMILY[role]).not.toBe("Platform");
		}
		expect(sampleRoleAttachments("another-slug")).not.toEqual(picked);
		// A stack or domain skill's carriers are live: its recommendedFor.
		const stack = SKILLS.find((s) => s.layer === "stack");
		expect(stack && carryingRoles(stack)).toBe(stack?.recommendedFor);
	});

	it("index only vendor and community sources, two or three hashed entries each, keyed by id", () => {
		const entries = sampleRegistry(SOURCES);
		const internal = source("internal");
		expect(entries.some((e) => e.sourceId === internal.id)).toBe(false);
		for (const s of SOURCES.filter((s) => s.kind !== "internal")) {
			const own = entries.filter((e) => e.sourceId === s.id);
			expect(own.length, s.name).toBeGreaterThanOrEqual(2);
			expect(own.length, s.name).toBeLessThanOrEqual(3);
			for (const e of own) {
				expect(e.contentSha256).toMatch(/^[0-9a-f]{64}$/);
				expect(e.path.startsWith(`${s.kind}/skills/`)).toBe(true);
			}
		}
		expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
		expect(sampleRegistry(SOURCES)).toEqual(entries);
		expect(sampleRegistry([internal])).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// /catalog/sources: the shelf first, the table second, and the source writes.

/** What the shelf reads beside the list: kind counts and each tile's layer counts. */
function shelfClient(
	sources: Seed["sources"],
	layers: Record<string, [number, number, number]> = {},
) {
	const client = seededClient({ sources });
	for (const kind of ["internal", "vendor", "community"] as const) {
		client.setQueryData(
			queryKeys.catalog.skillSourceCount(kind),
			SOURCES.filter((s) => s.kind === kind).length,
		);
	}
	for (const [id, [role, stack, domain]] of Object.entries(layers)) {
		client.setQueryData(queryKeys.catalog.sourceLayerCount(id, "role"), role);
		client.setQueryData(queryKeys.catalog.sourceLayerCount(id, "stack"), stack);
		client.setQueryData(
			queryKeys.catalog.sourceLayerCount(id, "domain"),
			domain,
		);
	}
	return client;
}

describe("/catalog/sources", () => {
	it("loads the shelf: a skeleton, no sample pill, no not-built state", async () => {
		const html = await renderPage("/catalog/sources");
		expect(tagOf(html, "catalog-sources-surface")).toContain(
			'data-state="loading"',
		);
		expect(html).toContain('data-testid="catalog-sources-skeleton"');
		expect(tagOf(html, "catalog-sources-view-shelf")).toContain(
			'aria-pressed="true"',
		);
		expect(html).not.toContain('data-state="not-built"');
		expect(html).not.toContain('data-testid="sample-data"');
		expect(html).toContain('data-testid="topbar-definition"');
	});

	it("puts every live source on a tile: kind, name, skill count and address", async () => {
		const html = await renderSeeded("/catalog/sources", shelfClient(SOURCES));
		expect(tagOf(html, "catalog-sources-surface")).toContain(
			'data-state="success"',
		);
		expect(tagOf(html, "source-tiles")).toMatch(/\bstagger-in\b/);
		for (const s of SOURCES) {
			const tile = element(html, `source-tile-${s.id}`);
			expect(tagOf(tile, `source-tile-${s.id}`)).toMatch(
				/\bplate-interactive\b/,
			);
			expect(tile).toContain(s.name);
			expect(element(tile, `source-skill-count-${s.id}`)).toContain(
				`>${s.skillCount}<`,
			);
			if (s.url) {
				expect(tagOf(tile, `source-url-${s.id}`)).toContain(`href="${s.url}"`);
			}
		}
	});

	it("counts each kind tab from the server's total", async () => {
		const html = await renderSeeded("/catalog/sources", shelfClient(SOURCES));
		for (const kind of ["internal", "vendor", "community"] as const) {
			const count = SOURCES.filter((s) => s.kind === kind).length;
			expect(element(html, `source-kind-${kind}-count`)).toContain(
				`>${count}<`,
			);
		}
		expect(tagOf(html, "source-kind-all")).toContain('aria-pressed="true"');
	});

	it("draws a tile's layer bar from its three counts, waiting until all are in", async () => {
		const s = source("vendor");
		const html = await renderSeeded(
			"/catalog/sources",
			shelfClient(SOURCES, { [s.id]: [1, 2, 0] }),
		);
		const bar = element(html, `source-layers-${s.id}`);
		expect(bar).toMatch(/data-layer="role" data-count="1"/);
		expect(bar).toMatch(/data-layer="stack" data-count="2"/);
		expect(bar).not.toContain('data-layer="domain"');
		// Each segment grows in, only where motion is allowed.
		expect(
			bar.match(/data-layer="[a-z]+"[^>]*class="[^"]*motion-safe:grow-x/g),
		).toHaveLength(2);
		// Another tile has no counts yet: a skeleton, never a guessed bar.
		const other = source("internal");
		expect(html).toContain(`data-testid="source-layers-loading-${other.id}"`);
	});

	it("counts from meta.total in the top bar, never from the rows loaded", async () => {
		const html = await renderSeeded(
			"/catalog/sources",
			shelfClient({ rows: SOURCES, total: 12, nextCursor: "c2" }),
		);
		expect(element(html, "topbar-subtitle")).toContain(">12 sources<");
		expect(element(html, "catalog-sources-list-footer-showing")).toContain(
			`>Showing ${SOURCES.length} of 12<`,
		);
		const one = await renderSeeded(
			"/catalog/sources",
			shelfClient([source("internal")]),
		);
		expect(element(one, "topbar-subtitle")).toContain(">1 source<");
	});

	it("says when there are none, with Add source live", async () => {
		const html = await renderSeeded("/catalog/sources", shelfClient([]));
		expect(tagOf(html, "catalog-sources-surface")).toContain(
			'data-state="empty"',
		);
		expect(
			html.match(/data-testid="empty-state-description"[^>]*>([^<]+)</)?.[1],
		).not.toMatch(/contract|avel-server|not built|yet\b|route/i);
		expect(tagOf(html, "catalog-sources-empty-add")).not.toMatch(
			/\sdisabled=""/,
		);
		expect(tagOf(html, "catalog-sources-add")).not.toMatch(/\sdisabled=""/);
	});

	it("shows the error state when the list fails, and keeps Add source live", async () => {
		const html = await renderSeeded(
			"/catalog/sources",
			seededClient({ sources: internalError(SOURCES_PATH) }),
		);
		expect(tagOf(html, "catalog-sources-surface")).toContain(
			'data-state="error"',
		);
		expect(html).toContain('data-testid="surface-error"');
		expect(tagOf(html, "catalog-sources-add")).not.toMatch(/\sdisabled=""/);
	});

	it("keeps the table as the second view: kind as a word, None kept out of mono", async () => {
		const html = await renderSeeded(
			"/catalog/sources?view=table",
			seededClient({ sources: SOURCES }),
		);
		expect(tagOf(html, "catalog-sources-view-table")).toContain(
			'aria-pressed="true"',
		);
		expect(tagOf(html, "catalog-source-kind")).toContain(
			'data-variant="outline"',
		);
		const table = element(html, "catalog-sources-table");
		const internal = source("internal");
		const none = element(table, `catalog-sources-table-row-${internal.id}`);
		expect(none).toMatch(/<span class="text-text-subtle">None<\/span>/);
	});

	it("keeps the dev seed's shape: the fixtures are what the server would send", () => {
		expect(CONNECTIONS).toHaveLength(5);
		expect(AGENTS.length).toBeGreaterThanOrEqual(5);
	});
});

describe("a source's layer bar", () => {
	it("waits for every count, and says nothing when there are no skills", () => {
		expect(layerShares({ role: 1, stack: undefined, domain: 0 })).toBeNull();
		expect(layerShares({ role: 1, stack: null, domain: 0 })).toBeNull();
		expect(layerShares({ role: 0, stack: 0, domain: 0 })).toEqual([]);
		const shares = layerShares({ role: 1, stack: 3, domain: 0 }) ?? [];
		expect(shares.map((s) => [s.layer, s.share])).toEqual([
			["role", 0.25],
			["stack", 0.75],
		]);
	});
});

describe("adding and editing a source", () => {
	const s = source("vendor");
	const render = (node: ReactNode) =>
		inProviders(
			<InlineModals>{node}</InlineModals>,
			seededClient({}),
			"/catalog/sources",
		);

	it("adds through a Form modal with a live submit", () => {
		const html = render(
			<SourceForm pending={false} error={null} onSubmit={() => {}} />,
		);
		expect(tagOf(html, "source-form")).toContain('data-size="form"');
		expect(html).toMatch(/data-testid="source-form-submit"[^>]*>Add source/);
		expect(tagOf(html, "source-form-submit")).not.toMatch(/\sdisabled=""/);
	});

	it("edits prefilled, holding Save until something changed", () => {
		const html = render(
			<SourceForm
				source={s}
				pending={false}
				error={null}
				onSubmit={() => {}}
			/>,
		);
		expect(tagOf(html, "source-form-name")).toContain(`value="${s.name}"`);
		expect(tagOf(html, "source-form-submit")).toMatch(/\sdisabled=""/);
	});

	it("sends only what changed, an emptied field as null", () => {
		const draft = sourceDraftOf(s);
		expect(changedSourceFields(s, draft)).toBeNull();
		expect(changedSourceFields(s, { ...draft, name: "Renamed" })).toEqual({
			name: "Renamed",
		});
		expect(changedSourceFields(s, { ...draft, url: "  " })).toEqual(
			s.url === null ? null : { url: null },
		);
		expect(sourceBodyOf({ ...draft, license: "" }).license).toBeNull();
	});

	it("shows a refusal on kind beside the kind radios", () => {
		const html = render(
			<SourceForm
				pending={false}
				error={contractError(400, "VALIDATION_FAILED", {
					body: [{ path: ["kind"], message: "Invalid enum value" }],
				})}
				onSubmit={() => {}}
			/>,
		);
		expect(html).toMatch(
			/data-testid="source-form-kind-error"[^>]*>Choose internal, vendor or community\.</,
		);
		expect(html).not.toContain("Invalid enum value");
	});

	it("refuses what the contract refuses, with the field's copy", () => {
		const draft = sourceDraftOf();
		expect(sourceProblems({ ...draft, name: "", url: "not a url" })).toEqual({
			name: "Give it a name of 1 to 200 characters.",
			url: "Give a full web address, such as https://example.com, or leave it empty.",
		});
		expect(
			sourceProblems({ ...draft, name: "Ok", url: "https://x.dev" }),
		).toEqual({});
	});
});

describe("removing a source", () => {
	const render = (node: ReactNode) =>
		inProviders(
			<InlineModals>{node}</InlineModals>,
			seededClient({}),
			"/catalog/sources",
		);
	const withSkills = { ...source("vendor"), skillCount: 3 };
	const empty = { ...source("vendor"), skillCount: 0 };

	it("is held while skills come from it, with the server's own reason", () => {
		const copy = PRECONDITION_COPY.skill_source_in_use;
		expect(removeHeldReason(withSkills)).toBe(`${copy.what} ${copy.next}`);
		expect(removeHeldReason(empty)).toBeNull();
		const html = render(
			<RemoveSourceConfirm
				source={withSkills}
				pending={false}
				error={null}
				onRemove={() => {}}
			/>,
		);
		expect(tagOf(html, "source-remove-submit")).toMatch(/\sdisabled=""/);
		expect(element(html, "source-remove-skills")).toContain(
			">3 skills come from this source.<",
		);
	});

	it("is a destructive Confirm named for the source when nothing comes from it", () => {
		const html = render(
			<RemoveSourceConfirm
				source={empty}
				pending={false}
				error={null}
				onRemove={() => {}}
			/>,
		);
		expect(tagOf(html, "source-remove")).toContain('data-size="confirm"');
		expect(html).toContain(`>Remove ${empty.name}<`);
		expect(tagOf(html, "source-remove-submit")).toContain(
			'data-variant="destructive"',
		);
		expect(tagOf(html, "source-remove-submit")).not.toMatch(/\sdisabled=""/);
		expect(skillsFromLine(1)).toBe("1 skill comes from this source.");
	});
});

describe("a source's skills", () => {
	const s = source("vendor");
	const own = SKILLS.filter((k) => k.source.id === s.id);

	it("filters by layer and status", () => {
		// Across every fixture skill, so more than one layer and status is present.
		const layers = new Set(SKILLS.map((k) => k.layer));
		expect(layers.size).toBeGreaterThan(1);
		const roles = filterSkills(SKILLS, "role", undefined);
		expect(roles.length).toBeGreaterThan(0);
		expect(roles.length).toBeLessThan(SKILLS.length);
		expect(roles.every((k) => k.layer === "role")).toBe(true);
		const approved = filterSkills(SKILLS, undefined, "approved");
		expect(approved.every((k) => k.status === "approved")).toBe(true);
		expect(filterSkills(SKILLS, undefined, undefined)).toHaveLength(
			SKILLS.length,
		);
	});

	it("links each skill chip to it in Skills", () => {
		const client = seededClient({});
		client.setQueryData(
			queryKeys.catalog.sourceSkills(s.id, CATALOG_PAGE_SIZE),
			{
				pages: [{ data: own, meta: { nextCursor: null, total: own.length } }],
				pageParams: [undefined],
			},
		);
		const html = inProviders(
			<SourceSkills source={s} />,
			client,
			"/catalog/sources",
		);
		for (const k of own) {
			expect(tagOf(html, `source-skill-${k.slug}`)).toContain(
				`href="/catalog/skills?skill=${k.slug}"`,
			);
		}
	});
});
