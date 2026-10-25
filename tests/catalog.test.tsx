import { describe, expect, it } from "vitest";
import {
	agentsOfSkill,
	attachability,
	CATALOG_MISSING,
	carryingRoles,
	enforcementBadge,
	sampleRegistry,
	sampleSha256,
	sampleUuid,
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
		// Per-agent measures left this list when the metrics route landed.
		expect(values).toHaveLength(2);
		// None names a route: a role skill's roles are live since
		// PUT /api/skills/:id/roles landed (2026-10-24).
		expect(values.filter((m) => /^(GET|PUT|POST) /.test(m))).toEqual([]);
	});

	it("are deterministic: the same key always gives the same value", () => {
		expect(sampleSha256("x")).toBe(sampleSha256("x"));
		expect(sampleSha256("x")).not.toBe(sampleSha256("y"));
		expect(sampleSha256("x")).toMatch(/^[0-9a-f]{64}$/);
		expect(sampleUuid("a")).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
		);
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

	it("carry a role skill through its attached roles, and a stack skill through recommendedFor", () => {
		for (const s of SKILLS) {
			expect(carryingRoles(s)).toBe(
				s.layer === "role" ? s.attachedRoles : s.recommendedFor,
			);
			for (const a of AGENTS) {
				expect(agentsOfSkill(s, AGENTS).includes(a)).toBe(
					a.roles.some((role) => carryingRoles(s).includes(role)),
				);
			}
			// Nothing carries anything when there is nothing to carry.
			expect(agentsOfSkill(s, [])).toEqual([]);
		}
		// A role skill attached to nothing is carried by nobody, whatever it
		// is recommended for.
		const role = SKILLS.find((s) => s.layer === "role");
		expect(role).toBeDefined();
		if (!role) return;
		expect(agentsOfSkill({ ...role, attachedRoles: [] }, AGENTS)).toEqual([]);
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
