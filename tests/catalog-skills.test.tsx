import { ROLES, type Skill, skillSchema, TEAMS } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import {
	agentsOfSkill,
	CATALOG_MISSING,
	carryingRoles,
	SAMPLE_ROLE_ATTACHMENTS,
	sampleRegistry,
	sampleRoleAttachments,
	skillsNeedingReview,
} from "@/components/avel/catalog-placeholders";
import {
	approveBlocker,
	editBlocker,
	retireBlocker,
} from "@/components/avel/catalog-skill-actions";
import { filterRegistry } from "@/components/avel/catalog-skill-discover";
import {
	filterSkills,
	SKILL_SECTIONS,
	sectionOf,
	skillSections,
	sourceName,
} from "@/components/avel/catalog-skill-index";
import {
	attachedTeams,
	attachedTotal,
	HASH_COVERS,
	SKILL_WRITE_REASON,
	SkillInspector,
	skillMarkdown,
	sourceLine,
} from "@/components/avel/catalog-skill-inspector";
import { shortHash } from "@/components/avel/short-hash";
import {
	AGENTS,
	catalogSeed,
	inProviders,
	internalError,
	notFoundError,
	renderSeeded,
	SKILLS,
	SOURCES,
	seededClient,
	skill,
	source,
} from "./catalog-fixtures";
import { renderPage, tagOf } from "./render-page";

/*
 * /catalog/skills as one reading column (ruling 52): an index of every skill
 * in sections (what needs review, then where each is delivered), and in its
 * place, one at a time, a skill read as a document, Discover, Sources, or a
 * new skill, under a trail back to the index. The skills, the selected
 * skill, the templates that carry it and the sources are live, rendered
 * through the real router with a seeded QueryClient. A role skill's
 * attachments and a source's index are labelled samples (AVEL-DESIGN.md
 * ruling 32). The writes with a route are live
 * (tests/catalog-skill-writes.test.tsx); the rest are real controls,
 * disabled with their reason.
 */

// ---------------------------------------------------------------------------
// Markup helpers. The node environment has no DOM; tests read the markup.

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

function element(html: string, testid: string): string {
	const at = html.indexOf(`data-testid="${testid}"`);
	expect(at, testid).toBeGreaterThan(-1);
	return elementAt(html, html.lastIndexOf("<", at));
}

type Region = { missing: string; start: number; end: number; html: string };

/** An attribute value as written, with React's apostrophe escape undone. */
const attr = (value: string | undefined) =>
	(value ?? "").replaceAll("&#x27;", "'");

function regions(html: string): Region[] {
	return [...html.matchAll(/<[a-z0-9]+[^>]*data-sample-region="([^"]+)"/g)].map(
		(m) => {
			const start = m.index ?? 0;
			const body = elementAt(html, start);
			return {
				missing: attr(m[1]),
				start,
				end: start + body.length,
				html: body,
			};
		},
	);
}

function pills(html: string): { at: number; missing: string }[] {
	return [
		...html.matchAll(
			/<button[^>]*data-testid="sample-data"[^>]*data-missing="([^"]+)"/g,
		),
	].map((m) => ({ at: m.index ?? 0, missing: attr(m[1]) }));
}

const inside = (rs: Region[], at: number) =>
	rs.some((r) => at > r.start && at < r.end);

const indexOf = (html: string, testid: string) =>
	html.indexOf(`data-testid="${testid}"`);

const ROUTES = new Set<string>(Object.values(CATALOG_MISSING));

/**
 * Every region carries exactly one pill naming a catalog route, first; every
 * pill sits in a region; each real control appears once, outside every
 * region; each sampled element sits inside one.
 */
function expectLabelled(html: string, real: string[], sampled: string[]) {
	const rs = regions(html);
	for (const region of rs) {
		expect(ROUTES.has(region.missing), region.missing).toBe(true);
		const own = pills(region.html);
		expect(own, `pills in ${region.missing}`).toHaveLength(1);
		expect(own[0]?.missing).toBe(region.missing);
		const body = region.html.slice(region.html.indexOf(">") + 1);
		expect(body.match(/data-testid="([^"]+)"/)?.[1]).toBe("sample-data");
	}
	const all = pills(html);
	expect(all).toHaveLength(rs.length);
	for (const pill of all) expect(inside(rs, pill.at)).toBe(true);
	for (const testid of real) {
		expect(
			html.split(`data-testid="${testid}"`).length - 1,
			`${testid} appears once`,
		).toBe(1);
		expect(inside(rs, indexOf(html, testid)), `${testid} is real`).toBe(false);
	}
	for (const testid of sampled) {
		expect(indexOf(html, testid), testid).toBeGreaterThan(-1);
		expect(inside(rs, indexOf(html, testid)), `${testid} is a sample`).toBe(
			true,
		);
	}
}

/** A real write control: disabled, with its reason linked for screen readers. */
function expectDisabledWithReason(
	html: string,
	testid: string,
	reason: string,
) {
	const tag = tagOf(html, testid);
	expect(tag, testid).toMatch(/\sdisabled=""/);
	const describedBy = tag.match(/aria-describedby="([^"]+)"/)?.[1];
	expect(describedBy, testid).toBeDefined();
	const escaped = reason.replaceAll("'", "&#x27;");
	expect(html).toContain(
		`id="${describedBy}" data-slot="button-reason" class="sr-only">${escaped}<`,
	);
}

/** The slugs of the index's rows, in order: links carrying a data-status. */
const rowSlugs = (html: string): string[] =>
	[
		...html.matchAll(/data-testid="skill-row-([a-z0-9-]+)"[^>]*data-status=/g),
	].map((m) => m[1] ?? "");

/** The ids of the index's sections, in order. */
const sectionIds = (html: string): string[] =>
	[...html.matchAll(/data-testid="skill-section-([a-z]+)"/g)].map(
		(m) => m[1] ?? "",
	);

/** The roles of the RoleTags in a piece of markup, in order. */
const tagRoles = (html: string): string[] =>
	[
		...html.matchAll(/data-testid="catalog-role"[^>]*data-role="([a-z-]+)"/g),
	].map((m) => m[1] ?? "");

const classes = (html: string, testid: string): string[] =>
	(tagOf(html, testid).match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/);

/** Ruling 4: no middle dots in meta strings, anywhere on the page body. */
const MIDDLE_DOT = "·";

const SKILLS_PATH = "/api/skills";

/**
 * A page with everything seeded, rendered once per path and shared across
 * tests. Rendering is deterministic and no test changes the markup, so a
 * second render of the same path only costs time. The determinism test
 * renders fresh on purpose.
 */
const rendered = new Map<string, Promise<string>>();
const page = (search = ""): Promise<string> => {
	const path = `/catalog/skills${search}`;
	let html = rendered.get(path);
	if (!html) {
		html = renderSeeded(path, seededClient(catalogSeed()));
		rendered.set(path, html);
	}
	return html;
};

/**
 * One skill's inspector alone: the same component the page renders, with the
 * templates it reads seeded, without the app shell around it.
 */
const inspector = (s: Skill) =>
	inProviders(<SkillInspector skill={s} />, seededClient({ agents: AGENTS }));

const ROLE_SKILL = "property-testing-fast-check";
const IMPORTED_CAPABILITY = "database-read";
const WITH_ADDITIONS = "nextjs-route-handlers";
const RETIRED = "package-registry";

// ---------------------------------------------------------------------------
// The fixtures and the rules on them.

describe("skill fixtures and rules", () => {
	it("parse as the contract's full Skill, text included", () => {
		for (const s of SKILLS) {
			expect(skillSchema.parse(s)).toEqual(s);
			expect(s.contentMd.length, s.slug).toBeGreaterThan(0);
		}
	});

	it("count only imported drafts as needing review", () => {
		const review = skillsNeedingReview(SKILLS);
		expect(review.length).toBeGreaterThan(0);
		for (const s of review) {
			expect(s.status).toBe("draft");
			expect(s.source.kind).not.toBe("internal");
		}
	});
});

describe("index rules", () => {
	it("orders the sections review first, then role, stack, domain, retired, each said without a middle dot", () => {
		expect(SKILL_SECTIONS.map((s) => s.id)).toEqual([
			"review",
			"role",
			"stack",
			"domain",
			"retired",
		]);
		expect(SKILL_SECTIONS[0]?.label).toBe("Needs your review");
		for (const s of SKILL_SECTIONS) {
			expect(s.label, s.id).not.toContain(MIDDLE_DOT);
			expect(s.meaning, s.id).not.toContain(MIDDLE_DOT);
		}
	});

	it("sections by status first, then by layer, leaving out empty sections", () => {
		expect(sectionOf({ status: "draft", layer: "role" })).toBe("review");
		expect(sectionOf({ status: "draft", layer: "stack" })).toBe("review");
		expect(sectionOf({ status: "retired", layer: "role" })).toBe("retired");
		expect(sectionOf({ status: "approved", layer: "domain" })).toBe("domain");
		const sections = skillSections(SKILLS);
		expect(sections.reduce((n, s) => n + s.skills.length, 0)).toBe(
			SKILLS.length,
		);
		for (const section of sections) {
			expect(section.skills.length, section.id).toBeGreaterThan(0);
		}
		// The fixtures have no domain skill, so no domain section.
		expect(sections.map((s) => s.id)).toEqual([
			"review",
			"role",
			"stack",
			"retired",
		]);
		expect(skillSections([])).toEqual([]);
	});

	it("puts a draft role skill under review, not role, and a retired one under retired", () => {
		const draftRole = {
			...skill(ROLE_SKILL),
			id: "draft-role",
			slug: "draft-role",
			status: "draft" as const,
		};
		const retiredRole = {
			...skill("criterion-tags"),
			id: "retired-role",
			slug: "retired-role",
			status: "retired" as const,
		};
		const sections = skillSections([...SKILLS, draftRole, retiredRole]);
		const slugsIn = (id: string) =>
			sections.find((s) => s.id === id)?.skills.map((s) => s.slug) ?? [];
		expect(slugsIn("review")).toContain("draft-role");
		expect(slugsIn("role")).not.toContain("draft-role");
		expect(slugsIn("retired")).toEqual([RETIRED, "retired-role"]);
		expect(slugsIn("role")).not.toContain("retired-role");
	});

	it("names a row's source: Yours for AVEL's own, else the source's name", () => {
		expect(sourceName(skill(ROLE_SKILL))).toBe("Yours");
		expect(sourceName(skill(WITH_ADDITIONS))).toBe("Framework vendor pack");
		expect(sourceName(skill(IMPORTED_CAPABILITY))).toBe(
			"Community skills index",
		);
	});

	it("filters by name, slug or description, ignoring case, and by drafts", () => {
		expect(filterSkills(SKILLS, "NEXT.JS", false).map((s) => s.slug)).toEqual([
			WITH_ADDITIONS,
		]);
		expect(filterSkills(SKILLS, "  ", false)).toHaveLength(SKILLS.length);
		const drafts = filterSkills(SKILLS, undefined, true);
		expect(drafts.length).toBeGreaterThan(0);
		expect(drafts.every((s) => s.status === "draft")).toBe(true);
	});

	it("filters the registry by name, path or description", () => {
		const entries = sampleRegistry(SOURCES);
		const first = entries[0];
		expect(first).toBeDefined();
		if (!first) return;
		for (const e of filterRegistry(entries, first.name)) {
			expect(e.name).toBe(first.name);
		}
		expect(filterRegistry(entries, "")).toHaveLength(entries.length);
		expect(filterRegistry(entries, "zzzz-nothing")).toEqual([]);
	});
});

describe("SKILL.md", () => {
	it("is frontmatter (name, description, version), then the content", () => {
		const s = skill(ROLE_SKILL);
		const lines = skillMarkdown(s).split("\n");
		expect(lines.slice(0, 5)).toEqual([
			"---",
			`name: ${s.slug}`,
			`description: ${s.description}`,
			`version: ${s.version}`,
			"---",
		]);
		expect(skillMarkdown(s).endsWith(s.contentMd)).toBe(true);
	});

	it("never merges AVEL's additions into the original", () => {
		const s = skill(WITH_ADDITIONS);
		const additions = s.avelEnhancementMd ?? "";
		expect(additions.length).toBeGreaterThan(0);
		expect(skillMarkdown(s)).not.toContain(additions);
	});

	it("names its source in words, from the skill's own source, without a middle dot", () => {
		expect(sourceLine(skill(ROLE_SKILL))).toBe("Yours");
		expect(sourceLine(skill(WITH_ADDITIONS))).toBe(
			"From Framework vendor pack",
		);
		expect(sourceLine(skill(WITH_ADDITIONS))).not.toContain(MIDDLE_DOT);
	});
});

// ---------------------------------------------------------------------------
// The page.

describe("/catalog/skills, a skill", () => {
	it("renders the same page for the same data on every visit", async () => {
		const once = () =>
			renderSeeded(
				`/catalog/skills?skill=${IMPORTED_CAPABILITY}`,
				seededClient(catalogSeed()),
			);
		expect(await once()).toBe(await once());
	});

	it("shows a stack skill live, with no sample region at all, and the write controls real", async () => {
		const html = await page(`?skill=${IMPORTED_CAPABILITY}`);
		expect(regions(html)).toEqual([]);
		expect(html).not.toContain('data-testid="sample-data"');
		expectLabelled(
			html,
			[
				"skills-discover",
				"skills-new",
				"catalog-skills-back",
				"skill-approve",
				"skill-retire",
				"skill-status",
				"skill-hash",
				"skill-hash-copy",
				"skill-description-length",
				"skill-capability",
				"skill-code",
				"skill-markdown-copy",
				"catalog-agent-link-iyo",
			],
			[],
		);
		// One column: a skill replaces the index, it does not sit beside it.
		expect(html).not.toContain('data-testid="skill-index"');
		expect(html).not.toContain(
			`data-testid="skill-row-${IMPORTED_CAPABILITY}"`,
		);
	});

	it("samples only a role skill's attachments and the carriers they imply", async () => {
		const html = await page(`?skill=${ROLE_SKILL}`);
		expect(new Set(regions(html).map((r) => r.missing))).toEqual(
			new Set([CATALOG_MISSING.roleAttachments]),
		);
		const [first] = attachedTeams(carryingRoles(skill(ROLE_SKILL)));
		expect(first).toBeDefined();
		expectLabelled(
			html,
			[
				"skill-approve",
				"skill-retire",
				"skill-status",
				"skill-hash",
				"skill-code",
				"skill-attach-change",
			],
			[
				"skill-attach-total",
				`skill-team-${first?.team}`,
				"skill-carried-by-list",
			],
		);
	});

	it("offers Approve on a draft, and holds what the server would refuse with its reason", async () => {
		const draft = await page(`?skill=${IMPORTED_CAPABILITY}`);
		expect(tagOf(draft, "skill-approve")).not.toMatch(/\sdisabled=""/);
		expect(tagOf(draft, "skill-retire")).not.toMatch(/\sdisabled=""/);
		expect(tagOf(draft, "skill-edit")).toContain(
			`href="/catalog/skills?skill=${IMPORTED_CAPABILITY}&amp;view=edit"`,
		);
		const approved = await page(`?skill=${WITH_ADDITIONS}`);
		expectDisabledWithReason(
			approved,
			"skill-approve",
			approveBlocker(skill(WITH_ADDITIONS)) ?? "",
		);
		const retired = await page(`?skill=${RETIRED}`);
		for (const [testid, reason] of [
			["skill-edit", editBlocker(skill(RETIRED))],
			["skill-approve", approveBlocker(skill(RETIRED))],
			["skill-retire", retireBlocker(skill(RETIRED))],
		] as const) {
			expectDisabledWithReason(retired, testid, reason ?? "");
		}
	});

	it("shows the technical facts", async () => {
		const html = await page(`?skill=${IMPORTED_CAPABILITY}`);
		const s = skill(IMPORTED_CAPABILITY);
		const facts = element(html, "skill-facts");
		expect(facts).toContain(">stack<");
		expect(facts).toContain(">capability<");
		expect(element(html, "skill-status")).toContain(">Draft<");
		expect(tagOf(html, "skill-description-length")).toContain(
			`data-length="${s.description.length}"`,
		);
		expect(element(html, "skill-io")).toContain("reads large → returns small");
		for (const grant of s.type === "capability" ? s.grants : []) {
			expect(element(html, "skill-capability")).toContain(`>${grant}<`);
		}
		expect(element(html, "skill-source-line")).toContain(
			">From Community skills index<",
		);
	});

	it("pins the version by its full hash, with Copy and what the hash covers", async () => {
		const html = await page(`?skill=${IMPORTED_CAPABILITY}`);
		const s = skill(IMPORTED_CAPABILITY);
		const pinned = element(html, "skill-pinned");
		expect(pinned).toContain(`>${s.slug}@v${s.version}<`);
		const hash = tagOf(pinned, "skill-hash");
		expect(hash).toMatch(/^<code/);
		expect(hash).toContain(`data-full="${s.contentSha256}"`);
		expect(hash).toContain(`title="${s.contentSha256}"`);
		// Seven characters to the eye, the whole hash to a screen reader.
		const shown = element(pinned, "skill-hash");
		expect(shown).toContain(
			`<span aria-hidden="true">${shortHash(s.contentSha256)}</span>`,
		);
		expect(shown).toContain(`<span class="sr-only">${s.contentSha256}</span>`);
		expect(tagOf(pinned, "skill-hash-copy")).toContain(
			'aria-label="Copy the content hash"',
		);
		expect(element(pinned, "skill-hash-covers")).toContain(
			HASH_COVERS.replaceAll("'", "&#x27;"),
		);
		// The pin comes before the facts: it is what an agent receives.
		expect(indexOf(html, "skill-pinned")).toBeLessThan(
			indexOf(html, "skill-facts"),
		);
	});

	it("marks a skill that is not approved in its header, and an approved one not at all", async () => {
		const draft = element(
			await page(`?skill=${IMPORTED_CAPABILITY}`),
			"skill-header",
		);
		expect(draft).toContain(">Draft<");
		expect(draft).toContain('data-skill-type="capability"');
		const approved = element(
			await page(`?skill=${WITH_ADDITIONS}`),
			"skill-header",
		);
		expect(approved).not.toContain(">Approved<");
		expect(approved).toContain('data-skill-type="knowledge"');
	});

	it("never badges a capability as enforced, and says an imported draft can't attach", async () => {
		const html = await page(`?skill=${IMPORTED_CAPABILITY}`);
		expect(element(html, "skill-enforcement")).toContain(
			"Not enforced: no room is running",
		);
		expect(tagOf(html, "skill-enforcement")).not.toContain('data-tone="pass"');
		expect(tagOf(html, "skill-attach")).toContain('data-attachable="false"');
		expect(element(html, "skill-attach")).toContain(
			"An imported draft can&#x27;t be attached",
		);
	});

	it("shows SKILL.md with its frontmatter and headings marked, a Copy, and AVEL's additions apart", async () => {
		const html = await page(`?skill=${WITH_ADDITIONS}`);
		const code = element(html, "skill-code-text");
		expect(code).toMatch(/<span data-tone="key"[^>]*>name: /);
		expect(code).toMatch(/<span data-tone="key"[^>]*>version: /);
		expect(code).toMatch(/<span data-tone="heading"[^>]*># /);
		const markdown = element(html, "skill-markdown");
		expect(tagOf(markdown, "skill-markdown-copy")).toContain(
			'aria-label="Copy SKILL.md"',
		);
		const additions = element(html, "skill-additions");
		expect(additions).toContain("AVEL&#x27;s additions");
		expect(code).not.toContain("AVEL&#x27;s additions");
		expect(indexOf(html, "skill-additions")).toBeGreaterThan(
			indexOf(html, "skill-code"),
		);
	});

	it("shows no additions block on a skill without any, and no capability facts on knowledge", async () => {
		const html = await page(`?skill=${ROLE_SKILL}`);
		expect(html).not.toContain('data-testid="skill-additions"');
		expect(html).not.toContain('data-testid="skill-capability"');
		expect(element(html, "skill-enforcement")).toContain(
			"Advice, nothing to enforce",
		);
	});

	it("links each live agent that carries it", async () => {
		const html = await page(`?skill=${IMPORTED_CAPABILITY}`);
		const carriers = agentsOfSkill(skill(IMPORTED_CAPABILITY), AGENTS);
		expect(carriers.length).toBeGreaterThan(0);
		const carried = element(html, "skill-carried-by");
		for (const a of carriers) {
			expect(carried).toContain(`href="/catalog/agents/${a.slug}"`);
		}
		expect(carried.match(/catalog-agent-link-/g)).toHaveLength(carriers.length);
	});

	it("reads the skill by its slug, so a selection works whatever the list holds", async () => {
		// The selected skill is not in the list's page, and still opens.
		const extra = { ...skill(ROLE_SKILL), slug: "from-page-two", id: "x" };
		const html = await renderSeeded(
			"/catalog/skills?skill=from-page-two",
			seededClient({
				skills: SKILLS,
				skillBySlug: { "from-page-two": extra },
				agents: AGENTS,
			}),
		);
		expect(tagOf(html, "skill-inspector")).toContain(
			'data-skill="from-page-two"',
		);
		expect(html).not.toContain('data-testid="skill-row-from-page-two"');
	});

	it("shows the inspector's own states: loading, a stale slug, a failure", async () => {
		const loading = await renderSeeded(
			`/catalog/skills?skill=${ROLE_SKILL}`,
			seededClient({ skills: SKILLS }),
		);
		expect(tagOf(loading, "skill-inspector-surface")).toContain(
			'data-state="loading"',
		);
		expect(loading).toContain('data-testid="skill-inspector-skeleton"');

		const stale = await renderSeeded(
			"/catalog/skills?skill=nothing-here",
			seededClient({
				skills: SKILLS,
				skillBySlug: {
					"nothing-here": notFoundError(`${SKILLS_PATH}/by-slug/nothing-here`),
				},
			}),
		);
		expect(tagOf(stale, "skill-inspector-surface")).toContain(
			'data-state="error"',
		);
		expect(element(stale, "catalog-skills-not-found")).toContain(
			"nothing-here",
		);
		expect(stale).not.toContain('data-testid="surface-error"');
		expect(stale).not.toContain('data-testid="skill-inspector"');
		// The trail still leads back to the index.
		expect(tagOf(stale, "skill-trail-index")).toContain(
			'href="/catalog/skills"',
		);

		const failed = await renderSeeded(
			`/catalog/skills?skill=${ROLE_SKILL}`,
			seededClient({
				skills: SKILLS,
				skillBySlug: {
					[ROLE_SKILL]: internalError(`${SKILLS_PATH}/by-slug/${ROLE_SKILL}`),
				},
			}),
		);
		expect(failed).toContain('data-testid="surface-error"');
		expect(failed).not.toContain("catalog-skills-not-found");
	});

	it("writes no middle dot anywhere in the skills page", async () => {
		for (const search of [
			"",
			`?skill=${IMPORTED_CAPABILITY}`,
			`?skill=${ROLE_SKILL}`,
			"?view=discover",
			"?view=new",
			"?view=sources",
		]) {
			expect(
				element(await page(search), "catalog-skills"),
				search,
			).not.toContain(MIDDLE_DOT);
		}
	});
});

describe("the live list's four states", () => {
	it("loads the real list: a skeleton, no pill, no not-built state, the definition as subtitle", async () => {
		const html = await renderPage("/catalog/skills");
		expect(tagOf(html, "catalog-skills-surface")).toContain(
			'data-state="loading"',
		);
		expect(html).toContain('data-testid="catalog-skills-skeleton"');
		expect(html).not.toContain('data-state="not-built"');
		expect(html).not.toContain('data-testid="sample-data"');
		expect(html).toContain('data-testid="topbar-definition"');
		expect(html).not.toContain('data-testid="topbar-subtitle"');
	});

	it("counts from meta.total in the top bar, says how old the list is, and offers the next page", async () => {
		expect(element(await page(), "topbar-subtitle")).toContain(
			`>${SKILLS.length} skills<`,
		);
		expect(await page()).toContain('data-testid="catalog-skills-read-age"');
		const html = await renderSeeded(
			"/catalog/skills",
			seededClient({ skills: { rows: SKILLS, total: 40, nextCursor: "c2" } }),
		);
		expect(element(html, "topbar-subtitle")).toContain(">40 skills<");
		expect(element(html, "catalog-skills-list-footer-showing")).toContain(
			`>Showing ${SKILLS.length} of 40<`,
		);
		expect(html).toContain(
			'data-testid="catalog-skills-list-footer-load-more"',
		);
		// The footer sits in the index, under the last section.
		expect(element(html, "skill-index")).toContain(
			'data-testid="catalog-skills-list-footer"',
		);
		const one = await renderSeeded(
			"/catalog/skills",
			seededClient({ skills: [skill(ROLE_SKILL)] }),
		);
		expect(element(one, "topbar-subtitle")).toContain(">1 skill<");
	});

	it("says when there are none, offering New skill, in words that state no build status", async () => {
		const html = await renderSeeded(
			"/catalog/skills",
			seededClient({ skills: [] }),
		);
		expect(tagOf(html, "catalog-skills-surface")).toContain(
			'data-state="empty"',
		);
		expect(html).toContain('data-testid="catalog-skills-empty"');
		expect(html).not.toContain('data-testid="skill-index"');
		expect(tagOf(html, "catalog-skills-empty-new")).toContain(
			'href="/catalog/skills?view=new"',
		);
		expect(
			html.match(/data-testid="empty-state-description"[^>]*>([^<]+)</)?.[1],
		).not.toMatch(/contract|avel-server|not built|yet\b|route/i);
		expect(element(html, "topbar-subtitle")).toContain(">0 skills<");
	});

	it("shows the error state when the list fails, keeping the page's actions", async () => {
		const html = await renderSeeded(
			"/catalog/skills",
			seededClient({ skills: internalError(SKILLS_PATH) }),
		);
		expect(tagOf(html, "catalog-skills-surface")).toContain(
			'data-state="error"',
		);
		expect(html).toContain('data-testid="surface-error"');
		expect(html).toContain(">req_catalog<");
		expect(html).toContain('data-testid="skills-new"');
	});
});

describe("attaching", () => {
	it("shows a role skill's attached roles by team, from its sample attachments, behind the attachment pill", async () => {
		const html = await page(`?skill=${ROLE_SKILL}`);
		const s = skill(ROLE_SKILL);
		const attached = carryingRoles(s);
		const teams = attachedTeams(attached);
		expect(teams.length).toBeGreaterThan(0);
		const sample = element(html, "skill-attach-sample");
		expect(tagOf(html, "skill-attach-sample")).toContain(
			`data-sample-region="${CATALOG_MISSING.roleAttachments}"`,
		);
		expect(element(sample, "skill-attach-total")).toContain(
			`>${attachedTotal(attached.length, teams.length)}<`,
		);
		// One row per team that has an attached role, in catalog order.
		expect(
			[...sample.matchAll(/data-testid="skill-team-([a-z-]+)"/g)].map(
				(m) => m[1],
			),
		).toEqual(teams.map((t) => t.team));
		for (const { team, roles } of teams) {
			// Only the attached roles: attachment (role_skills), never recommendedFor.
			expect(tagRoles(element(sample, `skill-team-${team}`)), team).toEqual(
				roles,
			);
		}
		expect(tagRoles(sample).sort()).toEqual([...attached].sort());
		expect(html).not.toContain('data-slot="switch"');
		expect(html).not.toContain('data-testid="skill-attach-none"');
	});

	it("says a stack skill is given at dispatch, live, with no team rows, no Change roles and no pill", async () => {
		const html = await page(`?skill=${IMPORTED_CAPABILITY}`);
		const panel = element(html, "skill-attach-panel");
		expect(panel).not.toContain('data-testid="skill-attach-change"');
		expect(panel).not.toContain('data-testid="skill-attach-total"');
		expect(panel).not.toMatch(/data-testid="skill-team-/);
		expect(panel).not.toContain("data-sample-region=");
		expect(element(panel, "skill-dispatch")).toContain(
			"given at dispatch to missions whose roles include",
		);
		expect(tagRoles(element(panel, "skill-attach-dispatch")).sort()).toEqual(
			[...skill(IMPORTED_CAPABILITY).recommendedFor].sort(),
		);
	});
});

describe("the index", () => {
	it("shows the two ways in, then the filter, behind no pill", async () => {
		const html = await page();
		const index = element(html, "skill-index");
		expect(index).not.toContain('data-testid="sample-data"');
		expect(tagOf(index, "skill-entry-new")).toContain(
			'href="/catalog/skills?view=new"',
		);
		expect(tagOf(index, "skill-entry-discover")).toContain(
			'href="/catalog/skills?view=discover"',
		);
		expect(tagOf(html, "skill-filter-input")).toContain(
			'placeholder="Filter skills"',
		);
		expect(html).toMatch(/<label[^>]*>Filter skills<\/label>/);
		expect(indexOf(index, "skill-entry-new")).toBeLessThan(
			indexOf(index, "skill-filter"),
		);
		expect(indexOf(index, "skill-filter")).toBeLessThan(
			indexOf(index, "skill-section-review"),
		);
	});

	it("sections the rows, Needs your review first, with counts and what each means", async () => {
		const html = await page();
		const index = element(html, "skill-index");
		const sections = skillSections(SKILLS);
		expect(sectionIds(index)).toEqual(sections.map((s) => s.id));
		expect(sectionIds(index)[0]).toBe("review");
		for (const section of sections) {
			const el = element(index, `skill-section-${section.id}`);
			expect(el).toContain(`aria-labelledby="skill-section-${section.id}"`);
			expect(el).toContain(`>${section.label}<`);
			expect(el).toContain(`>${section.skills.length}<`);
			expect(el).toContain(section.meaning.replaceAll("'", "&#x27;"));
			expect(rowSlugs(el)).toEqual(section.skills.map((s) => s.slug));
		}
		// Every skill appears in exactly one section.
		expect(rowSlugs(index).sort()).toEqual(SKILLS.map((s) => s.slug).sort());
	});

	it("files a draft role skill under review and a retired one under retired, in the page", async () => {
		const draftRole = {
			...skill(ROLE_SKILL),
			id: "draft-role",
			slug: "draft-role",
			status: "draft" as const,
		};
		const html = await renderSeeded(
			"/catalog/skills",
			seededClient({ skills: [...SKILLS, draftRole], agents: AGENTS }),
		);
		expect(rowSlugs(element(html, "skill-section-review"))).toContain(
			"draft-role",
		);
		expect(rowSlugs(element(html, "skill-section-role"))).not.toContain(
			"draft-role",
		);
		expect(rowSlugs(element(html, "skill-section-retired"))).toEqual([RETIRED]);
		expect(rowSlugs(element(html, "skill-section-stack"))).not.toContain(
			RETIRED,
		);
	});

	it("names each row's source on the row, since sections are not by source", async () => {
		const html = await page();
		for (const s of SKILLS) {
			const row = element(html, `skill-row-${s.slug}`);
			expect(element(row, "skill-row-source"), s.slug).toContain(
				`>${sourceName(s)}<`,
			);
			expect(element(row, "skill-row-name"), s.slug).toContain(`>${s.name}<`);
			expect(tagOf(html, `skill-row-${s.slug}`)).toContain(
				`href="/catalog/skills?skill=${s.slug}"`,
			);
		}
	});

	it("tags drafts and retired skills by name, and quiets retired ones to the subtle ink", async () => {
		const html = await page();
		expect(SKILLS.some((s) => s.status === "draft")).toBe(true);
		expect(SKILLS.some((s) => s.status === "retired")).toBe(true);
		for (const s of SKILLS) {
			const row = element(html, `skill-row-${s.slug}`);
			expect(tagOf(html, `skill-row-${s.slug}`)).toContain(
				`data-status="${s.status}"`,
			);
			expect(row.includes('data-testid="skill-row-draft"'), s.slug).toBe(
				s.status === "draft",
			);
			expect(row.includes('data-testid="skill-row-retired"'), s.slug).toBe(
				s.status === "retired",
			);
			// The status is a word beside its glyph, with what it means in the
			// title, never an unlabelled mark.
			if (s.status === "draft") {
				expect(element(row, "skill-row-draft")).toMatch(/>Draft</);
				expect(element(row, "skill-row-draft")).toContain(
					'data-slot="status-glyph"',
				);
			}
			if (s.status === "retired") {
				expect(element(row, "skill-row-retired")).toMatch(/>Retired</);
				expect(element(row, "skill-row-retired")).toContain(
					'data-slot="status-glyph"',
				);
			}
			expect(
				/\btext-text-subtle\b/.test(tagOf(row, "skill-row-name")),
				s.slug,
			).toBe(s.status === "retired");
			expect(classes(html, `skill-row-${s.slug}`).join(" ")).not.toMatch(
				/opacity/,
			);
		}
	});

	it("shows drafts only under filter=drafts, saying so, with a way back and the filter kept on each row", async () => {
		const all = await page();
		expect(all).not.toContain('data-testid="skill-drafts-only"');
		const drafts = await page("?filter=drafts");
		const note = element(drafts, "skill-drafts-only");
		expect(note).toContain("Showing drafts only.");
		expect(note).toContain('href="/catalog/skills"');
		const index = element(drafts, "skill-index");
		const shown = rowSlugs(index);
		expect([...shown].sort()).toEqual(
			SKILLS.filter((s) => s.status === "draft")
				.map((s) => s.slug)
				.sort(),
		);
		// Drafts read under review alone.
		expect(sectionIds(index)).toEqual(["review"]);
		for (const slug of shown) {
			expect(tagOf(drafts, `skill-row-${slug}`)).toContain(
				`href="/catalog/skills?skill=${slug}&amp;filter=drafts"`,
			);
		}
	});

	it("filters by the q in the URL, and says when nothing matches", async () => {
		const one = element(await page("?q=next.js"), "skill-index");
		expect(rowSlugs(one)).toEqual([WITH_ADDITIONS]);
		expect(tagOf(one, `skill-row-${WITH_ADDITIONS}`)).toContain(
			`href="/catalog/skills?skill=${WITH_ADDITIONS}&amp;q=next.js"`,
		);
		const none = await page("?q=zzzz-nothing");
		expect(element(none, "skill-index-none")).toContain("No skill matches.");
		expect(sectionIds(none)).toEqual([]);
	});
});

describe("Discover", () => {
	it("lists what the live vendor and community sources offer, as samples with hashes and a disabled import", async () => {
		const html = await page("?view=discover");
		const discover = element(html, "skill-discover");
		expect(tagOf(html, "skill-discover-surface")).toContain(
			'data-state="success"',
		);
		expect(discover).not.toContain('data-kind="internal"');
		const entries = sampleRegistry(SOURCES);
		expect(entries.length).toBeGreaterThan(0);
		for (const entry of entries) {
			const row = element(discover, `skill-discover-entry-${entry.id}`);
			expect(row).toContain(entry.path);
			expect(row).toContain(`data-full="${entry.contentSha256}"`);
			expectDisabledWithReason(
				html,
				`skill-discover-import-${entry.id}`,
				SKILL_WRITE_REASON.import,
			);
		}
		expect(regions(html).map((r) => r.missing)).toEqual([
			CATALOG_MISSING.registry,
		]);
		expectLabelled(
			html,
			["skill-discover-search"],
			[`skill-discover-source-${source("vendor").id}`],
		);
		expect(tagOf(html, "skill-discover-search-input")).toContain(
			'placeholder="Search the sources"',
		);
		expect(html).toMatch(/<label[^>]*>Search the sources<\/label>/);
	});

	it("never offers an internal source's entry", () => {
		expect(sampleRegistry([source("internal")])).toEqual([]);
		expect(
			sampleRegistry(SOURCES).some((e) => e.sourceId === source("internal").id),
		).toBe(false);
	});

	it("ranks by source, then name, and shows no install count", async () => {
		const discover = element(await page("?view=discover"), "skill-discover");
		const ids = [
			...discover.matchAll(/data-testid="skill-discover-source-([^"]+)"/g),
		].map((m) => m[1]);
		expect(ids).toEqual(
			SOURCES.filter((s) => s.kind !== "internal").map((s) => s.id),
		);
		for (const id of ids) {
			const section = element(discover, `skill-discover-source-${id}`);
			const names = [...section.matchAll(/data-name="([^"]+)"/g)].map(
				(m) => m[1] ?? "",
			);
			expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
		}
		expect(discover).not.toMatch(/install(s|ed)\b/i);
	});

	it("has its own states: loading, none to offer, a failure", async () => {
		const loading = await renderSeeded(
			"/catalog/skills?view=discover",
			seededClient({ skills: SKILLS }),
		);
		expect(tagOf(loading, "skill-discover-surface")).toContain(
			'data-state="loading"',
		);
		expect(loading).toContain('data-testid="skill-discover-skeleton"');
		expect(loading).not.toContain('data-testid="sample-data"');

		// Only an internal source: nothing to discover.
		const none = await renderSeeded(
			"/catalog/skills?view=discover",
			seededClient({ skills: SKILLS, sources: [source("internal")] }),
		);
		expect(tagOf(none, "skill-discover-surface")).toContain(
			'data-state="empty"',
		);
		expect(none).toContain('data-testid="skill-discover-empty"');

		const failed = await renderSeeded(
			"/catalog/skills?view=discover",
			seededClient({
				skills: SKILLS,
				sources: internalError("/api/skill-sources"),
			}),
		);
		expect(tagOf(failed, "skill-discover-surface")).toContain(
			'data-state="error"',
		);
		expect(failed).toContain('data-testid="surface-error"');
	});
});

describe("New skill", () => {
	it("has the reference's fields, mapped to the contract, and can be saved", async () => {
		const html = await page("?view=new");
		const form = element(html, "skill-new-form");
		expect(form).toContain('data-testid="skill-editor-name"');
		expect(form).toContain("When to use it");
		expect(form).toContain("The agent reads only this to decide.");
		expect(form).toContain('data-testid="skill-editor-description"');
		expect(form).toContain('data-testid="skill-editor-content"');
		expect(form).toContain('data-testid="skill-editor-layer"');
		expect(form).toContain('data-testid="skill-editor-type"');
		expect(tagOf(html, "skill-editor-description-length")).toContain(
			'data-length="0"',
		);
		expect(tagOf(html, "skill-editor-submit")).not.toMatch(/\sdisabled=""/);
	});

	it("is a real form: no sample pill on it", async () => {
		const html = await page("?view=new");
		const rs = regions(html);
		expect(inside(rs, indexOf(html, "skill-new-form"))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// From the code review of 09b3b37 and 728e777.

describe("review fixes", () => {
	it("names a missing route only where avel-server has none", () => {
		expect(Object.keys(SKILL_WRITE_REASON).sort()).toEqual([
			"attach",
			"import",
		]);
		expect(SKILL_WRITE_REASON.import).toMatch(/^avel-server has no route/);
		// Attaching a role skill names its module-5 route.
		expect(SKILL_WRITE_REASON.attach).toBe(
			"Attaching a skill to a role uses PUT /api/skills/:id/roles/:role, arriving with module 5",
		);
		for (const reason of Object.values(SKILL_WRITE_REASON)) {
			expect(reason).not.toMatch(/module 4/);
		}
	});

	it("gives each copy a live region that says whether it worked", async () => {
		const html = await page(`?skill=${IMPORTED_CAPABILITY}`);
		for (const [block, button] of [
			["skill-pinned", "skill-hash-copy"],
			["skill-markdown", "skill-markdown-copy"],
		] as const) {
			const el = element(html, block);
			const after = el.slice(indexOf(el, button));
			expect(after, block).toMatch(/<span aria-live="polite" class="sr-only">/);
		}
	});
});

// ---------------------------------------------------------------------------
// Attached to: a role skill's attachments are role_skills (module 5), not
// recommendedFor, which only filters stack and domain skills at dispatch.

describe("role attachment", () => {
	const roleSkills = SKILLS.filter((s) => s.layer === "role");

	it("gives every role skill attachments of its own, and no other skill any", () => {
		for (const s of roleSkills) {
			expect(carryingRoles(s)).toBe(sampleRoleAttachments(s.slug));
		}
		for (const s of SKILLS.filter((s) => s.layer !== "role")) {
			expect(carryingRoles(s)).toBe(s.recommendedFor);
		}
		// The named samples differ from recommendedFor on purpose, so a mix-up shows.
		expect(
			roleSkills.some(
				(s) =>
					s.slug in SAMPLE_ROLE_ATTACHMENTS &&
					[...carryingRoles(s)].sort().join() !==
						[...s.recommendedFor].sort().join(),
			),
		).toBe(true);
	});

	it("shows the attached roles, even where recommendedFor disagrees", () => {
		// The two role skills whose attachment and recommendedFor disagree, each
		// rendered once (the inspector alone).
		const cases = [
			// Recommended for property-tests, but not attached to it.
			{ slug: "criterion-tags", off: "property-tests" },
			// Attached to backend-tests, though not recommended for it.
			{ slug: ROLE_SKILL, on: "backend-tests" },
		] as const;
		for (const c of cases) {
			const s = skill(c.slug);
			const shown = tagRoles(element(inspector(s), "skill-attach-sample"));
			// Exactly the attachment, in catalog order.
			expect(shown, c.slug).toEqual(
				ROLES.filter((role) => carryingRoles(s).includes(role)),
			);
			// The disagreement itself, by name.
			if ("off" in c) {
				expect(s.recommendedFor).toContain(c.off);
				expect(shown).not.toContain(c.off);
			}
			if ("on" in c) {
				expect(s.recommendedFor).not.toContain(c.on);
				expect(shown).toContain(c.on);
			}
		}
	});

	it("lists as carriers the live agents covering an attached role, behind the attachment pill", async () => {
		const s = skill("agreeing-wrong-tests");
		const carriers = agentsOfSkill(s, AGENTS)
			.map((a) => a.slug)
			.sort();
		// By recommendedFor alone it would be Brennan only; attachment adds Zane.
		expect(carriers).toEqual(["brennan", "zane"]);
		const html = await page("?skill=agreeing-wrong-tests");
		const carried = element(html, "skill-carried-by");
		for (const slug of carriers) {
			expect(carried).toContain(`href="/catalog/agents/${slug}"`);
		}
		expect(tagOf(html, "skill-carried-by-sample")).toContain(
			`data-sample-region="${CATALOG_MISSING.roleAttachments}"`,
		);
	});

	it("reads the carriers' templates live: loading, a failure, none", () => {
		const s = skill(IMPORTED_CAPABILITY);
		const loading = inProviders(<SkillInspector skill={s} />, seededClient());
		expect(tagOf(loading, "skill-carried-by-surface")).toContain(
			'data-state="loading"',
		);
		expect(loading).toContain('data-testid="skill-carried-by-skeleton"');
		const failed = inProviders(
			<SkillInspector skill={s} />,
			seededClient({ agents: internalError("/api/agent-templates") }),
		);
		expect(tagOf(failed, "skill-carried-by-surface")).toContain(
			'data-state="error"',
		);
		const none = inProviders(
			<SkillInspector skill={s} />,
			seededClient({ agents: [] }),
		);
		expect(tagOf(none, "skill-carried-by-surface")).toContain(
			'data-state="success"',
		);
		expect(element(none, "skill-carried-by-none")).toContain(
			"No agent covers a role this skill is recommended for.",
		);
	});

	it("labels the attachments as waiting on module 5's attachment read", async () => {
		const html = await page(`?skill=${ROLE_SKILL}`);
		expect(tagOf(html, "skill-attach-sample")).toContain(
			`data-sample-region="${CATALOG_MISSING.roleAttachments}"`,
		);
		expect(CATALOG_MISSING.roleAttachments).toBe(
			"GET /api/skills/:id/roles (module 5)",
		);
	});

	it("keeps a stack skill's carriers live: recommendedFor, no pill", async () => {
		const html = await page(`?skill=${IMPORTED_CAPABILITY}`);
		expect(carryingRoles(skill(IMPORTED_CAPABILITY))).toEqual(
			skill(IMPORTED_CAPABILITY).recommendedFor,
		);
		expect(element(html, "skill-carried-by")).not.toContain(
			"data-sample-region=",
		);
	});
});

describe("Attached to, polished", () => {
	it("explains what an attached role means", async () => {
		const panel = element(
			await page(`?skill=${ROLE_SKILL}`),
			"skill-attach-panel",
		);
		expect(panel).toContain(
			"Every agent covering one of these roles carries the skill in its identity",
		);
	});

	it("totals the attached roles and teams, singular and plural, without a middle dot", () => {
		expect(attachedTotal(1, 1)).toBe("1 role on 1 team");
		expect(attachedTotal(2, 1)).toBe("2 roles on 1 team");
		expect(attachedTotal(4, 2)).toBe("4 roles across 2 teams");
		expect(attachedTotal(4, 2)).not.toContain(MIDDLE_DOT);
	});

	it("groups the attached roles by team in catalog order, leaving out teams with none", () => {
		expect(attachedTeams([])).toEqual([]);
		// Given in reverse, read back in the catalog's order.
		const on = [...ROLES].reverse();
		const groups = attachedTeams(on);
		expect(groups.map((g) => g.team)).toEqual(
			TEAMS.filter((team) => groups.some((g) => g.team === team)),
		);
		expect(groups.flatMap((g) => g.roles)).toEqual(
			TEAMS.flatMap((team) => groups.find((g) => g.team === team)?.roles ?? []),
		);
		for (const g of groups) {
			expect(g.roles).toEqual(ROLES.filter((r) => g.roles.includes(r)));
		}
		expect(groups.flatMap((g) => g.roles).sort()).toEqual([...ROLES].sort());
		const one = ROLES[0];
		if (one === undefined) return;
		expect(attachedTeams([one])).toHaveLength(1);
		expect(attachedTeams([one])[0]?.roles).toEqual([one]);
	});

	it("offers one Change roles, disabled with its reason, outside the samples", async () => {
		const html = await page(`?skill=${ROLE_SKILL}`);
		expect(html.match(/data-testid="skill-attach-change"/g)).toHaveLength(1);
		expect(element(html, "skill-attach-change")).toContain("Change roles");
		expectDisabledWithReason(
			html,
			"skill-attach-change",
			SKILL_WRITE_REASON.attach,
		);
		expect(inside(regions(html), indexOf(html, "skill-attach-change"))).toBe(
			false,
		);
		expect(element(html, "skill-attach-panel")).toContain(
			'data-testid="skill-attach-change"',
		);
		// The old per-role caption is gone.
		expect(html).not.toContain('data-testid="skill-attach-reason"');
	});
});

// ---------------------------------------------------------------------------
// From the Skills browser check.

describe("visual-pass fixes", () => {
	it("shows each attached role as a compact tag: its name, the slug on hover", async () => {
		const sample = element(
			await page(`?skill=${ROLE_SKILL}`),
			"skill-attach-sample",
		);
		const tags = [
			...sample.matchAll(/<[a-z]+[^>]*data-testid="catalog-role"[^>]*>/g),
		].map((m) => m[0]);
		expect(tags.length).toBe(carryingRoles(skill(ROLE_SKILL)).length);
		for (const tag of tags) {
			const role = tag.match(/data-role="([a-z-]+)"/)?.[1];
			expect(tag).toContain(`title="${role}"`);
		}
		expect(sample).not.toContain('class="type-mono text-text-subtle"');
	});

	it("keeps the actions after the header's facts, wrapping under them when narrow", async () => {
		const html = await page(`?skill=${ROLE_SKILL}`);
		const block = element(html, "skill-header");
		expect(block.indexOf('data-testid="skill-actions"')).toBeGreaterThan(
			block.indexOf('data-testid="skill-header-facts"'),
		);
		expect(block).toMatch(/class="flex flex-wrap items-start/);
	});

	it("marks the headings in AVEL's additions, under a label that doesn't repeat them", async () => {
		const html = await page(`?skill=${WITH_ADDITIONS}`);
		const additions = element(html, "skill-additions");
		expect(additions).toContain(">Kept apart from the original<");
		expect(element(additions, "skill-additions-code-text")).toMatch(
			/<span data-tone="heading"[^>]*>## AVEL&#x27;s additions/,
		);
	});

	it("marks the open Discover view with the selected fill and aria-current", async () => {
		const open = tagOf(await page("?view=discover"), "skills-discover");
		expect(open).toContain('aria-current="page"');
		expect(open).toMatch(/\bbg-selected\b/);
		// v3's selected edge; it outranks the outline's own border-strong.
		expect(classes(await page("?view=discover"), "skills-discover")).toContain(
			"border-selected-border",
		);
		expect(open).not.toMatch(/\bborder-border-strong\b/);
		const shut = tagOf(await page(), "skills-discover");
		expect(shut).not.toContain("aria-current");
		expect(shut).not.toMatch(/\bbg-selected\b/);
		expect(shut).not.toMatch(/\bborder-selected-border\b/);
	});
});

describe("layout", () => {
	it("is one column: the index alone, with no trail, no sidebar and no panel", async () => {
		const html = await page();
		expect(html).toContain('data-testid="skill-index"');
		expect(html).not.toContain('data-testid="catalog-skills-back"');
		expect(html).not.toContain('data-testid="skill-sidebar"');
		expect(html).not.toContain('data-testid="catalog-skills-list-pane"');
		expect(html).not.toContain('data-testid="catalog-skills-detail-pane"');
		expect(classes(html, "catalog-skills")).toEqual(
			expect.arrayContaining(["mx-auto", "max-w-3xl"]),
		);
	});

	for (const [search, current] of [
		[`?skill=${ROLE_SKILL}`, ROLE_SKILL],
		[`?skill=${ROLE_SKILL}&view=edit`, `${ROLE_SKILL}, edit`],
		["?view=discover", "Discover"],
		["?view=new", "New skill"],
		["?view=sources", "Sources"],
	] as const) {
		it(`replaces the index with the view under a trail back (${search})`, async () => {
			const html = await page(search);
			expect(html).not.toContain('data-testid="skill-index"');
			const trail = element(html, "catalog-skills-back");
			expect(trail).toMatch(/^<nav[^>]*aria-label="Skill"/);
			expect(tagOf(trail, "skill-trail-index")).toContain(
				'href="/catalog/skills"',
			);
			expect(element(trail, "skill-trail-index")).toContain(">Skills<");
			expect(trail).toMatch(
				new RegExp(`<span aria-current="page"[^>]*>${current}</span>`),
			);
		});
	}

	it("widens the column for Sources alone", async () => {
		expect(classes(await page("?view=sources"), "catalog-skills")).toContain(
			"max-w-5xl",
		);
		expect(
			classes(await page(`?skill=${ROLE_SKILL}`), "catalog-skills"),
		).toContain("max-w-3xl");
	});

	it("lets a view outrank a selection", async () => {
		const html = await page(`?skill=${ROLE_SKILL}&view=new`);
		expect(html).toContain('data-testid="skill-new"');
		expect(html).not.toContain('data-testid="skill-inspector"');
		expect(element(html, "catalog-skills-back")).toContain(">New skill<");
	});
});
