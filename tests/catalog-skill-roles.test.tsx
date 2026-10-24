import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { ROLE_TEAM, ROLES } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import { InlineModals } from "@/components/avel/action-modal";
import {
	PICKABLE_TEAMS,
	rolesBlocker,
	rolesDiff,
	SkillRolesModal,
} from "@/components/avel/catalog-skill-roles";
import { queryKeys } from "@/lib/api/keys";
import { setSkillRolesOptions } from "@/lib/api/skills";
import { inProviders, seededClient, skill } from "./catalog-fixtures";
import { fakeApi } from "./clients-fixtures";
import { tagOf } from "./render-page";

/*
 * Change roles (PUT /api/skills/:id/roles, 2026-10-24): which roles a role
 * skill attaches to, the whole set at once.
 */

const ROLE_SKILL = skill("property-testing-fast-check");
const STACK_SKILL = skill("nextjs-route-handlers");

const modal = (s = ROLE_SKILL) =>
	inProviders(
		<InlineModals>
			<SkillRolesModal skill={s} open onOpenChange={() => {}} />
		</InlineModals>,
		seededClient(),
	);

describe("changing a role skill's roles", () => {
	it("sends the whole set with PUT, and reads the catalog again", async () => {
		const saved = { ...ROLE_SKILL, attachedRoles: ["spec-check" as const] };
		const { client, calls } = fakeApi(() => ({
			status: 200,
			body: { success: true, data: saved },
		}));
		const qc = new QueryClient();
		const key = [...queryKeys.catalog.skill(ROLE_SKILL.slug)];
		qc.setQueryData(key, ROLE_SKILL);
		await new MutationObserver(qc, setSkillRolesOptions(client, qc)).mutate({
			id: ROLE_SKILL.id,
			roles: ["spec-check"],
		});
		expect(calls[0]).toEqual({
			method: "PUT",
			path: `http://avel.test/api/skills/${ROLE_SKILL.id}/roles`,
			body: { roles: ["spec-check"] },
		});
		expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
	});

	it("offers every role an identity can carry, by team, Platform's left out", () => {
		expect(PICKABLE_TEAMS.map((t) => t.team)).not.toContain("platform");
		expect(PICKABLE_TEAMS.flatMap((t) => t.roles)).toEqual(
			ROLES.filter((role) => ROLE_TEAM[role] !== "platform"),
		);
		const html = modal();
		for (const role of ROLES) {
			if (ROLE_TEAM[role] === "platform") {
				expect(html).not.toContain(`skill-roles-role-${role}"`);
				continue;
			}
			expect(tagOf(html, `skill-roles-role-${role}`), role).toContain(
				`aria-pressed="${ROLE_SKILL.attachedRoles.includes(role)}"`,
			);
		}
	});

	it("holds Save until a role changes, and says what comes and goes", () => {
		expect(
			rolesDiff(
				["backend-tests", "property-tests"],
				["spec-check", "backend-tests"],
			),
		).toEqual({
			added: ["spec-check"],
			removed: ["property-tests"],
		});
		expect(rolesDiff(["auth"], ["auth"])).toEqual({ added: [], removed: [] });
		const html = modal();
		expect(tagOf(html, "skill-roles-modal-submit")).toMatch(/\sdisabled=""/);
		expect(html).not.toContain('data-testid="skill-roles-changes"');
	});

	it("tells a draft it reaches no identity until approved", () => {
		expect(modal({ ...ROLE_SKILL, status: "draft" })).toContain(
			'data-testid="skill-roles-draft"',
		);
		expect(modal()).not.toContain('data-testid="skill-roles-draft"');
	});

	it("holds Change roles where the server would refuse it", () => {
		expect(rolesBlocker(ROLE_SKILL)).toBeUndefined();
		expect(rolesBlocker({ ...ROLE_SKILL, status: "draft" })).toBeUndefined();
		expect(rolesBlocker({ ...ROLE_SKILL, status: "retired" })).toBe(
			"A retired skill can't be attached to roles.",
		);
		expect(rolesBlocker(STACK_SKILL)).toBe(
			"Only a role skill attaches to roles. This one goes on missions.",
		);
	});
});
