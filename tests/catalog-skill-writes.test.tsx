import { MutationObserver, QueryClient } from "@tanstack/react-query";
import {
	createSkillBody,
	type Skill,
	type SkillSource,
	updateSkillBody,
} from "avel-server/contract";
import { describe, expect, it } from "vitest";
import { InlineModals } from "@/components/avel/action-modal";
import {
	approveBlocker,
	editBlocker,
	retireBlocker,
	SkillApproveModal,
	SkillRetireModal,
} from "@/components/avel/catalog-skill-actions";
import {
	changesHash,
	checkBody,
	createBodyOf,
	defaultSourceId,
	draftOf,
	fieldMessages,
	grantsOf,
	patchOf,
	SKILL_FIELD_COPY,
	SLUG_TAKEN,
	saveBlocker,
	saveEffect,
	skillFieldOf,
	slugOf,
} from "@/components/avel/catalog-skill-editor";
import {
	createSourceBodyOf,
	hostOf,
	removeBlocker,
	SourceForm,
	SourceRemoveModal,
	sourceDraftOf,
	sourceGroups,
	sourcePatchOf,
} from "@/components/avel/catalog-skill-sources";
import { shortHash } from "@/components/avel/short-hash";
import { ApiError } from "@/lib/api";
import { CATALOG_PAGE_SIZE } from "@/lib/api/catalog";
import { queryKeys } from "@/lib/api/keys";
import {
	approveSkillOptions,
	createSkillOptions,
	createSkillSourceOptions,
	removeSkillSourceOptions,
	rereadOnConflict,
	retireSkillOptions,
	skillSourceQuery,
	updateSkillOptions,
	updateSkillSourceOptions,
} from "@/lib/api/skills";
import { describeError } from "@/lib/error-map";
import {
	catalogSeed,
	inProviders,
	notFoundError,
	renderSeeded,
	SKILLS,
	SOURCES,
	seededClient,
	skill,
	source,
} from "./catalog-fixtures";
import { contractError, fakeApi } from "./clients-fixtures";
import { tagOf } from "./render-page";

/*
 * Writing the skill library: create, edit, approve and retire a skill, and
 * add, edit and remove a source (src/routes/skills.ts, skill-sources.ts).
 * The requests run against a fake API through each write's own options;
 * the forms' rules are pure and tested directly; the views render through
 * the real router with a seeded cache.
 */

const DRAFT = skill("database-read");
const APPROVED = skill("nextjs-route-handlers");
const RETIRED = skill("package-registry");
const ROLE_SKILL = skill("property-testing-fast-check");

/** Runs one write's options against `api`, as its hook would. */
async function run<V>(
	// biome-ignore lint/suspicious/noExplicitAny: each builder types its own variables
	options: any,
	variables: V,
	qc = new QueryClient(),
) {
	return new MutationObserver<unknown, unknown, V>(qc, options).mutate(
		variables,
	);
}

const ok = (data: unknown) => ({ status: 200, body: { success: true, data } });
const created = (data: unknown) => ({
	status: 201,
	body: { success: true, data },
});

/** The element whose opening tag carries this testid, up to its close. */
function element(html: string, testid: string): string {
	const start = html.indexOf(`data-testid="${testid}"`);
	if (start < 0) throw new Error(`no ${testid}`);
	const open = html.lastIndexOf("<", start);
	const tag = html.slice(open + 1).match(/^[a-z0-9]+/)?.[0] ?? "div";
	let depth = 0;
	const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
	re.lastIndex = open;
	for (let m = re.exec(html); m; m = re.exec(html)) {
		depth += m[0].startsWith("</") ? -1 : 1;
		if (depth === 0) return html.slice(open, m.index + m[0].length);
	}
	return html.slice(open);
}

// ---------------------------------------------------------------------------
// The requests.

describe("the skill writes' requests", () => {
	it("creates with POST /api/skills and the body as built", async () => {
		const { client, calls } = fakeApi(() => created(DRAFT));
		const body = createBodyOf({
			...draftOf(undefined, source("internal").id),
			name: "Read the database",
			slug: "read-the-database",
			description: "Use when a test needs rows.",
			contentMd: "# Read",
			recommendedFor: ["backend-tests"],
		});
		await run(createSkillOptions(client, new QueryClient()), body);
		expect(calls).toEqual([
			{ method: "POST", path: "http://avel.test/api/skills", body },
		]);
	});

	it("edits with PATCH /api/skills/:id and only the patch", async () => {
		const { client, calls } = fakeApi(() => ok(APPROVED));
		const patch = { name: "Route handlers" };
		await run(updateSkillOptions(client, new QueryClient()), {
			id: APPROVED.id,
			patch,
		});
		expect(calls[0]).toEqual({
			method: "PATCH",
			path: `http://avel.test/api/skills/${APPROVED.id}`,
			body: patch,
		});
	});

	it("approves with the hash the page showed", async () => {
		const { client, calls } = fakeApi(() => ok(DRAFT));
		await run(approveSkillOptions(client, new QueryClient()), {
			id: DRAFT.id,
			contentSha256: DRAFT.contentSha256,
		});
		expect(calls[0]).toEqual({
			method: "POST",
			path: `http://avel.test/api/skills/${DRAFT.id}/approve`,
			body: { contentSha256: DRAFT.contentSha256 },
		});
	});

	it("retires with POST /api/skills/:id/retire", async () => {
		const { client, calls } = fakeApi(() => ok(DRAFT));
		await run(retireSkillOptions(client, new QueryClient()), DRAFT.id);
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.path).toBe(
			`http://avel.test/api/skills/${DRAFT.id}/retire`,
		);
	});

	it("reads the skill again on a 409, and only on a 409", async () => {
		const key = [...queryKeys.catalog.skill(DRAFT.slug)];
		const qc = new QueryClient();
		qc.setQueryData(key, DRAFT);
		await rereadOnConflict(qc, contractError(422, "VALIDATION_FAILED"));
		expect(qc.getQueryState(key)?.isInvalidated).toBe(false);
		await rereadOnConflict(qc, contractError(409, "CONFLICT"));
		expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
	});
});

describe("the source requests", () => {
	const VENDOR = source("vendor");

	it("reads one source by id", async () => {
		const { client, calls } = fakeApi(() => ok(VENDOR));
		const got = await new QueryClient().fetchQuery(
			skillSourceQuery(client, VENDOR.id),
		);
		expect(got).toEqual(VENDOR);
		expect(calls[0]).toEqual({
			method: "GET",
			path: `http://avel.test/api/skill-sources/${VENDOR.id}`,
			body: undefined,
		});
	});

	it("creates, edits and removes with POST, PATCH and DELETE", async () => {
		const { client, calls } = fakeApi((call) =>
			call.method === "POST"
				? created(VENDOR)
				: call.method === "DELETE"
					? ok({ id: VENDOR.id })
					: ok(VENDOR),
		);
		const qc = new QueryClient();
		const body = { name: "Pack", kind: "vendor" as const };
		await run(createSkillSourceOptions(client, qc), body);
		await run(updateSkillSourceOptions(client, qc), {
			id: VENDOR.id,
			patch: { url: null },
		});
		await run(removeSkillSourceOptions(client, qc), VENDOR.id);
		expect(calls.map((c) => [c.method, c.path, c.body])).toEqual([
			["POST", "http://avel.test/api/skill-sources", body],
			[
				"PATCH",
				`http://avel.test/api/skill-sources/${VENDOR.id}`,
				{ url: null },
			],
			["DELETE", `http://avel.test/api/skill-sources/${VENDOR.id}`, undefined],
		]);
	});

	it("refreshes the sources and every skill after a source write", async () => {
		const { client } = fakeApi(() => ok(VENDOR));
		const qc = new QueryClient({
			defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
		});
		const keys = [
			queryKeys.catalog.skillSource(VENDOR.id),
			queryKeys.catalog.skillSources(CATALOG_PAGE_SIZE),
			queryKeys.catalog.skills(CATALOG_PAGE_SIZE),
			queryKeys.catalog.skill(APPROVED.slug),
			queryKeys.missionSkills.list("m"),
		];
		for (const key of keys) qc.setQueryData([...key], []);
		await run(updateSkillSourceOptions(client, qc), {
			id: VENDOR.id,
			patch: { name: "Renamed" },
		});
		for (const key of keys) {
			expect(qc.getQueryState([...key])?.isInvalidated, key.join(".")).toBe(
				true,
			);
		}
	});
});

// ---------------------------------------------------------------------------
// The skill form's rules.

describe("building a skill's body", () => {
	it("derives a slug from a name the contract accepts", () => {
		expect(slugOf("Release notes: v2!")).toBe("release-notes-v2");
		expect(slugOf("  --Trim me--  ")).toBe("trim-me");
		expect(slugOf("a".repeat(150))).toHaveLength(100);
	});

	it("starts a new skill from the first internal source", () => {
		expect(defaultSourceId(SOURCES)).toBe(source("internal").id);
		expect(defaultSourceId([source("vendor")])).toBe(source("vendor").id);
		expect(defaultSourceId([])).toBe("");
	});

	it("trims, orders roles as the catalog does, and leaves out empty additions", () => {
		const body = createBodyOf({
			...draftOf(undefined, source("internal").id),
			name: "  Read the database ",
			slug: "read-the-database",
			description: " Use when a test needs rows. ",
			contentMd: "# Read",
			avelEnhancementMd: "   ",
			recommendedFor: ["spec-judgment", "backend-tests"],
		});
		expect(body).toEqual({
			slug: "read-the-database",
			name: "Read the database",
			description: "Use when a test needs rows.",
			contentMd: "# Read",
			layer: "role",
			type: "knowledge",
			recommendedFor: ["backend-tests", "spec-judgment"],
			sourceId: source("internal").id,
		});
		expect(createSkillBody.safeParse(body).success).toBe(true);
	});

	it("sends a capability's grants, one per line, and its io shape", () => {
		const body = createBodyOf({
			...draftOf(DRAFT),
			slug: "db-read-2",
			grants: " Read access \n\n Write access ",
			reads: "large",
			returns: "small",
		});
		expect(body).toMatchObject({
			type: "capability",
			grants: ["Read access", "Write access"],
			ioShape: { reads: "large", returns: "small" },
		});
		expect(createSkillBody.safeParse(body).success).toBe(true);
		expect(grantsOf("a\n\n b ")).toEqual(["a", "b"]);
	});

	it("round-trips every fixture skill to no patch at all", () => {
		for (const s of SKILLS) expect(patchOf(s, draftOf(s)), s.slug).toBeNull();
	});

	it("patches only what changed, clearing additions as null", () => {
		const patch = patchOf(APPROVED, {
			...draftOf(APPROVED),
			name: "Route handlers",
			avelEnhancementMd: "",
		});
		expect(patch).toEqual({ name: "Route handlers", avelEnhancementMd: null });
		expect(updateSkillBody.safeParse(patch).success).toBe(true);
	});

	it("moves type as the contract requires: knowledge sends nulls, capability its grants", () => {
		const toKnowledge = patchOf(DRAFT, {
			...draftOf(DRAFT),
			type: "knowledge",
		});
		expect(toKnowledge).toEqual({
			type: "knowledge",
			grants: null,
			ioShape: null,
		});
		const toCapability = patchOf(APPROVED, {
			...draftOf(APPROVED),
			type: "capability",
			grants: "The registry",
		});
		expect(toCapability).toEqual({
			type: "capability",
			grants: ["The registry"],
			ioShape: { reads: "small", returns: "small" },
		});
		for (const patch of [toKnowledge, toCapability]) {
			expect(updateSkillBody.safeParse(patch).success).toBe(true);
		}
	});

	it("knows which changes return an approved skill to draft", () => {
		expect(
			changesHash({ name: "x", slug: "x", recommendedFor: ["schema"] }),
		).toBe(false);
		for (const field of [
			"description",
			"contentMd",
			"avelEnhancementMd",
			"type",
			"layer",
			"grants",
			"ioShape",
		]) {
			expect(changesHash({ [field]: null } as never), field).toBe(true);
		}
		expect(changesHash(null)).toBe(false);
	});
});

describe("what saving says, before it is sent", () => {
	it("says a new skill is a draft at v1", () => {
		expect(saveEffect(undefined, null)).toEqual({
			version: 1,
			lines: [
				"Saves as a draft at v1.",
				"A draft is reviewed and approved before any role or mission can carry it.",
			],
		});
	});

	it("says an edit bumps the version and, on a hashed field, returns an approved skill to draft", () => {
		const hashed = saveEffect(APPROVED, { contentMd: "# New" });
		expect(hashed.version).toBe(APPROVED.version + 1);
		expect(hashed.lines[0]).toBe(
			`Saving makes this v${APPROVED.version + 1}. It is v${APPROVED.version} now, and its content hash is computed again.`,
		);
		expect(hashed.lines[1]).toMatch(/returns it to draft/);
		expect(saveEffect(APPROVED, { name: "x" }).lines[1]).toMatch(
			/^It stays approved/,
		);
		// A draft has nothing to lose: only the version line.
		expect(saveEffect(DRAFT, { contentMd: "# New" }).lines).toHaveLength(1);
	});

	it("holds the save with its reason: retired, unchanged, or no source", () => {
		expect(
			saveBlocker({ skill: RETIRED, patch: { name: "x" }, sources: SOURCES }),
		).toBe("A retired skill can't be edited.");
		expect(
			saveBlocker({ skill: APPROVED, patch: null, sources: SOURCES }),
		).toBe("Nothing has changed yet.");
		expect(saveBlocker({ skill: undefined, patch: null, sources: [] })).toMatch(
			/^Add a source first/,
		);
		expect(
			saveBlocker({ skill: undefined, patch: null, sources: SOURCES }),
		).toBeUndefined();
	});
});

describe("the skill form's refusals", () => {
	it("checks the body before sending, marking each field in its own words", () => {
		const issues = checkBody(
			createBodyOf({ ...draftOf(undefined, ""), slug: "Not A Slug" }),
			"create",
		);
		const byField = fieldMessages(issues, null, true);
		expect(byField.slug).toContain(SKILL_FIELD_COPY.slug);
		expect(byField.name).toContain(SKILL_FIELD_COPY.name);
		expect(byField.recommendedFor).toContain(SKILL_FIELD_COPY.recommendedFor);
		expect(byField.sourceId).toContain(SKILL_FIELD_COPY.sourceId);
	});

	it("puts a 409 on the slug only when the request sent one", () => {
		const conflict = contractError(409, "CONFLICT");
		expect(fieldMessages([], conflict, true).slug).toEqual([SLUG_TAKEN]);
		expect(fieldMessages([], conflict, false).slug).toBeUndefined();
	});

	it("places the server's issues on the form's fields, the rest apart", () => {
		expect(skillFieldOf(["grants", 0])).toBe("grants");
		expect(skillFieldOf(["ioShape", "reads"])).toBe("ioShape");
		expect(skillFieldOf(["somethingElse"])).toBeNull();
		const refused = contractError(400, "VALIDATION_FAILED", {
			body: [{ path: ["description"], message: "Too long" }],
		});
		expect(fieldMessages([], refused, false).description).toEqual([
			SKILL_FIELD_COPY.description,
		]);
	});
});

// ---------------------------------------------------------------------------
// Approve and Retire.

describe("Approve and Retire", () => {
	it("are held where the server would refuse them", () => {
		expect(approveBlocker(DRAFT)).toBeUndefined();
		expect(approveBlocker(APPROVED)).toBe("This skill is already approved.");
		expect(approveBlocker(RETIRED)).toBe("A retired skill can't be approved.");
		expect(retireBlocker(DRAFT)).toBeUndefined();
		expect(retireBlocker(APPROVED)).toBeUndefined();
		expect(retireBlocker(RETIRED)).toBe("This skill is already retired.");
		expect(editBlocker(RETIRED)).toBe("A retired skill can't be edited.");
		expect(editBlocker(APPROVED)).toBeUndefined();
	});

	const modal = (node: React.ReactNode) =>
		inProviders(<InlineModals>{node}</InlineModals>, seededClient());

	it("says what approval changes: the status, the reviewer and the pinned hash", () => {
		const html = modal(
			<SkillApproveModal skill={DRAFT} open onOpenChange={() => {}} />,
		);
		const changes = element(html, "skill-approve-changes");
		expect(changes).toContain("Draft");
		expect(changes).toContain("Approved");
		expect(changes).toContain("Reviewer");
		expect(changes).toContain(shortHash(DRAFT.contentSha256));
		expect(element(html, "skill-approve-modal-submit")).toContain(
			`Approve v${DRAFT.version}`,
		);
		// A stack skill reaches missions; a role skill reaches agents' identities.
		expect(element(html, "skill-approve-effects")).toContain("missions");
		const role = modal(
			<SkillApproveModal
				skill={{ ...ROLE_SKILL, status: "draft" }}
				open
				onOpenChange={() => {}}
			/>,
		);
		expect(element(role, "skill-approve-effects")).toContain("identity");
	});

	it("names retiring as final, with the filled danger confirm last", () => {
		const html = modal(
			<SkillRetireModal skill={APPROVED} open onOpenChange={() => {}} />,
		);
		expect(html).toContain("Retiring is final.");
		const effects = element(html, "skill-retire-effects");
		expect(effects).toContain("attached to a role or a mission again");
		expect(effects).toContain("its source can&#x27;t be removed");
		expect(tagOf(html, "skill-retire-modal-submit")).toContain(
			'data-variant="destructive-confirm"',
		);
	});
});

// ---------------------------------------------------------------------------
// The editor, rendered.

describe("the editor in the page", () => {
	it("opens Edit on the selected skill, filled in, saving as the next version", async () => {
		const html = await renderSeeded(
			`/catalog/skills?skill=${APPROVED.slug}&view=edit`,
			seededClient(catalogSeed()),
		);
		expect(html).toContain('data-testid="skill-edit"');
		expect(html).not.toContain('data-testid="skill-inspector"');
		expect(tagOf(html, "skill-editor-name")).toContain(
			`value="${APPROVED.name}"`,
		);
		expect(tagOf(html, "skill-editor-effect")).toContain(
			`data-version-next="${APPROVED.version + 1}"`,
		);
		expect(element(html, "skill-editor-submit")).toContain(
			`Save as v${APPROVED.version + 1}`,
		);
		// Nothing typed yet: the save waits, saying why.
		expect(tagOf(html, "skill-editor-submit")).toMatch(/\sdisabled=""/);
		expect(html).toContain("Nothing has changed yet.");
		// The trail names the skill being edited, and leads back to Skills.
		expect(tagOf(html, "catalog-skills-back")).toContain('aria-label="Skill"');
		expect(html).toMatch(
			new RegExp(`aria-current="page"[^>]*>${APPROVED.slug}, edit<`),
		);
	});

	it("shows a new skill as v1, with a role toggle per role and no Platform roles", async () => {
		const html = await renderSeeded(
			"/catalog/skills?view=new",
			seededClient(catalogSeed()),
		);
		expect(tagOf(html, "skill-editor-effect")).toContain(
			'data-version-next="1"',
		);
		expect(html).toContain('data-testid="skill-editor-role-backend-tests"');
		expect(html).not.toContain('data-testid="skill-editor-role-ship-decision"');
		expect(tagOf(html, "skill-editor-layer-role")).toContain(
			'aria-pressed="true"',
		);
	});

	it("says when the skill to edit is gone", async () => {
		const html = await renderSeeded(
			"/catalog/skills?skill=gone&view=edit",
			seededClient({
				...catalogSeed(),
				skillBySlug: { gone: notFoundError("/api/skills/by-slug/gone") },
			}),
		);
		expect(html).toContain('data-testid="catalog-skills-not-found"');
	});
});

// ---------------------------------------------------------------------------
// Sources.

describe("the source rules", () => {
	it("groups by kind, Yours first, each by name", () => {
		const extra: SkillSource = {
			...source("vendor"),
			id: "00000000-0000-4000-8000-000000000999",
			name: "Another pack",
		};
		const groups = sourceGroups([...SOURCES, extra]);
		expect(groups.map((g) => g.kind)).toEqual([
			"internal",
			"vendor",
			"community",
		]);
		expect(groups[1]?.sources.map((s) => s.name)).toEqual([
			"Another pack",
			"Framework vendor pack",
		]);
		expect(sourceGroups([source("community")]).map((g) => g.label)).toEqual([
			"Community",
		]);
	});

	it("holds Remove while any skill names the source", () => {
		expect(removeBlocker({ skillCount: 0 })).toBeUndefined();
		expect(removeBlocker({ skillCount: 1 })).toBe(
			"1 skill still comes from this source. Move each to another source in its editor first.",
		);
		expect(removeBlocker({ skillCount: 3 })).toMatch(/^3 skills still come/);
	});

	it("builds the bodies: empty address and license left out, cleared ones null", () => {
		expect(
			createSourceBodyOf({
				name: " Pack ",
				kind: "vendor",
				url: " ",
				license: "",
			}),
		).toEqual({ name: "Pack", kind: "vendor" });
		const vendor = source("vendor");
		expect(sourcePatchOf(vendor, sourceDraftOf(vendor))).toBeNull();
		expect(
			sourcePatchOf(vendor, {
				...sourceDraftOf(vendor),
				url: "",
				license: "MIT",
			}),
		).toEqual({ url: null, license: "MIT" });
		expect(hostOf("https://example.com/vendor/skills")).toBe("example.com");
		expect(hostOf("not a url")).toBe("not a url");
	});

	it("explains the in-use refusal in plain words", () => {
		const copy = describeError(
			contractError(422, "PRECONDITION_FAILED", {
				reason: "skill_source_in_use",
			}),
		);
		expect(copy.what).toBe("Skills still come from this source.");
	});
});

/** The sources page, with one source's own read seeded. */
function sourcesClient(selected?: SkillSource | ApiError) {
	const qc = seededClient(catalogSeed());
	if (selected instanceof ApiError) {
		qc.getQueryCache()
			.build(qc, { queryKey: [...queryKeys.catalog.skillSource(VENDOR_ID)] })
			.setState({ status: "error", fetchStatus: "idle", error: selected });
	} else if (selected) {
		qc.setQueryData([...queryKeys.catalog.skillSource(selected.id)], selected);
	}
	return qc;
}
const VENDOR_ID = source("vendor").id;

describe("Sources in the page", () => {
	it("is a view of Catalog → Skills: a board of cards by kind, the action marked", async () => {
		const html = await renderSeeded(
			"/catalog/skills?view=sources",
			sourcesClient(),
		);
		expect(tagOf(html, "skills-sources")).toContain('aria-current="page"');
		for (const s of SOURCES) {
			expect(tagOf(html, `skill-source-${s.id}`)).toContain(
				`href="/catalog/skills?view=sources&amp;source=${s.id}"`,
			);
		}
		expect(
			element(html, `skill-source-${source("internal").id}-count`),
		).toContain("4 skills");
		expect(html).toContain('data-testid="skill-sources-add"');
		expect(html).not.toContain('data-testid="skill-source-detail"');
	});

	it("opens a chosen source from its own read, with the skills that name it", async () => {
		const html = await renderSeeded(
			`/catalog/skills?view=sources&source=${VENDOR_ID}`,
			sourcesClient(source("vendor")),
		);
		const detail = element(html, "skill-source-detail");
		expect(detail).toContain("Framework vendor pack");
		expect(detail).toContain("Apache-2.0");
		expect(detail).toContain(
			`data-testid="skill-source-skill-${APPROVED.slug}"`,
		);
		expect(detail).toContain('data-testid="skill-source-remove"');
		expect(tagOf(html, `skill-source-${VENDOR_ID}`)).toContain(
			'aria-current="page"',
		);
	});

	it("says a removed source is gone, and keeps the board", async () => {
		const html = await renderSeeded(
			`/catalog/skills?view=sources&source=${VENDOR_ID}`,
			sourcesClient(notFoundError(`/api/skill-sources/${VENDOR_ID}`)),
		);
		expect(html).toContain('data-testid="skill-source-not-found"');
		expect(html).toContain('data-testid="skill-sources-board"');
	});

	it("says when there are no sources, offering to add one", async () => {
		const html = await renderSeeded(
			"/catalog/skills?view=sources",
			seededClient({ ...catalogSeed(), sources: [] }),
		);
		expect(html).toContain('data-testid="skill-sources-empty"');
		expect(html).toContain('data-testid="skill-sources-empty-add"');
	});
});

describe("removing a source", () => {
	const removal = (s: SkillSource, skills: readonly Skill[]) =>
		inProviders(
			<InlineModals>
				<SourceRemoveModal
					source={s}
					skills={skills}
					open
					onOpenChange={() => {}}
				/>
			</InlineModals>,
			seededClient(),
		);

	it("is held while skills name the source, listing each, and says why a retired one keeps it", () => {
		const avel = source("internal");
		const skills = SKILLS.filter((s) => s.source.id === avel.id);
		const html = removal(avel, skills);
		expect(tagOf(html, "source-remove-modal-submit")).toMatch(/\sdisabled=""/);
		expect(element(html, "source-remove-in-use")).toContain(
			"4 skills still come from this source.",
		);
		expect(html).toContain('data-testid="source-remove-retired"');
		// A retired skill opens read-only; the others open in their editor.
		expect(tagOf(html, "source-remove-skill-package-registry")).toContain(
			'href="/catalog/skills?skill=package-registry"',
		);
		expect(tagOf(html, `source-remove-skill-${ROLE_SKILL.slug}`)).toContain(
			"view=edit",
		);
	});

	it("goes ahead on a source no skill names, as the filled danger confirm", () => {
		const empty = { ...source("vendor"), skillCount: 0 };
		const html = removal(empty, []);
		expect(tagOf(html, "source-remove-modal-submit")).not.toMatch(
			/\sdisabled=""/,
		);
		expect(tagOf(html, "source-remove-modal-submit")).toContain(
			'data-variant="destructive-confirm"',
		);
		expect(html).not.toContain('data-testid="source-remove-in-use"');
	});
});

describe("the source form", () => {
	const form = (props: Partial<Parameters<typeof SourceForm>[0]>) =>
		inProviders(
			<InlineModals>
				<SourceForm
					pending={false}
					error={null}
					onSubmit={() => {}}
					{...props}
				/>
			</InlineModals>,
			seededClient(),
		);

	it("adds with every field blank, Yours chosen", () => {
		const html = form({});
		expect(html).toContain("Add source");
		expect(tagOf(html, "source-form-kind-internal")).toContain(
			'aria-pressed="true"',
		);
		expect(tagOf(html, "source-form-submit")).not.toMatch(/\sdisabled=""/);
	});

	it("edits from the source's values, holding Save until something changes", () => {
		const html = form({ source: source("vendor") });
		expect(tagOf(html, "source-form-name")).toContain(
			'value="Framework vendor pack"',
		);
		expect(tagOf(html, "source-form-submit")).toMatch(/\sdisabled=""/);
	});

	it("puts a refused address on its field, in the form's words", () => {
		const html = form({
			error: contractError(400, "VALIDATION_FAILED", {
				body: [{ path: ["url"], message: "Invalid url" }],
			}),
		});
		expect(element(html, "source-form-url-error")).toContain(
			"starting with https://",
		);
		expect(html).not.toContain("Invalid url");
	});
});
