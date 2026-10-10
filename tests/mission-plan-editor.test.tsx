import type { MissionPlan } from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	APPROVED_LOCK_REASON,
	PlanEditor,
} from "@/components/avel/plan-editor";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ApiError } from "@/lib/api";
import { contractError } from "./clients-fixtures";
import { plan } from "./mission-plan-fixtures";
import { tagOf, tagWithId, textOfId } from "./render-page";

const READ_ONLY = "This mission can no longer be changed.";

function render(
	p: MissionPlan,
	{
		readOnlyReason = null,
		error = null,
	}: { readOnlyReason?: string | null; error?: ApiError | null } = {},
) {
	return renderToString(
		<TooltipProvider>
			<PlanEditor
				plan={p}
				readOnlyReason={readOnlyReason}
				pending={false}
				error={error}
				onSave={() => {}}
			/>
		</TooltipProvider>,
	);
}

/** The markup from one data-testid to the next sibling's, for scoped checks. */
function region(html: string, testid: string): string {
	const start = html.indexOf(`data-testid="${testid}"`);
	if (start < 0) throw new Error(`no ${testid}`);
	return html.slice(start);
}

describe("the plan check, as a to-do list", () => {
	it("lists every issue with the server's own words", () => {
		const html = render(plan());
		expect(tagOf(html, "plan-check-status")).toBeDefined();
		expect(html).toMatch(/data-testid="plan-check-status"[^>]*>1 to do</);
		expect(html).toMatch(
			/data-testid="plan-check-issue"[^>]*>.*R2 is in no module</,
		);
	});

	it("also puts each issue on its item, by path", () => {
		const html = render(plan());
		expect(html).toMatch(
			/data-testid="plan-requirement-R2-notes-check"[^>]*>R2 is in no module</,
		);
		expect(html).not.toContain('data-testid="plan-requirement-R1-notes"');
	});

	it("says a passing plan passes, with nothing to do", () => {
		const html = render(plan({ check: { passed: true, issues: [] } }));
		expect(html).toMatch(/data-testid="plan-check-status"[^>]*>Passes</);
		expect(html).not.toContain('data-testid="plan-check-issues"');
	});
});

describe("an approved brief, which the plan only adds to", () => {
	it("locks the summary, R1 and AC1, with the reason", () => {
		const html = render(plan());
		expect(html).toContain('data-testid="plan-summary-locked"');
		expect(html).not.toContain('data-testid="plan-summary-input"');
		const r1 = region(html, "plan-requirement-R1");
		expect(r1).toMatch(/^[^>]*>/);
		expect(html).toContain('data-testid="plan-requirement-R1-locked"');
		expect(html).toContain('data-testid="plan-criterion-AC1-locked"');
		expect(tagOf(html, "plan-requirement-R1-text")).toMatch(/^<p/);
		expect(tagOf(html, "plan-criterion-AC1-text")).toMatch(/^<p/);
		expect(html).not.toContain('data-testid="plan-requirement-R1-remove"');
		expect(html).not.toContain('data-testid="plan-criterion-AC1-remove"');
		expect(html).toContain(APPROVED_LOCK_REASON);
	});

	it("leaves what the planner added editable and removable", () => {
		const html = render(plan());
		expect(tagOf(html, "plan-requirement-R2-text")).toMatch(/^<textarea/);
		expect(tagOf(html, "plan-criterion-AC2-text")).toMatch(/^<textarea/);
		expect(html).toContain('data-testid="plan-requirement-R2-remove"');
		expect(html).not.toContain('data-testid="plan-requirement-R2-locked"');
	});

	it("locks nothing for a mission no intake created", () => {
		const html = render(plan({ approvedBrief: null }));
		expect(html).toContain('data-testid="plan-summary-input"');
		expect(tagOf(html, "plan-requirement-R1-text")).toMatch(/^<textarea/);
		expect(html).toContain('data-testid="plan-requirement-R1-remove"');
	});
});

describe("modules", () => {
	it("shows which requirements each module owns, and where each sits", () => {
		const html = render(plan());
		expect(tagOf(html, "plan-module-M1-has-R1")).toContain(
			'aria-pressed="true"',
		);
		expect(tagOf(html, "plan-module-M1-has-R2")).toContain(
			'aria-pressed="false"',
		);
		expect(html).toMatch(
			/data-testid="plan-requirement-R1-placed"[^>]*>In M1</,
		);
		expect(html).toMatch(
			/data-testid="plan-requirement-R2-placed"[^>]*>In no module</,
		);
	});

	it("shows a listed id the brief lacks, rather than dropping it", () => {
		const p = plan();
		const html = render({
			...p,
			brief: p.brief && {
				...p.brief,
				modules: [{ id: "M1", name: "Booking", requirementIds: ["R1", "R9"] }],
			},
		});
		expect(html).toContain('data-testid="plan-module-M1-missing-R9"');
	});
});

describe("saving", () => {
	it("is disabled until something changed, with the reason", () => {
		const html = render(plan());
		const button = tagOf(html, "plan-save");
		expect(button).toMatch(/\sdisabled=""/);
		const id = button.match(/aria-describedby="([^"]+)"/)?.[1] ?? "";
		expect(tagWithId(html, id)).toContain('class="sr-only"');
		expect(textOfId(html, id)).toBe("Nothing has changed yet.");
	});

	it("puts an approved-brief refusal on its item and lists it whole", () => {
		const html = render(plan(), {
			error: contractError(422, "PRECONDITION_FAILED", {
				reason: "plan_changes_approved_brief",
				issues: [
					{
						path: ["brief", "requirements", 0, "text"],
						message: "R1 was approved and its text cannot change",
					},
				],
			}),
		});
		expect(html).toMatch(
			/data-testid="plan-requirement-R1-notes-error"[^>]*>R1 was approved and its text cannot change</,
		);
		expect(html).toContain('data-testid="plan-refused-issues"');
		expect(html).toContain('data-testid="form-error"');
	});
});

describe("a plan that cannot change", () => {
	it("is read-only with the reason, and offers no edits", () => {
		const html = render(plan({ approvedBrief: null }), {
			readOnlyReason: READ_ONLY,
		});
		expect(html).toMatch(
			/data-testid="plan-read-only"[^>]*>.*This mission can no longer be changed\./,
		);
		for (const testid of [
			"plan-save",
			"plan-add-requirement",
			"plan-add-module",
			"plan-summary-input",
			"plan-requirement-R2-remove",
			"plan-requirement-R1-add-criterion",
		]) {
			expect(html).not.toContain(`data-testid="${testid}"`);
		}
		expect(tagOf(html, "plan-module-M1-has-R1")).toMatch(/\sdisabled=""/);
		// The check still shows: it is how far the plan is from passing.
		expect(html).toContain('data-testid="plan-check-issues"');
	});

	it("explains a stored brief that predates the shape", () => {
		const html = render(plan({ brief: null }));
		expect(html).toContain('data-testid="plan-no-brief"');
		expect(html).not.toContain('data-testid="plan-editor"');
	});
});
