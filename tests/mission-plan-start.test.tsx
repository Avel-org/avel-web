import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InlineModals } from "@/components/avel/action-modal";
import { PlanEditor } from "@/components/avel/plan-editor";
import {
	StartPlanForm,
	startPlanChanges,
	storedPreview,
} from "@/components/avel/plan-start";
import { TooltipProvider } from "@/components/ui/tooltip";
import { startPlanBody } from "@/lib/api/mission-plans";
import { contractError } from "./clients-fixtures";
import { plan } from "./mission-plan-fixtures";
import { tagOf, tagWithId, textOfId } from "./render-page";

const noop = () => {};

function renderStart(
	rawBrief: unknown,
	error = null as ReturnType<typeof contractError> | null,
) {
	return renderToString(
		<TooltipProvider>
			<InlineModals>
				<StartPlanForm
					rawBrief={rawBrief}
					pending={false}
					error={error}
					onStart={noop}
				/>
			</InlineModals>
		</TooltipProvider>,
	);
}

describe("the Start a plan confirmation", () => {
	const stored = { summary: "Notifications.", goals: ["fast"], owner: "ops" };

	it("is a Confirm titled with its verb, its button saying what it does", () => {
		const html = renderStart(stored);
		expect(tagOf(html, "plan-start-modal")).toContain('data-size="confirm"');
		expect(html).toContain(">Start a plan<");
		expect(html).toMatch(
			/data-testid="plan-start-modal-submit"[^>]*>Start the plan/,
		);
		// Nothing hidden is lost, so it is not styled as destructive.
		expect(tagOf(html, "plan-start-modal-submit")).not.toContain(
			'data-variant="destructive"',
		);
	});

	it("keeps a usable summary and shows it", () => {
		const html = renderStart(stored);
		expect(html).toContain('data-testid="plan-start-kept"');
		expect(html).toContain(">Notifications.<");
		expect(html).not.toContain('data-testid="plan-start-summary"');
		expect(tagOf(html, "plan-start-modal-submit")).not.toMatch(/\sdisabled=""/);
	});

	it("lists every stored key it does not carry over, read-only, with its value", () => {
		const html = renderStart(stored);
		expect(html).toContain('data-testid="plan-start-dropped-goals"');
		expect(html).toContain('data-testid="plan-start-dropped-owner"');
		expect(html).not.toContain('data-testid="plan-start-dropped-summary"');
		expect(html).toContain(">[&quot;fast&quot;]<");
		expect(html).not.toMatch(
			/data-testid="plan-start-dropped"[\s\S]*<(input|textarea)/,
		);
	});

	it("asks for a summary when the stored one is unusable, and holds until there is one", () => {
		const html = renderStart({ title: "x" });
		expect(html).toContain('data-testid="plan-start-summary"');
		const button = tagOf(html, "plan-start-modal-submit");
		expect(button).toMatch(/\sdisabled=""/);
		const id = button.match(/aria-describedby="([^"]+)"/)?.[1] ?? "";
		expect(tagWithId(html, id)).toContain('class="sr-only"');
		expect(textOfId(html, id)).toBe(
			"Write a summary first: every plan needs one.",
		);
	});

	it("puts a refused summary on its field", () => {
		const html = renderStart(
			{ title: "x" },
			contractError(400, "VALIDATION_FAILED", {
				body: [{ path: ["brief", "summary"], message: "Too long" }],
			}),
		);
		expect(html).toMatch(
			/data-testid="plan-start-summary-error"[^>]*>Too long</,
		);
	});
});

describe("what starting changes", () => {
	it("keeps the summary, starts the lists empty, and removes each stored key", () => {
		const raw = { summary: "S.", goals: ["fast"] };
		const changes = startPlanChanges(startPlanBody(raw), raw, "");
		expect(changes.map((c) => [c.label, c.kind])).toEqual([
			["Summary", "add"],
			["Requirements", "add"],
			["Criteria", "add"],
			["Modules", "add"],
			["Stored goals", "remove"],
		]);
		expect(changes[0]?.to).toBe("Kept: S.");
		expect(changes[4]?.from).toBe('["fast"]');
	});

	it("says a summary is needed until one is written", () => {
		const raw = { title: "x" };
		expect(startPlanChanges(startPlanBody(raw), raw, "  ")[0]?.to).toBe(
			"A summary is needed",
		);
		expect(startPlanChanges(startPlanBody(raw), raw, " New ")[0]?.to).toBe(
			"New",
		);
	});

	it("previews a stored value on one short line", () => {
		expect(storedPreview("a\n  b")).toBe("a b");
		expect(storedPreview("x".repeat(400))).toHaveLength(160);
		expect(storedPreview({ a: 1 })).toBe('{"a":1}');
	});
});

describe("the editor on a brief that predates the shape", () => {
	const render = (onStartPlan?: () => void, landed = false) =>
		renderToString(
			<TooltipProvider>
				<PlanEditor
					plan={plan({ brief: null, approvedBrief: null })}
					readOnlyReason={null}
					pending={false}
					error={null}
					onSave={noop}
					onStartPlan={onStartPlan}
					landed={landed}
				/>
			</TooltipProvider>,
		);

	it("offers Start a plan only when the caller allows it", () => {
		expect(render(noop)).toContain('data-testid="plan-start"');
		expect(render()).not.toContain('data-testid="plan-start"');
	});

	it("highlights a plan that just started", () => {
		const html = renderToString(
			<TooltipProvider>
				<PlanEditor
					plan={plan({ approvedBrief: null })}
					readOnlyReason={null}
					pending={false}
					error={null}
					onSave={noop}
					landed
				/>
			</TooltipProvider>,
		);
		expect(tagOf(html, "plan-editor")).toMatch(/\blanded\b/);
		expect(tagOf(render(undefined, false), "plan-no-brief")).toBeDefined();
	});
});
