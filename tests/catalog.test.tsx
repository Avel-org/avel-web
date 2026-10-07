import {
	agentTemplateSchema,
	skillSchema,
	skillSourceSchema,
} from "avel-server/contract";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	agentsOfSkill,
	attachability,
	CATALOG_MISSING,
	enforcementBadge,
	SAMPLE_AGENTS,
	SAMPLE_SKILLS,
	SAMPLE_SOURCES,
	sampleAgent,
	sampleHistory,
	sampleSha256,
	sampleSkill,
	sampleUuid,
	skillsOfAgent,
} from "@/components/avel/catalog-placeholders";
import { CatalogSources } from "@/components/avel/catalog-sources";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api";
import { renderPage, tagOf } from "./render-page";

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

type Region = { missing: string; start: number; end: number; html: string };

/** Every sample region on the page, with where it sits. */
function regions(html: string): Region[] {
	return [...html.matchAll(/<[a-z0-9]+[^>]*data-sample-region="([^"]+)"/g)].map(
		(m) => {
			const start = m.index ?? 0;
			const body = elementAt(html, start);
			return {
				missing: m[1] ?? "",
				start,
				end: start + body.length,
				html: body,
			};
		},
	);
}

/** Where each "Sample data" pill sits, and the route it names. */
function pills(html: string): { at: number; missing: string }[] {
	return [
		...html.matchAll(
			/<button[^>]*data-testid="sample-data"[^>]*data-missing="([^"]+)"/g,
		),
	].map((m) => ({ at: m.index ?? 0, missing: m[1] ?? "" }));
}

const inside = (rs: Region[], at: number) =>
	rs.some((r) => at > r.start && at < r.end);

/** The index of an element by test id. */
const at = (html: string, testid: string) =>
	html.indexOf(`data-testid="${testid}"`);

const ROUTES = new Set<string>(Object.values(CATALOG_MISSING));

/**
 * The labelling contract, for one rendered page: every region carries exactly
 * one pill naming its own route, every pill sits in a region, and each real
 * element named here sits outside every region.
 */
function expectLabelled(html: string, real: string[], sampled: string[]) {
	const rs = regions(html);
	expect(rs.length).toBeGreaterThan(0);
	for (const region of rs) {
		expect(ROUTES.has(region.missing), region.missing).toBe(true);
		const own = pills(region.html);
		expect(own, `pills in ${region.missing}`).toHaveLength(1);
		expect(own[0]?.missing).toBe(region.missing);
		// The pill comes first, before any sample value.
		const body = region.html.slice(region.html.indexOf(">") + 1);
		expect(body.match(/data-testid="([^"]+)"/)?.[1]).toBe("sample-data");
	}
	const all = pills(html);
	expect(all).toHaveLength(rs.length);
	for (const pill of all) expect(inside(rs, pill.at)).toBe(true);
	for (const testid of real) {
		// Exactly once: a second copy inside a region would hide behind the first.
		expect(
			html.split(`data-testid="${testid}"`).length - 1,
			`${testid} appears once`,
		).toBe(1);
		expect(inside(rs, at(html, testid)), `${testid} is real`).toBe(false);
	}
	for (const testid of sampled) {
		expect(at(html, testid), testid).toBeGreaterThan(-1);
		expect(inside(rs, at(html, testid)), `${testid} is a sample`).toBe(true);
	}
}

/** A real write control: disabled, with its reason linked for screen readers. */
function expectDisabledWithReason(
	html: string,
	testid: string,
	reason: string,
) {
	const tag = tagOf(html, testid);
	expect(tag).toMatch(/\sdisabled=""/);
	const describedBy = tag.match(/aria-describedby="([^"]+)"/)?.[1];
	expect(describedBy, testid).toBeDefined();
	expect(html).toMatch(new RegExp(`id="${describedBy}"[^>]*>${reason}`));
}

// ---------------------------------------------------------------------------
// The sample data.

describe("catalog samples", () => {
	it("are deterministic: the same id always gives the same value", () => {
		expect(sampleSha256("x")).toBe(sampleSha256("x"));
		expect(sampleSha256("x")).not.toBe(sampleSha256("y"));
		expect(sampleSha256("x")).toMatch(/^[0-9a-f]{64}$/);
	});

	it("give every hash its own value, in SHA-256's shape", () => {
		const hashes = [
			...SAMPLE_AGENTS.flatMap((a) =>
				sampleHistory(a).versions.map((v) => v.sha256),
			),
			...SAMPLE_SKILLS.map((s) => s.contentSha256),
		];
		for (const hash of hashes) expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(new Set(hashes).size).toBe(hashes.length);
	});

	it("number versions newest first, down to 1, under the token cap", () => {
		for (const agent of SAMPLE_AGENTS) {
			const history = sampleHistory(agent);
			const numbers = history.versions.map((v) => v.version);
			expect(numbers).toEqual(
				Array.from({ length: agent.version }, (_, i) => agent.version - i),
			);
			expect(history.identityTokens).toBeLessThanOrEqual(800);
		}
	});

	it("follow the capability rule: grants and io shape exactly on capabilities", () => {
		for (const skill of SAMPLE_SKILLS) {
			const capability = skill.type === "capability";
			expect(skill.grants !== null, skill.slug).toBe(capability);
			expect(skill.ioShape !== null, skill.slug).toBe(capability);
		}
	});

	it("record a reviewer exactly on reviewed skills", () => {
		for (const skill of SAMPLE_SKILLS) {
			const reviewed = skill.status !== "draft";
			expect(skill.reviewedBy !== null, skill.slug).toBe(reviewed);
			expect(skill.reviewedAt !== null, skill.slug).toBe(reviewed);
		}
	});

	it("never let a draft or retired skill be attached", () => {
		for (const skill of SAMPLE_SKILLS) {
			expect(attachability(skill).attachable).toBe(skill.status === "approved");
		}
		const imported = sampleSkill("database-read");
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

	it("cross-link both ways: an agent carries a skill when the skill names it", () => {
		for (const skill of SAMPLE_SKILLS) {
			for (const agent of SAMPLE_AGENTS) {
				const { role, dispatch } = skillsOfAgent(agent);
				const carries = [...role, ...dispatch].includes(skill);
				expect(agentsOfSkill(skill).includes(agent)).toBe(carries);
			}
		}
		const atlas = sampleAgent("atlas");
		expect(atlas).toBeDefined();
		if (!atlas) return;
		const { role, dispatch } = skillsOfAgent(atlas);
		expect(role.every((s) => s.layer === "role")).toBe(true);
		expect(dispatch.every((s) => s.layer !== "role")).toBe(true);
	});

	it("count every skill under exactly one source", () => {
		const total = SAMPLE_SOURCES.reduce((n, s) => n + s.skillCount, 0);
		expect(total).toBe(SAMPLE_SKILLS.length);
		for (const skill of SAMPLE_SKILLS) {
			const source = SAMPLE_SOURCES.find((s) => s.id === skill.source.id);
			expect(source?.name, skill.slug).toBe(skill.source.name);
			expect(source?.kind, skill.slug).toBe(skill.source.kind);
		}
	});

	it("parse through the contract's own schemas", () => {
		for (const agent of SAMPLE_AGENTS) {
			expect(agentTemplateSchema.parse(agent)).toEqual(agent);
		}
		for (const skill of SAMPLE_SKILLS) {
			expect(skillSchema.parse(skill)).toEqual(skill);
		}
		for (const source of SAMPLE_SOURCES) {
			expect(skillSourceSchema.parse(source)).toEqual(source);
		}
		expect(sampleUuid("a")).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
		);
	});

	it("give every sample its own id", () => {
		const ids = [...SAMPLE_AGENTS, ...SAMPLE_SKILLS, ...SAMPLE_SOURCES].map(
			(row) => row.id,
		);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

// ---------------------------------------------------------------------------
// /catalog/sources.

describe("/catalog/sources", () => {
	it("labels the sample table, and leaves Add source real and disabled", async () => {
		const html = await renderPage("/catalog/sources");
		expectLabelled(html, ["catalog-sources-add"], ["catalog-sources-table"]);
		expect(regions(html).map((r) => r.missing)).toEqual([
			CATALOG_MISSING.sources,
		]);
		expectDisabledWithReason(html, "catalog-sources-add", "Adding a source");
	});

	it("lists every source with its kind and skill count", async () => {
		const table = element(
			await renderPage("/catalog/sources"),
			"catalog-sources-table",
		);
		for (const source of SAMPLE_SOURCES) {
			const row = element(table, `catalog-sources-table-row-${source.id}`);
			expect(row).toContain(source.name);
			expect(row).toContain(`>${source.skillCount}<`);
		}
	});
});

// ---------------------------------------------------------------------------
// The states a list shows once its route is wired. Rendered with a query in
// each state, outside the router: no row, and so no link, is rendered.

const shell = (node: ReactNode) =>
	renderToString(<TooltipProvider>{node}</TooltipProvider>);

const failed = {
	status: "error" as const,
	error: new ApiError({
		method: "GET",
		path: "/api/skills",
		kind: "contract",
		status: 500,
		code: "INTERNAL",
		message: "m",
		requestId: "req_catalog",
	} as ConstructorParameters<typeof ApiError>[0]),
	refetch: () => undefined,
	isFetching: false,
};

describe("every catalog list has its four states", () => {
	const lists = [
		["sources", (q: never) => <CatalogSources query={q} />],
	] as const;

	for (const [name, list] of lists) {
		it(`${name}: loading, empty, error, each inside its sample region`, () => {
			const loading = shell(list({ status: "pending" } as never));
			expect(tagOf(loading, `catalog-${name}-surface`)).toContain(
				'data-state="loading"',
			);
			expect(loading).toContain(`data-testid="catalog-${name}-skeleton"`);

			const empty = shell(list({ status: "success", data: [] } as never));
			expect(tagOf(empty, `catalog-${name}-surface`)).toContain(
				'data-state="empty"',
			);
			expect(empty).toContain(`data-testid="catalog-${name}-empty"`);
			// As on every empty state: build status stays out of the sentence.
			expect(
				empty.match(/data-testid="empty-state-description"[^>]*>([^<]+)</)?.[1],
			).not.toMatch(/contract|avel-server|not built|yet\b|route/i);

			const error = shell(list(failed as never));
			expect(tagOf(error, `catalog-${name}-surface`)).toContain(
				'data-state="error"',
			);

			for (const html of [loading, empty, error]) {
				expect(pills(html).length).toBe(regions(html).length);
			}
		});
	}

	it("offers the disabled write control in the empty Sources", () => {
		const sources = shell(
			<CatalogSources query={{ status: "success", data: [] }} />,
		);
		expect(tagOf(sources, "catalog-sources-empty-add")).toMatch(
			/\sdisabled=""/,
		);
	});
});

// ---------------------------------------------------------------------------
// Layout, from the visual pass: what SSR can see of each fix.

describe("small fixes", () => {
	it("shows a source's kind as a word and keeps None out of mono", async () => {
		const html = await renderPage("/catalog/sources");
		expect(tagOf(html, "catalog-source-kind")).toContain(
			'data-variant="outline"',
		);
		const table = element(html, "catalog-sources-table");
		const internal = SAMPLE_SOURCES.find((s) => s.license === null);
		const licensed = SAMPLE_SOURCES.find((s) => s.license !== null);
		expect(internal && licensed).toBeTruthy();
		const none = element(table, `catalog-sources-table-row-${internal?.id}`);
		expect(none).not.toMatch(/type-mono[^"]*"[^>]*>(<span[^>]*>)?None</);
		expect(none).toMatch(/<span class="text-text-subtle">None<\/span>/);
		const value = element(table, `catalog-sources-table-row-${licensed?.id}`);
		expect(value).toMatch(
			new RegExp(
				`data-testid="catalog-source-license" class="type-mono-small">${licensed?.license}<`,
			),
		);
	});
});
