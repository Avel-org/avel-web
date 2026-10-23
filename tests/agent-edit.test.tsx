import { QueryClient } from "@tanstack/react-query";
import type { PreconditionDetails } from "avel-server/contract";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	AgentPathsEdit,
	AgentRolesEdit,
	AgentTitleEdit,
	crossedSides,
	crossSidesWarning,
	DESCRIPTION_MAX,
	OFFERED_ROLES,
	OutcomeLine,
	PathsEditForm,
	pathsProblem,
	plainWordsProblem,
	RolesEditForm,
	refusalSpecifics,
	roleBlockedReason,
	rolesByTeam,
	savedMessage,
	TextEditForm,
	TITLE_MAX,
} from "@/components/avel/agent-edit";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
	ApiError,
	ApiOverrideProvider,
	ApiProvider,
	queryKeys,
} from "@/lib/api";
import { afterAgentUpdate } from "@/lib/api/catalog";
import { agent } from "./catalog-fixtures";
import { tagOf, textOfId } from "./render-page";

// ---------------------------------------------------------------------------
// Helpers.

const wrap = (node: ReactNode) =>
	renderToString(<TooltipProvider>{node}</TooltipProvider>);

/** A button's disabledReason, read through its aria-describedby. */
function reasonOf(html: string, testid: string): string | undefined {
	const id = tagOf(html, testid).match(/aria-describedby="([^"]+)"/)?.[1];
	return id ? textOfId(html, id) : undefined;
}

const isDisabled = (html: string, testid: string) =>
	/\sdisabled=""/.test(tagOf(html, testid));

/** A 422 refusal as avel-server sends it. */
const refusal = (details: PreconditionDetails) =>
	new ApiError({
		method: "PATCH",
		path: "/api/agent-templates/:id",
		kind: "contract",
		status: 422,
		code: "PRECONDITION_FAILED",
		message: "for logs only",
		requestId: "req-1",
		details,
	});

const noop = () => {};

// ---------------------------------------------------------------------------
// Rules.

describe("the plain-words rule, as the server checks it", () => {
	it("passes trimmed plain words within the limit", () => {
		expect(plainWordsProblem("  Frontend engineer  ", TITLE_MAX)).toBeNull();
		expect(plainWordsProblem("x".repeat(TITLE_MAX), TITLE_MAX)).toBeNull();
	});

	it("names what stops it: empty, over the limit, or which characters", () => {
		expect(plainWordsProblem("   ", TITLE_MAX)).toBe(
			"Write at least one word, or clear it.",
		);
		expect(plainWordsProblem("x".repeat(61), TITLE_MAX)).toBe(
			"1 character over the 60-character limit.",
		);
		expect(plainWordsProblem("x".repeat(283), DESCRIPTION_MAX)).toBe(
			"3 characters over the 280-character limit.",
		);
		expect(plainWordsProblem("A *bold* — claim #1", DESCRIPTION_MAX)).toBe(
			"Use plain words: remove *, #, em dashes.",
		);
		expect(plainWordsProblem("snake_case `code`", TITLE_MAX)).toBe(
			"Use plain words: remove _, `.",
		);
	});
});

describe("which roles are offered, and how", () => {
	it("never offers a code role, and offers the rest by team in catalog order", () => {
		expect(OFFERED_ROLES).not.toContain("spec-check");
		expect(OFFERED_ROLES).not.toContain("deploy");
		expect(OFFERED_ROLES).toContain("foundations");
		expect(OFFERED_ROLES).toContain("intake");
		const teams = rolesByTeam().map((g) => g.team);
		// Automated (platform) holds only code roles, so it has no group.
		expect(teams).toEqual([
			"foundation",
			"build",
			"verify",
			"review",
			"operate",
			"firm",
		]);
	});

	it("holds Project setup alone, both ways", () => {
		expect(roleBlockedReason(["foundations"], "schema")).toMatch(
			/Project setup is held alone\. Untick it/,
		);
		expect(roleBlockedReason(["schema"], "foundations")).toMatch(
			/Untick the other roles first/,
		);
		expect(roleBlockedReason([], "foundations")).toBeUndefined();
		expect(roleBlockedReason(["foundations"], "foundations")).toBeUndefined();
	});

	it("warns when the roles cross sides, as mergeAllowed refuses", () => {
		expect(crossedSides(["schema", "interface"])).toBeNull();
		expect(crossedSides(["schema", "intake"])).toBeNull();
		expect(crossedSides(["schema", "backend-tests"])).toEqual([
			"author",
			"tester",
		]);
		expect(
			crossSidesWarning(["schema", "backend-tests", "spec-judgment"]),
		).toBe(
			"These roles span Writes code and Writes tests and Reviews, so this agent would check its own work. Keep them on one side.",
		);
		// Expected results merges with nothing, even a role with no side.
		expect(crossSidesWarning(["fixture", "intake"])).toBe(
			"Expected results stands alone: an agent with it holds no other role.",
		);
		expect(crossSidesWarning(["fixture"])).toBeNull();
	});

	it("needs at least one path, none blank", () => {
		expect(pathsProblem(["src/**"])).toBeNull();
		expect(pathsProblem([])).toMatch(/at least one path/);
		expect(pathsProblem(["src/**", " "])).toMatch(/empty path/);
	});
});

describe("what a save says", () => {
	it("says the identity is stale after a roles or paths change, and only then", () => {
		expect(savedMessage({ identityStale: true })).toBe(
			"Saved. The identity is now out of date; regenerate it to apply.",
		);
		expect(savedMessage({ identityStale: false })).toBe("Saved.");
	});

	it("names the roles an agent can't hold, from the issues' paths into the roles sent", () => {
		const error = refusal({
			reason: "agent_role_not_assignable",
			issues: [
				{ path: ["roles", 1], message: "spec-check is a code role" },
				{
					path: ["roles", 0],
					message: "foundations is never held with another",
				},
			],
		});
		expect(refusalSpecifics(error, ["foundations", "spec-check"])).toBe(
			"Can't be given to an agent: Spec check, Project setup.",
		);
	});

	it("names the sides a crossing set spans", () => {
		const error = refusal({
			reason: "agent_roles_cross_sides",
			sides: ["author", "judge"],
		});
		expect(refusalSpecifics(error)).toBe(
			"The roles span: Writes code, Reviews.",
		);
	});

	it("adds nothing for any other failure", () => {
		const offline = new ApiError({
			method: "PATCH",
			path: "/api/agent-templates/:id",
			kind: "unreachable",
		});
		expect(refusalSpecifics(offline)).toBeNull();
	});

	it("shows a refusal's copy with its specifics, and a stale save as a warning", () => {
		const cross = wrap(
			<OutcomeLine
				outcome={{
					kind: "error",
					error: refusal({
						reason: "agent_roles_cross_sides",
						sides: ["author", "tester"],
					}),
				}}
				testId="t"
			/>,
		);
		expect(cross).toContain('role="alert"');
		expect(cross).toContain(
			"These roles would have this agent checking its own work.",
		);
		expect(cross).toContain("The roles span: Writes code, Writes tests.");
		const roles = wrap(
			<OutcomeLine
				outcome={{
					kind: "error",
					error: refusal({
						reason: "agent_role_not_assignable",
						issues: [{ path: ["roles", 0], message: "x" }],
					}),
					sentRoles: ["deploy"],
				}}
				testId="t"
			/>,
		);
		expect(roles).toContain(
			"Some of these roles can&#x27;t be given to an agent.",
		);
		expect(roles).toContain("Can&#x27;t be given to an agent: Deployment.");
		const stale = wrap(
			<OutcomeLine
				outcome={{ kind: "saved", agent: { identityStale: true } }}
				testId="t"
			/>,
		);
		expect(tagOf(stale, "t-saved")).toMatch(/^<output/);
		expect(tagOf(stale, "t-saved")).toContain("text-gate-warn");
		expect(stale).toContain("regenerate it to apply.");
		expect(wrap(<OutcomeLine outcome={{ kind: "idle" }} testId="t" />)).toBe(
			"",
		);
	});
});

// ---------------------------------------------------------------------------
// The forms.

const text = (draft: string, current: string | null = "Frontend engineer") =>
	wrap(
		<TextEditForm
			field="title"
			draft={draft}
			current={current}
			pending={false}
			onDraft={noop}
			onSave={noop}
			onCancel={noop}
			onClear={noop}
			labelId="l"
		/>,
	);

describe("the title form", () => {
	it("counts live against 60, and turns the count red over it", () => {
		const html = text("Frontend lead");
		expect(html).toMatch(/data-testid="agent-edit-title-count"[^>]*>13 \/ 60</);
		const over = text("x".repeat(61));
		expect(tagOf(over, "agent-edit-title-count")).toContain("text-destructive");
		expect(over).toMatch(/>61 \/ 60</);
	});

	it("shows the plain-words problem before saving, and Save says why it waits", () => {
		const html = text("Lead — frontend");
		expect(html).toMatch(
			/data-testid="agent-edit-title-problem"[^>]*>Use plain words: remove em dashes\.</,
		);
		expect(tagOf(html, "agent-edit-title-input")).toContain(
			'aria-invalid="true"',
		);
		expect(isDisabled(html, "agent-edit-title-save")).toBe(true);
		expect(reasonOf(html, "agent-edit-title-save")).toBe(
			"Use plain words: remove em dashes.",
		);
	});

	it("waits for a change, then saves", () => {
		expect(reasonOf(text("Frontend engineer"), "agent-edit-title-save")).toBe(
			"Nothing has changed",
		);
		expect(isDisabled(text("Frontend lead"), "agent-edit-title-save")).toBe(
			false,
		);
	});

	it("offers Clear only when there is something to clear", () => {
		expect(isDisabled(text("Frontend lead"), "agent-edit-title-clear")).toBe(
			false,
		);
		expect(reasonOf(text("", null), "agent-edit-title-clear")).toBe(
			"It has no title to clear",
		);
	});
});

const rolesForm = (chosen: Parameters<typeof RolesEditForm>[0]["chosen"]) =>
	wrap(
		<RolesEditForm
			chosen={chosen}
			current={["schema"]}
			pending={false}
			onToggle={noop}
			onSave={noop}
			onCancel={noop}
		/>,
	);

describe("the roles form", () => {
	it("groups the boxes by team with plain labels, and offers no code role", () => {
		const html = rolesForm(["schema"]);
		expect(html).toContain('data-testid="agent-edit-roles-team-build"');
		expect(html).toContain(">Setup<");
		expect(html).toContain(">Database<");
		expect(html).toContain('data-testid="agent-edit-role-interface"');
		expect(html).not.toContain('data-testid="agent-edit-role-spec-check"');
		expect(html).not.toContain('data-testid="agent-edit-roles-team-platform"');
	});

	it("warns before saving when the roles cross sides, and holds Save", () => {
		const html = rolesForm(["schema", "backend-tests"]);
		expect(html).toMatch(
			/data-testid="agent-edit-roles-warning"[^>]*>These roles span Writes code and Writes tests/,
		);
		expect(reasonOf(html, "agent-edit-roles-save")).toBe(
			"Its roles cross sides",
		);
		expect(rolesForm(["schema"])).not.toContain("agent-edit-roles-warning");
	});

	it("holds Project setup alone: the other boxes disabled, and says so", () => {
		const html = rolesForm(["foundations"]);
		expect(tagOf(html, "agent-edit-role-schema")).toMatch(/\sdisabled=""/);
		expect(tagOf(html, "agent-edit-role-foundations")).not.toMatch(
			/\sdisabled=""/,
		);
		expect(html).toContain('data-testid="agent-edit-roles-alone"');
	});

	it("needs at least one role, and a change", () => {
		expect(reasonOf(rolesForm([]), "agent-edit-roles-save")).toBe(
			"Choose at least one role",
		);
		expect(reasonOf(rolesForm(["schema"]), "agent-edit-roles-save")).toBe(
			"Nothing has changed",
		);
		expect(
			isDisabled(rolesForm(["schema", "contract"]), "agent-edit-roles-save"),
		).toBe(false);
	});
});

const pathsForm = (paths: string[], adding = "") =>
	wrap(
		<PathsEditForm
			paths={paths}
			current={["src/**"]}
			adding={adding}
			pending={false}
			onPath={noop}
			onRemove={noop}
			onAdding={noop}
			onAdd={noop}
			onSave={noop}
			onCancel={noop}
		/>,
	);

describe("the paths form", () => {
	it("keeps at least one path: the last can't be removed", () => {
		expect(reasonOf(pathsForm(["src/**"]), "agent-edit-path-0-remove")).toBe(
			"An agent keeps at least one path",
		);
		expect(
			isDisabled(pathsForm(["src/**", "db/**"]), "agent-edit-path-0-remove"),
		).toBe(false);
	});

	it("refuses an empty row and a repeat before saving", () => {
		const html = pathsForm(["src/**", ""]);
		expect(html).toContain("Fill in or remove the empty path.");
		expect(reasonOf(html, "agent-edit-paths-save")).toBe(
			"Fill in or remove the empty path.",
		);
		expect(
			reasonOf(pathsForm(["src/**"], "src/**"), "agent-edit-path-add"),
		).toBe("It already has this path");
		expect(
			isDisabled(pathsForm(["src/**", "db/**"]), "agent-edit-paths-save"),
		).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// With the data layer, as a page renders them.

function withApi(node: ReactNode) {
	const client = new QueryClient();
	return renderToString(
		<ApiOverrideProvider queryClient={client}>
			<ApiProvider>
				<TooltipProvider>{node}</TooltipProvider>
			</ApiProvider>
		</ApiOverrideProvider>,
	);
}

describe("the edit pieces", () => {
	const nemi = agent("nemi");

	it("shows a glob that matches every file as Any file, the glob in its title", () => {
		const html = withApi(
			<AgentPathsEdit agent={{ ...nemi, writablePaths: ["**", "src/**"] }} />,
		);
		const value = html.slice(
			html.indexOf('data-testid="agent-edit-paths-value"'),
		);
		expect(value).toMatch(/title="\*\*"[^>]*>Any file</);
		expect(value).toMatch(/>src\/\*\*</);
		expect(value.slice(0, value.indexOf("</ul>"))).not.toMatch(/>\*\*</);
	});

	it("lets the operator edit every piece, and shows the saved values", () => {
		const html = withApi(
			<>
				<AgentTitleEdit agent={nemi} />
				<AgentRolesEdit agent={nemi} />
				<AgentPathsEdit agent={nemi} />
			</>,
		);
		for (const piece of ["title", "roles", "paths"]) {
			expect(isDisabled(html, `agent-edit-${piece}-edit`)).toBe(false);
		}
		expect(html).toMatch(
			/data-testid="agent-edit-title-value"[^>]*>Frontend tester</,
		);
	});
});

// ---------------------------------------------------------------------------
// After a save.

describe("after a save", () => {
	it("reads the template, its list, its versions and the log again", async () => {
		const client = new QueryClient();
		const keys = [
			queryKeys.catalog.agentTemplates(100),
			queryKeys.catalog.agentTemplate("nemi"),
			queryKeys.catalog.identityVersions("id-1"),
			queryKeys.activity.all(),
		];
		for (const key of keys) client.setQueryData([...key], { seeded: true });
		const skills = queryKeys.catalog.skills(100);
		client.setQueryData([...skills], { seeded: true });
		await afterAgentUpdate(client);
		for (const key of keys) {
			expect(client.getQueryState([...key])?.isInvalidated).toBe(true);
		}
		// Skills don't change with an agent.
		expect(client.getQueryState([...skills])?.isInvalidated).toBe(false);
	});
});
