import {
	ROLE_TEAM,
	ROLES,
	type Skill,
	skillSchema,
} from "avel-server/contract";
import { describe, expect, it } from "vitest";
import {
	agentsOfSkill,
	CATALOG_MISSING,
	carryingRoles,
	SAMPLE_ROLE_ATTACHMENTS,
	SAMPLE_TEAM_TABLE,
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
	attachedCount,
	HASH_COVERS,
	SKILL_WRITE_REASON,
	SkillInspector,
	skillMarkdown,
	sourceLine,
} from "@/components/avel/catalog-skill-inspector";
import {
	filterSkills,
	groupBySource,
	reviewBannerText,
} from "@/components/avel/catalog-skill-sidebar";
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
 * /catalog/skills as a registry (the Skill Center brief): a sidebar grouped
 * by source with a review banner, and one skill's inspector, Discover, or a
 * new skill. The skills, the selected skill, the templates that carry it and
 * the sources are live, rendered through the real router with a seeded
 * QueryClient. A role skill's attachments and a source's index are labelled
 * samples (AVEL-DESIGN.md ruling 32). The writes with a route are live
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

/** The slugs of the sidebar's rows: links carrying a data-status. */
const rowSlugs = (html: string): string[] =>
	[
		...html.matchAll(/data-testid="skill-row-([a-z0-9-]+)"[^>]*data-status=/g),
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

/** Every role switch's state in a page, read from the attach panel once. */
function switchStates(html: string): Map<string, string> {
	const panel = element(html, "skill-attach-panel");
	const states = new Map<string, string>();
	for (const [tag] of panel.matchAll(/<button[^>]*>/g)) {
		const role = tag.match(/data-testid="skill-role-([a-z-]+)"/)?.[1];
		const state = tag.match(/data-state="([a-z]+)"/)?.[1];
		if (role && state) states.set(role, state);
	}
	return states;
}

const ROLE_SKILL = "property-testing-fast-check";
const IMPORTED_CAPABILITY = "database-read";
const WITH_ADDITIONS = "nextjs-route-handlers";

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

describe("sidebar rules", () => {
	it("puts Yours first, then each other source by name, leaving out empty groups", () => {
		const groups = groupBySource(SKILLS);
		expect(groups[0]?.label).toBe("Yours");
		const rest = groups.slice(1).map((g) => g.label);
		expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
		expect(groups.reduce((n, g) => n + g.skills.length, 0)).toBe(SKILLS.length);
		expect(groupBySource([])).toEqual([]);
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

	it("words the banner without a middle dot, singular and plural", () => {
		expect(reviewBannerText(1)).toBe("1 update needs review");
		expect(reviewBannerText(2)).toBe("2 updates need review");
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
				"skill-approve",
				"skill-retire",
				"skill-filter",
				`skill-row-${IMPORTED_CAPABILITY}`,
				"skill-status",
				"skill-hash",
				"skill-description-length",
				"skill-capability",
				"skill-code",
				"catalog-agent-link-iyo",
			],
			[],
		);
	});

	it("samples only a role skill's attachments and the carriers they imply", async () => {
		const html = await page(`?skill=${ROLE_SKILL}`);
		expect(new Set(regions(html).map((r) => r.missing))).toEqual(
			new Set([CATALOG_MISSING.roleAttachments]),
		);
		expectLabelled(
			html,
			[
				"skill-approve",
				"skill-retire",
				"skill-status",
				"skill-hash",
				"skill-code",
			],
			["skill-role-property-tests", "skill-carried-by-list"],
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
		const retired = await page("?skill=package-registry");
		for (const [testid, reason] of [
			["skill-edit", editBlocker(skill("package-registry"))],
			["skill-approve", approveBlocker(skill("package-registry"))],
			["skill-retire", retireBlocker(skill("package-registry"))],
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
		expect(element(html, "skill-hash")).toContain(
			`data-full="${s.contentSha256}"`,
		);
		expect(element(html, "skill-hash-covers")).toContain(
			HASH_COVERS.replaceAll("'", "&#x27;"),
		);
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

	it("shows SKILL.md with its frontmatter and headings marked, and AVEL's additions apart", async () => {
		const html = await page(`?skill=${WITH_ADDITIONS}`);
		const code = element(html, "skill-code-text");
		expect(code).toMatch(/<span data-tone="key"[^>]*>name: /);
		expect(code).toMatch(/<span data-tone="key"[^>]*>version: /);
		expect(code).toMatch(/<span data-tone="heading"[^>]*># /);
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
			`?skill=${IMPORTED_CAPABILITY}`,
			`?skill=${ROLE_SKILL}`,
			"?view=discover",
			"?view=new",
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

	it("counts from meta.total in the top bar, and offers the next page", async () => {
		expect(element(await page(), "topbar-subtitle")).toContain(
			`>${SKILLS.length} skills<`,
		);
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
	it("gives a role skill one disabled switch per role, grouped by team, from its sample attachments", async () => {
		const html = await page(`?skill=${ROLE_SKILL}`);
		const s = skill(ROLE_SKILL);
		const panel = element(html, "skill-attach-panel");
		for (const { team } of SAMPLE_TEAM_TABLE) {
			const card = element(panel, `skill-team-${team}`);
			const roles = ROLES.filter((role) => ROLE_TEAM[role] === team);
			for (const role of roles) {
				expect(card, role).toContain(`data-testid="skill-role-${role}"`);
				const sw = tagOf(card, `skill-role-${role}`);
				// Attachment (role_skills), never recommendedFor.
				const on = carryingRoles(s).includes(role);
				expect(sw, role).toContain(
					`data-state="${on ? "checked" : "unchecked"}"`,
				);
				expect(sw, role).toMatch(/\sdisabled=""/);
				expect(sw, role).toMatch(/aria-describedby="[^"]+"/);
			}
		}
		expect(html).toContain(SKILL_WRITE_REASON.attach.replaceAll("'", "&#x27;"));
		// Platform roles are code: no team card, no switch.
		expect(panel).not.toContain('data-testid="skill-role-render"');
		expect(tagOf(html, "skill-attach-sample")).toContain(
			`data-sample-region="${CATALOG_MISSING.roleAttachments}"`,
		);
	});

	it("says a stack skill is given at dispatch, live, with no role switches and no pill", async () => {
		const html = await page(`?skill=${IMPORTED_CAPABILITY}`);
		const panel = element(html, "skill-attach-panel");
		expect(panel).not.toContain('data-slot="switch"');
		expect(panel).not.toContain("data-sample-region=");
		expect(html).not.toContain('data-testid="skill-attach-reason"');
		expect(element(panel, "skill-dispatch")).toContain(
			"given at dispatch to missions whose roles include",
		);
		for (const role of skill(IMPORTED_CAPABILITY).recommendedFor) {
			expect(panel).toContain(`>${role}<`);
		}
	});
});

describe("the sidebar", () => {
	it("groups rows by source, Yours first, with counts, behind no pill", async () => {
		const html = await page();
		const sidebar = element(html, "skill-sidebar");
		expect(sidebar).not.toContain('data-testid="sample-data"');
		const order = [
			...sidebar.matchAll(/data-testid="skill-group-([^"]+)"/g),
		].map((m) => m[1]);
		expect(order[0]).toBe("yours");
		for (const group of groupBySource(SKILLS)) {
			const el = element(sidebar, `skill-group-${group.id}`);
			expect(el).toContain(`>${group.label}<`);
			expect(el).toContain(`>${group.skills.length}<`);
			for (const s of group.skills) {
				expect(el).toContain(`data-testid="skill-row-${s.slug}"`);
			}
		}
	});

	it("marks drafts with a dot and quiets retired skills to the subtle ink", async () => {
		const html = await page();
		for (const s of SKILLS) {
			const row = element(html, `skill-row-${s.slug}`);
			expect(row.includes('data-testid="skill-row-draft"'), s.slug).toBe(
				s.status === "draft",
			);
			expect(
				/\btext-text-subtle\b/.test(tagOf(row, "skill-row-name")),
				s.slug,
			).toBe(s.status === "retired");
			expect(classes(html, `skill-row-${s.slug}`).join(" ")).not.toMatch(
				/opacity/,
			);
		}
	});

	it("shows the review banner, linking to the drafts and back", async () => {
		const count = skillsNeedingReview(SKILLS).length;
		const all = await page();
		const banner = element(all, "skill-review-banner");
		expect(banner).toContain(reviewBannerText(count));
		expect(tagOf(all, "skill-review-banner")).toContain(
			'href="/catalog/skills?filter=drafts"',
		);

		const drafts = await page("?filter=drafts");
		expect(tagOf(drafts, "skill-review-banner")).toContain(
			'href="/catalog/skills"',
		);
		const shown = rowSlugs(element(drafts, "skill-sidebar"));
		expect(shown.sort()).toEqual(
			SKILLS.filter((s) => s.status === "draft")
				.map((s) => s.slug)
				.sort(),
		);
	});

	it("filters by the q in the URL, and says when nothing matches", async () => {
		const one = element(await page("?q=next.js"), "skill-sidebar");
		expect(rowSlugs(one)).toEqual([WITH_ADDITIONS]);
		expect(await page("?q=zzzz-nothing")).toContain(
			'data-testid="skill-sidebar-none"',
		);
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

	it("gives each hash copy a live region that says whether it worked", async () => {
		const hash = element(
			await page(`?skill=${IMPORTED_CAPABILITY}`),
			"skill-hash",
		);
		expect(hash).toMatch(
			/<span aria-live="polite" data-testid="skill-hash-copy-status" class="sr-only">/,
		);
	});
});

// ---------------------------------------------------------------------------
// Attaches to: a role skill's attachments are role_skills (module 5), not
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

	it("sets each switch from the attachment, even where recommendedFor disagrees", () => {
		// The two role skills whose attachment and recommendedFor disagree, each
		// rendered once (the inspector alone), every role's switch checked.
		const cases = [
			// Recommended for property-tests, but not attached to it.
			{ slug: "criterion-tags", off: "property-tests" },
			// Attached to backend-tests, though not recommended for it.
			{ slug: ROLE_SKILL, on: "backend-tests" },
		] as const;
		const roles = ROLES.filter((r) => ROLE_TEAM[r] !== "platform");
		for (const c of cases) {
			const s = skill(c.slug);
			const states = switchStates(inspector(s));
			const attached = carryingRoles(s);
			// Every role has a switch, and each one follows the attachment.
			expect([...states.keys()].sort(), c.slug).toEqual([...roles].sort());
			for (const role of roles) {
				expect(states.get(role), `${c.slug} ${role}`).toBe(
					attached.includes(role) ? "checked" : "unchecked",
				);
			}
			// The disagreement itself, by name.
			if ("off" in c) {
				expect(s.recommendedFor).toContain(c.off);
				expect(states.get(c.off)).toBe("unchecked");
			}
			if ("on" in c) {
				expect(s.recommendedFor).not.toContain(c.on);
				expect(states.get(c.on)).toBe("checked");
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

	it("labels the switches as waiting on module 5's attachment read", async () => {
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

describe("Attaches to, polished", () => {
	it("explains what turning a role on does", async () => {
		const panel = element(
			await page(`?skill=${ROLE_SKILL}`),
			"skill-attach-panel",
		);
		expect(panel).toContain(
			"Every agent covering a role turned on here carries the skill in its identity",
		);
	});

	it("counts the attached roles in each team's header", async () => {
		const html = await page(`?skill=${ROLE_SKILL}`);
		const on = carryingRoles(skill(ROLE_SKILL));
		for (const { team } of SAMPLE_TEAM_TABLE) {
			const roles = ROLES.filter((r) => ROLE_TEAM[r] === team);
			const n = roles.filter((r) => on.includes(r)).length;
			expect(element(html, `skill-team-${team}-count`)).toContain(
				`>${n} of ${roles.length} attached<`,
			);
		}
		expect(attachedCount(["schema", "contract"], ["schema"])).toBe(
			"1 of 2 attached",
		);
	});

	it("marks the Firm roles, and only them, without blocking them", async () => {
		const html = await page(`?skill=${ROLE_SKILL}`);
		const firm = ROLES.filter((r) => ROLE_TEAM[r] === "firm");
		expect(firm).toEqual(["intake", "strategy", "research", "client-ops"]);
		for (const role of firm) {
			expect(html).toContain(`data-testid="skill-role-${role}-firm"`);
		}
		expect(html.match(/data-testid="skill-role-[a-z-]+-firm"/g)).toHaveLength(
			firm.length,
		);
		expect(tagOf(html, "skill-team-firm")).toContain('data-firm="true"');
		expect(element(html, "skill-team-firm-note")).toContain(
			"never on a mission roster",
		);
	});

	it("shows the disabled reason once, without hovering, outside the samples", async () => {
		const html = await page(`?skill=${ROLE_SKILL}`);
		const reason = element(html, "skill-attach-reason");
		expect(reason).toContain(
			`Read-only for now. ${SKILL_WRITE_REASON.attach}.`,
		);
		expect(html.match(/data-testid="skill-attach-reason"/g)).toHaveLength(1);
		expect(inside(regions(html), indexOf(html, "skill-attach-reason"))).toBe(
			false,
		);
		// Each switch still carries it in its tooltip and aria-describedby.
		expect(tagOf(html, "skill-role-domain")).toMatch(
			/aria-describedby="[^"]+"/,
		);
	});
});

// ---------------------------------------------------------------------------
// From the Skills browser check.

describe("visual-pass fixes", () => {
	it("captions each attached role, since a disabled switch barely shows on", async () => {
		const html = await page(`?skill=${ROLE_SKILL}`);
		const attached = [
			...html.matchAll(/data-testid="skill-role-([a-z-]+)-attached"/g),
		].map((m) => m[1]);
		const on = [...carryingRoles(skill(ROLE_SKILL))];
		expect(attached.sort()).toEqual(on.sort());
		for (const role of on) {
			expect(element(html, `skill-role-${role}-attached`)).toContain(
				">attached<",
			);
			// Inside the sample region, beside its switch.
			const sample = element(html, "skill-attach-sample");
			expect(sample).toContain(`data-testid="skill-role-${role}-attached"`);
		}
	});

	it("puts the actions above the header below lg, beside it from lg", async () => {
		const html = await page(`?skill=${ROLE_SKILL}`);
		const header = classes(html, "skill-header");
		expect(header).toEqual(
			expect.arrayContaining(["flex-col-reverse", "lg:flex-row"]),
		);
		// The actions come last in the markup, so flex-col-reverse lifts them.
		const block = element(html, "skill-header");
		expect(block.indexOf('data-testid="skill-actions"')).toBeGreaterThan(
			block.indexOf('data-testid="skill-header-facts"'),
		);
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
	it("is the sidebar alone below lg until something is shown", async () => {
		const html = await page();
		expect(classes(html, "catalog-skills-list-pane")).not.toContain(
			"max-lg:hidden",
		);
		expect(classes(html, "catalog-skills-detail-pane")).toContain(
			"max-lg:hidden",
		);
		expect(html).not.toContain('data-testid="catalog-skills-back"');
		expect(html).toContain('data-testid="catalog-skills-choose"');
	});

	for (const search of [
		`?skill=${ROLE_SKILL}`,
		"?view=discover",
		"?view=new",
	]) {
		it(`replaces the sidebar below lg with a way back (${search})`, async () => {
			const html = await page(search);
			expect(classes(html, "catalog-skills-list-pane")).toContain(
				"max-lg:hidden",
			);
			expect(tagOf(html, "catalog-skills-back")).toContain(
				'href="/catalog/skills"',
			);
			expect(classes(html, "catalog-skills-back")).toContain("lg:hidden");
		});
	}

	it("lets a view outrank a selection", async () => {
		const html = await page(`?skill=${ROLE_SKILL}&view=new`);
		expect(html).toContain('data-testid="skill-new"');
		expect(html).not.toContain('data-testid="skill-inspector"');
		expect(tagOf(html, `skill-row-${ROLE_SKILL}`)).not.toContain(
			"data-selected",
		);
	});
});
