import { describe, expect, it } from "vitest";
import { InlineModals } from "@/components/avel/action-modal";
import {
	createAgentBody,
	createChanges,
	draftSlug,
	EMPTY_AGENT,
	NewAgentModal,
	pathsOf,
	whoBlocked,
	workBlocked,
} from "@/components/avel/agent-create";
import { element } from "./canon-fixtures";
import {
	AGENTS,
	inProviders,
	renderSeeded,
	seededClient,
} from "./catalog-fixtures";
import { tagOf } from "./render-page";

/*
 * A new agent (POST /api/agent-templates): who it is, then its work, in a
 * two-step Stepper. The server creates it with no identity, so the agent is
 * only dispatchable once its identity is generated on its page.
 */

const ATLAS = {
	...EMPTY_AGENT,
	name: "Atlas",
	roles: ["domain", "api-surface"] as const,
	waves: ["B"] as const,
	paths: "src/server/**\n\n  src/server/**  \nsrc/api/**",
};

describe("the draft", () => {
	it("follows the name for its slug until the slug is typed", () => {
		expect(draftSlug({ ...EMPTY_AGENT, name: "Atlas Prime" })).toBe(
			"atlas-prime",
		);
		expect(
			draftSlug({ ...EMPTY_AGENT, name: "Atlas Prime", slug: "atlas" }),
		).toBe("atlas");
	});

	it("reads paths one per line, trimmed, blanks and repeats dropped", () => {
		expect(pathsOf(ATLAS.paths)).toEqual(["src/server/**", "src/api/**"]);
	});

	it("sends the body the contract takes, with blank optional fields left out", () => {
		const body = createAgentBody({
			...ATLAS,
			roles: [...ATLAS.roles],
			waves: [...ATLAS.waves],
		});
		expect(body).toEqual({
			slug: "atlas",
			name: "Atlas",
			kind: "feature",
			roles: ["domain", "api-surface"],
			waveDefaults: ["B"],
			writablePaths: ["src/server/**", "src/api/**"],
		});
		expect(
			createAgentBody({ ...EMPTY_AGENT, name: "A", title: " Lead " }).title,
		).toBe("Lead");
		// Waves go in the contract's order, whatever order they were picked in.
		expect(
			createAgentBody({ ...EMPTY_AGENT, name: "A", waves: ["D", "A"] })
				.waveDefaults,
		).toEqual(["A", "D"]);
	});
});

describe("what holds each step", () => {
	it("holds Who until it has a name and a valid slug", () => {
		expect(whoBlocked(EMPTY_AGENT)).toBe("Name the agent first");
		expect(
			whoBlocked({ ...EMPTY_AGENT, name: "Atlas", slug: "Atlas_1" }),
		).toMatch(/lowercase/);
		expect(whoBlocked({ ...EMPTY_AGENT, name: "Atlas" })).toBeUndefined();
	});

	it("holds Work until it has roles on one side and a path", () => {
		const draft = { ...ATLAS, roles: [...ATLAS.roles], waves: [] };
		expect(workBlocked({ ...draft, roles: [] })).toBe(
			"Choose at least one role",
		);
		// A builder and a tester would check its own work.
		expect(workBlocked({ ...draft, roles: ["domain", "property-tests"] })).toBe(
			"Its roles cross sides",
		);
		expect(workBlocked({ ...draft, paths: " \n " })).toBe(
			"Give it at least one path it may change",
		);
		expect(workBlocked(draft)).toBeUndefined();
	});

	it("names the request in What changes, paths in mono", () => {
		const changes = createChanges({
			...ATLAS,
			roles: [...ATLAS.roles],
			waves: [],
		});
		expect(changes.map((c) => c.label)).toEqual([
			"Agent",
			"Kind",
			"Roles",
			"Waves",
			"May change",
		]);
		expect(changes[0]?.to).toBe("Atlas (atlas)");
		expect(changes[3]?.to).toBe("None by default");
		expect(changes[4]?.mono).toBe(true);
	});
});

describe("the modal and the page", () => {
	it("opens on Who, with Next held until the agent has a name", () => {
		const html = inProviders(
			<InlineModals>
				<NewAgentModal onClose={() => {}} />
			</InlineModals>,
			seededClient(),
			"/catalog/agents",
		);
		expect(html).toContain('data-testid="agent-new-who"');
		expect(html).not.toContain('data-testid="agent-new-work"');
		expect(html).toContain(">Who<");
		expect(html).toContain(">Work<");
		expect(tagOf(html, "agent-new-kind-feature")).toContain(
			'aria-pressed="true"',
		);
		const next = element(html, "agent-new-modal");
		expect(next).toContain(">Next");
	});

	it("puts New agent in the All agents top bar", async () => {
		const html = await renderSeeded(
			"/catalog/agents",
			seededClient({ agents: AGENTS }),
		);
		expect(tagOf(html, "agent-new")).toContain("button");
		expect(html).toContain('data-testid="catalog-agents-identity-note"');
		expect(html).not.toContain("can't be edited");
	});
});
