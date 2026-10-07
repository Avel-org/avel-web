import { ROLES, skillSchema } from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	agentsOfSkill,
	CATALOG_MISSING,
	catalogPillReason,
	SAMPLE_FAMILY_TABLE,
	SAMPLE_REGISTRY,
	SAMPLE_ROLE_FAMILY,
	SAMPLE_SKILLS,
	SAMPLE_SOURCES,
	sampleSkill,
	skillsNeedingReview,
} from "@/components/avel/catalog-placeholders";
import {
	filterRegistry,
	SkillDiscover,
} from "@/components/avel/catalog-skill-discover";
import {
	HASH_COVERS,
	SKILL_WRITE_REASON,
	skillMarkdown,
	sourceLine,
} from "@/components/avel/catalog-skill-inspector";
import {
	filterSkills,
	groupBySource,
	reviewBannerText,
} from "@/components/avel/catalog-skill-sidebar";
import { selectedSkill } from "@/components/avel/catalog-skills";
import { TooltipProvider } from "@/components/ui/tooltip";
import { renderPage, tagOf } from "./render-page";

/*
 * /catalog/skills as a registry (the Skill Center brief): a sidebar grouped
 * by source with a review banner, and one skill's inspector, Discover, or a
 * new skill. Everything shown is a labelled sample (AVEL-DESIGN.md ruling 32);
 * every write is a real control, disabled with its reason.
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
	expect(rs.length).toBeGreaterThan(0);
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

const page = (search = "") => renderPage(`/catalog/skills${search}`);

const ROLE_SKILL = "property-testing-fast-check";
const IMPORTED_CAPABILITY = "database-read";
const WITH_ADDITIONS = "nextjs-route-handlers";

// ---------------------------------------------------------------------------
// The samples.

describe("skill samples", () => {
	it("parse as the contract's full Skill, text included", () => {
		for (const skill of SAMPLE_SKILLS) {
			expect(skillSchema.parse(skill)).toEqual(skill);
			expect(skill.contentMd.length, skill.slug).toBeGreaterThan(0);
		}
	});

	it("keep AVEL's additions only on imported skills", () => {
		for (const skill of SAMPLE_SKILLS) {
			if (skill.avelEnhancementMd !== null) {
				expect(skill.source.kind, skill.slug).not.toBe("internal");
			}
		}
		expect(sampleSkill(WITH_ADDITIONS)?.avelEnhancementMd).not.toBeNull();
	});

	it("offer registry entries only from vendor and community sources, each hashed", () => {
		const outside = new Set(
			SAMPLE_SOURCES.filter((s) => s.kind !== "internal").map((s) => s.id),
		);
		for (const entry of SAMPLE_REGISTRY) {
			expect(outside.has(entry.sourceId), entry.name).toBe(true);
			expect(entry.contentSha256).toMatch(/^[0-9a-f]{64}$/);
		}
	});

	it("count only imported drafts as needing review", () => {
		const review = skillsNeedingReview(SAMPLE_SKILLS);
		expect(review.length).toBeGreaterThan(0);
		for (const skill of review) {
			expect(skill.status).toBe("draft");
			expect(skill.source.kind).not.toBe("internal");
		}
	});
});

// ---------------------------------------------------------------------------
// Pure rules.

describe("sidebar rules", () => {
	it("puts Yours first, then each other source by name, leaving out empty groups", () => {
		const groups = groupBySource(SAMPLE_SKILLS);
		expect(groups[0]?.label).toBe("Yours");
		const rest = groups.slice(1).map((g) => g.label);
		expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
		expect(groups.reduce((n, g) => n + g.skills.length, 0)).toBe(
			SAMPLE_SKILLS.length,
		);
		expect(groupBySource([])).toEqual([]);
	});

	it("filters by name, slug or description, ignoring case, and by drafts", () => {
		expect(
			filterSkills(SAMPLE_SKILLS, "DRIZZLE", false).map((s) => s.slug),
		).toEqual(["drizzle-migrations"]);
		expect(filterSkills(SAMPLE_SKILLS, "  ", false)).toHaveLength(
			SAMPLE_SKILLS.length,
		);
		const drafts = filterSkills(SAMPLE_SKILLS, undefined, true);
		expect(drafts.length).toBeGreaterThan(0);
		expect(drafts.every((s) => s.status === "draft")).toBe(true);
	});

	it("words the banner without a middle dot, singular and plural", () => {
		expect(reviewBannerText(1)).toBe("1 update needs review");
		expect(reviewBannerText(2)).toBe("2 updates need review");
	});

	it("filters the registry by name, path or description", () => {
		expect(filterRegistry(SAMPLE_REGISTRY, "zod").map((e) => e.name)).toEqual([
			"zod-at-the-edge",
		]);
		expect(filterRegistry(SAMPLE_REGISTRY, "")).toHaveLength(
			SAMPLE_REGISTRY.length,
		);
	});
});

describe("SKILL.md", () => {
	it("is frontmatter (name, description, version), then the content", () => {
		const skill = sampleSkill(ROLE_SKILL);
		expect(skill).toBeDefined();
		if (!skill) return;
		const lines = skillMarkdown(skill).split("\n");
		expect(lines.slice(0, 5)).toEqual([
			"---",
			`name: ${skill.slug}`,
			`description: ${skill.description}`,
			`version: ${skill.version}`,
			"---",
		]);
		expect(skillMarkdown(skill).endsWith(skill.contentMd)).toBe(true);
	});

	it("never merges AVEL's additions into the original", () => {
		const skill = sampleSkill(WITH_ADDITIONS);
		const additions = skill?.avelEnhancementMd ?? "";
		expect(additions.length).toBeGreaterThan(0);
		expect(skill && skillMarkdown(skill)).not.toContain(additions);
	});

	it("names its source in words, without a middle dot", () => {
		const internal = SAMPLE_SKILLS.find((s) => s.source.kind === "internal");
		const vendor = SAMPLE_SKILLS.find((s) => s.source.kind === "vendor");
		expect(internal && sourceLine(internal)).toBe("Yours");
		expect(vendor && sourceLine(vendor)).toBe(
			"From Framework vendor pack, example.com/vendor/skills",
		);
	});
});

// ---------------------------------------------------------------------------
// The page.

describe("/catalog/skills, a skill", () => {
	it("renders the same samples on every visit (sample regions only)", async () => {
		// Only the regions are compared: the rest of the page holds ids and
		// timing that are not the samples' to keep stable.
		const take = async () =>
			regions(await page(`?skill=${IMPORTED_CAPABILITY}`)).map((r) =>
				r.html.replace(/_r_[0-9a-z]+_/g, "_id_"),
			);
		const first = await take();
		expect(first.length).toBeGreaterThan(0);
		expect(await take()).toEqual(first);
	});

	it("labels every sample region, and keeps the write controls real", async () => {
		const html = await page(`?skill=${IMPORTED_CAPABILITY}`);
		expectLabelled(
			html,
			[
				"skills-discover",
				"skills-new",
				"skill-approve",
				"skill-retire",
				"skill-filter",
			],
			[
				`skill-row-${IMPORTED_CAPABILITY}`,
				"skill-status",
				"skill-hash",
				"skill-description-length",
				"skill-capability",
				"skill-code",
				"catalog-agent-link-iyo",
			],
		);
		expect(new Set(regions(html).map((r) => r.missing))).toEqual(
			new Set([
				CATALOG_MISSING.skills,
				CATALOG_MISSING.skill,
				CATALOG_MISSING.templates,
			]),
		);
	});

	it("disables Approve and Retire, each with its reason", async () => {
		const html = await page(`?skill=${IMPORTED_CAPABILITY}`);
		expectDisabledWithReason(html, "skill-approve", SKILL_WRITE_REASON.approve);
		expectDisabledWithReason(html, "skill-retire", SKILL_WRITE_REASON.retire);
	});

	it("shows the technical facts", async () => {
		const html = await page(`?skill=${IMPORTED_CAPABILITY}`);
		const skill = sampleSkill(IMPORTED_CAPABILITY);
		const facts = element(html, "skill-facts");
		expect(facts).toContain(">stack<");
		expect(facts).toContain(">capability<");
		expect(element(html, "skill-status")).toContain(">Draft<");
		expect(element(html, "skill-hash")).toContain(
			`data-full="${skill?.contentSha256}"`,
		);
		expect(element(html, "skill-hash-covers")).toContain(
			HASH_COVERS.replaceAll("'", "&#x27;"),
		);
		expect(tagOf(html, "skill-description-length")).toContain(
			`data-length="${skill?.description.length}"`,
		);
		expect(element(html, "skill-io")).toContain("reads large → returns small");
		for (const grant of skill?.type === "capability" ? skill.grants : []) {
			expect(element(html, "skill-capability")).toContain(`>${grant}<`);
		}
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

	it("links each agent that carries it", async () => {
		const html = await page(`?skill=${IMPORTED_CAPABILITY}`);
		const skill = sampleSkill(IMPORTED_CAPABILITY);
		const carriers = skill ? agentsOfSkill(skill) : [];
		expect(carriers.length).toBeGreaterThan(0);
		for (const agent of carriers) {
			expect(element(html, "skill-carried-by")).toContain(
				`href="/catalog/agents?agent=${agent.slug}"`,
			);
		}
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

describe("attaching", () => {
	it("gives a role skill one disabled switch per role, grouped by family", async () => {
		const html = await page(`?skill=${ROLE_SKILL}`);
		const skill = sampleSkill(ROLE_SKILL);
		const panel = element(html, "skill-attach-panel");
		for (const { family } of SAMPLE_FAMILY_TABLE) {
			const card = element(panel, `skill-family-${family}`);
			const roles = ROLES.filter((role) => SAMPLE_ROLE_FAMILY[role] === family);
			for (const role of roles) {
				expect(card, role).toContain(`data-testid="skill-role-${role}"`);
				const sw = tagOf(card, `skill-role-${role}`);
				const on = skill?.recommendedFor.includes(role) ?? false;
				expect(sw, role).toContain(
					`data-state="${on ? "checked" : "unchecked"}"`,
				);
				expect(sw, role).toMatch(/\sdisabled=""/);
				expect(sw, role).toMatch(/aria-describedby="[^"]+"/);
			}
		}
		expect(html).toContain(SKILL_WRITE_REASON.attach.replaceAll("'", "&#x27;"));
		// Platform roles are code: no family card, no switch.
		expect(panel).not.toContain('data-testid="skill-role-render"');
	});

	it("says a stack skill is given at dispatch, with no role switches", async () => {
		const html = await page(`?skill=${IMPORTED_CAPABILITY}`);
		const panel = element(html, "skill-attach-panel");
		expect(panel).not.toContain('data-slot="switch"');
		expect(element(panel, "skill-dispatch")).toContain(
			"given at dispatch to missions whose roles include",
		);
		for (const role of sampleSkill(IMPORTED_CAPABILITY)?.recommendedFor ?? []) {
			expect(panel).toContain(`>${role}<`);
		}
	});
});

describe("the sidebar", () => {
	it("groups rows by source, Yours first, with counts", async () => {
		const html = await page();
		const sidebar = element(html, "skill-sidebar");
		const order = [
			...sidebar.matchAll(/data-testid="skill-group-([^"]+)"/g),
		].map((m) => m[1]);
		expect(order[0]).toBe("yours");
		for (const group of groupBySource(SAMPLE_SKILLS)) {
			const el = element(sidebar, `skill-group-${group.id}`);
			expect(el).toContain(`>${group.label}<`);
			expect(el).toContain(`>${group.skills.length}<`);
			for (const skill of group.skills) {
				expect(el).toContain(`data-testid="skill-row-${skill.slug}"`);
			}
		}
	});

	it("marks drafts with a dot and dims retired skills", async () => {
		const html = await page();
		for (const skill of SAMPLE_SKILLS) {
			const row = element(html, `skill-row-${skill.slug}`);
			expect(row.includes('data-testid="skill-row-draft"'), skill.slug).toBe(
				skill.status === "draft",
			);
			expect(
				classes(html, `skill-row-${skill.slug}`).includes(
					"opacity-(--opacity-disabled)",
				),
				skill.slug,
			).toBe(skill.status === "retired");
		}
	});

	it("shows the review banner, linking to the drafts and back", async () => {
		const count = skillsNeedingReview(SAMPLE_SKILLS).length;
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
			SAMPLE_SKILLS.filter((s) => s.status === "draft")
				.map((s) => s.slug)
				.sort(),
		);
	});

	it("filters by the q in the URL, and says when nothing matches", async () => {
		const one = element(await page("?q=drizzle"), "skill-sidebar");
		expect(rowSlugs(one)).toEqual(["drizzle-migrations"]);
		expect(await page("?q=zzzz-nothing")).toContain(
			'data-testid="skill-sidebar-none"',
		);
	});
});

describe("Discover", () => {
	it("lists what vendor and community sources offer, with hashes and a disabled import", async () => {
		const html = await page("?view=discover");
		const discover = element(html, "skill-discover");
		expect(discover).not.toContain(
			'data-testid="skill-discover-source-internal"',
		);
		for (const entry of SAMPLE_REGISTRY) {
			const row = element(discover, `skill-discover-entry-${entry.name}`);
			expect(row).toContain(entry.path);
			expect(row).toContain(`data-full="${entry.contentSha256}"`);
			expectDisabledWithReason(
				html,
				`skill-discover-import-${entry.name}`,
				SKILL_WRITE_REASON.import,
			);
		}
		expect(regions(html).map((r) => r.missing)).toContain(
			CATALOG_MISSING.registry,
		);
	});

	it("never offers an internal source's entry, even when one reaches it", () => {
		const internal = SAMPLE_SOURCES.find((s) => s.kind === "internal");
		const vendor = SAMPLE_SOURCES.find((s) => s.kind === "vendor");
		expect(internal && vendor).toBeTruthy();
		const entry = (name: string, sourceId: string) => ({
			id: name,
			name,
			path: `x/${name}`,
			description: "d",
			sourceId,
			contentSha256: "0".repeat(64),
		});
		const html = renderToString(
			<TooltipProvider>
				<SkillDiscover
					entries={[
						entry("ours-already", internal?.id ?? ""),
						entry("theirs", vendor?.id ?? ""),
					]}
				/>
			</TooltipProvider>,
		);
		expect(html).toContain('data-testid="skill-discover-entry-theirs"');
		expect(html).not.toContain(
			'data-testid="skill-discover-entry-ours-already"',
		);
		expect(html).not.toContain('data-testid="skill-discover-source-internal"');
	});

	it("ranks by source, then name, and shows no install count", async () => {
		const discover = element(await page("?view=discover"), "skill-discover");
		const kinds = [
			...discover.matchAll(/data-testid="skill-discover-source-([^"]+)"/g),
		].map((m) => m[1]);
		expect(kinds).toEqual(
			SAMPLE_SOURCES.filter((s) => s.kind !== "internal").map((s) => s.kind),
		);
		expect(discover).not.toMatch(/install(s|ed)\b/i);
	});
});

describe("New skill", () => {
	it("has the reference's fields, mapped to the contract, and nothing sends", async () => {
		const html = await page("?view=new");
		const form = element(html, "skill-new-form");
		expect(form).toContain('data-testid="skill-new-name"');
		expect(form).toContain("When to use it");
		expect(form).toContain("The agent reads only this to decide.");
		expect(form).toContain('data-testid="skill-new-description"');
		expect(form).toContain('data-testid="skill-new-content"');
		expect(form).toContain('data-testid="skill-new-layer"');
		expect(form).toContain('data-testid="skill-new-type"');
		expect(tagOf(html, "skill-new-description-length")).toContain(
			'data-length="0"',
		);
		expectDisabledWithReason(
			html,
			"skill-new-submit",
			SKILL_WRITE_REASON.create,
		);
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
	it("reads the selection from the list it is given, never from elsewhere", () => {
		const listed = [{ slug: "only-this" }];
		expect(selectedSkill(listed, undefined, "only-this")).toBe(listed[0]);
		// A sample the list does not hold is not selected.
		expect(selectedSkill(listed, undefined, ROLE_SKILL)).toBeUndefined();
		expect(selectedSkill(listed, "discover", "only-this")).toBeUndefined();
		expect(selectedSkill(listed, undefined, undefined)).toBeUndefined();
	});

	it("says a served route is waiting on wiring, not that the server lacks it", async () => {
		for (const served of [
			CATALOG_MISSING.skills,
			CATALOG_MISSING.skill,
			CATALOG_MISSING.templates,
			CATALOG_MISSING.sources,
		]) {
			expect(catalogPillReason(served)).toBe(
				`Sample data. avel-server serves ${served}; this page is wired to it in a later step.`,
			);
		}
		for (const missing of [
			CATALOG_MISSING.registry,
			CATALOG_MISSING.versions,
			CATALOG_MISSING.measures,
			CATALOG_MISSING.families,
		]) {
			expect(catalogPillReason(missing)).toBeUndefined();
		}
		const html = await page(`?skill=${IMPORTED_CAPABILITY}`);
		expect(html).toContain(
			`avel-server serves ${CATALOG_MISSING.skills}; this page is wired to it in a later step.`,
		);
		expect(html).not.toContain(
			`Placeholder until avel-server has ${CATALOG_MISSING.skills}`,
		);
	});

	it("names a missing route only where avel-server has none", () => {
		for (const key of ["approve", "retire", "create"] as const) {
			expect(SKILL_WRITE_REASON[key]).toMatch(
				/isn't wired into this page yet$/,
			);
		}
		for (const key of ["attach", "import"] as const) {
			expect(SKILL_WRITE_REASON[key]).toMatch(/^avel-server has no route/);
		}
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
// From the Skills browser check.

describe("visual-pass fixes", () => {
	it("captions each attached role, since a disabled switch barely shows on", async () => {
		const html = await page(`?skill=${ROLE_SKILL}`);
		const skill = sampleSkill(ROLE_SKILL);
		const attached = [
			...html.matchAll(/data-testid="skill-role-([a-z-]+)-attached"/g),
		].map((m) => m[1]);
		expect(attached.sort()).toEqual([...(skill?.recommendedFor ?? [])].sort());
		for (const role of skill?.recommendedFor ?? []) {
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
			block.indexOf('data-testid="skill-header-sample"'),
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
		expect(open).toMatch(/\bbg-state-selected\b/);
		// The accent edge, as on a selected sidebar row; it outranks the
		// outline's own border-strong.
		expect(classes(await page("?view=discover"), "skills-discover")).toContain(
			"border-accent",
		);
		expect(open).not.toMatch(/\bborder-border-strong\b/);
		const shut = tagOf(await page(), "skills-discover");
		expect(shut).not.toContain("aria-current");
		expect(shut).not.toMatch(/\bbg-state-selected\b/);
		expect(shut).not.toMatch(/\bborder-accent\b/);
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

	it("says a stale slug names no skill", async () => {
		const html = await page("?skill=nothing-here");
		expect(html).toContain('data-testid="catalog-skills-not-found"');
		expect(html).not.toContain('data-testid="skill-inspector"');
	});
});
