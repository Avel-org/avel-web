import { ROLE_TEAM, ROLES } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import {
	agentsOfSkill,
	attachability,
	CATALOG_MISSING,
	carryingRoles,
	enforcementBadge,
	SAMPLE_ROLE_ATTACHMENTS,
	sampleHistory,
	sampleRegistry,
	sampleRoleAttachments,
	sampleSha256,
	sampleUuid,
	skillsOfAgent,
} from "@/components/avel/catalog-placeholders";
import { AGENTS, SKILLS, SOURCES, source } from "./catalog-fixtures";

/*
 * The catalog's shared rules. What is still a sample
 * (catalog-placeholders.ts) keys off live records and is tested as pure
 * functions of them.
 */

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

	it("number versions newest first, down to 1, from the live version, ", () => {
		for (const a of AGENTS) {
			const history = sampleHistory(a);
			expect(history.versions.map((v) => v.version)).toEqual(
				Array.from({ length: a.version }, (_, i) => a.version - i),
			);
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
			expect(ROLE_TEAM[role]).not.toBe("platform");
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
