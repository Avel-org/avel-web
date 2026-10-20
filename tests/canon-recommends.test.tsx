import { describe, expect, it } from "vitest";
import { CanonRecommends } from "@/components/avel/canon-recommends";
import { element, render } from "./canon-fixtures";

const TEMPLATE = "00000000-0000-4000-8000-000000000991";

const roster = {
	agents: [
		{
			agentTemplateId: TEMPLATE,
			waves: ["A" as const, "B" as const],
			territory: "booking",
			writablePaths: null,
			estimatedTokens: null,
			reason: "The brief's booking flow needs a schema first.",
		},
		{
			agentTemplateId: TEMPLATE,
			waves: [],
			territory: null,
			writablePaths: null,
			estimatedTokens: null,
			reason: "Reviews the payments path.",
		},
	],
};

describe("Canon recommends", () => {
	it("lists each agent with its waves and Canon's reason", async () => {
		const html = await render(<CanonRecommends roster={roster} />);
		expect(element(html, "canon-recommends-0-waves")).toContain(">Waves A B<");
		expect(element(html, "canon-recommends-1-waves")).toContain(">No waves<");
		expect(element(html, "canon-recommends-0")).toContain(
			"The brief&#x27;s booking flow needs a schema first.",
		);
		expect(element(html, "canon-recommends-0")).toContain(">booking<");
		expect(element(html, "canon-recommends-0")).toContain(
			'data-actor-mark="canon"',
		);
	});

	it("says it is a recommendation, not a team, and offers nothing that applies it", async () => {
		const html = await render(<CanonRecommends roster={roster} />);
		expect(html).toContain("not a team: nothing here is applied");
		expect(element(html, "canon-recommends")).not.toMatch(
			/<button[^>]*>(Apply|Use)/,
		);
	});
});
