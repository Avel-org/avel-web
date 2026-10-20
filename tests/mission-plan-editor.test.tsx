import type { MissionPlan } from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	APPROVED_LOCK_REASON,
	consumePlanHash,
	LANDED_RING,
	landOn,
	PlanEditor,
} from "@/components/avel/plan-editor";
import { choiceFor, NO_TEMPLATE } from "@/components/avel/template-picker";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ApiError } from "@/lib/api";
import { contractError } from "./clients-fixtures";
import { plan, template, withApi } from "./mission-plan-fixtures";
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
		withApi(
			<TooltipProvider>
				<PlanEditor
					plan={p}
					readOnlyReason={readOnlyReason}
					pending={false}
					error={error}
					onSave={() => {}}
				/>
			</TooltipProvider>,
		),
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
				modules: [
					{
						id: "M1",
						name: "Booking",
						reads: [],
						requirementIds: ["R1", "R9"],
					},
				],
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
		// What the stored brief lacks still shows, as the server said it.
		expect(html).toMatch(
			/data-testid="plan-check-issue"[^>]*>.*R2 is in no module</,
		);
	});
});

describe("the plan's Fields, JSON and Request", () => {
	it("shows the stored record and the exact PUT body a save sends", () => {
		const html = render(plan());
		for (const tab of ["fields", "json", "request"]) {
			expect(html).toContain(`data-testid="plan-inspector-${tab}"`);
		}
		expect(html).toContain(`PUT /api/missions/${plan().missionId}/plan`);
		const request = html.slice(html.indexOf('data-testid="plan-request"'));
		// The whole plan, the template pair included: PUT replaces it.
		expect(request).toContain("&quot;templateRef&quot;: null");
		expect(request).toContain("&quot;requirements&quot;");
		expect(html).toContain('data-testid="plan-json"');
	});
});

describe("where Resolve lands", () => {
	it("gives every target an element: items, lists and fields", () => {
		const html = render(plan({ approvedBrief: null }));
		for (const id of [
			"plan-summary",
			"plan-templateRef",
			"plan-templateVersion",
			"plan-requirements",
			"plan-modules",
			"plan-requirement-R1",
			"plan-criterion-AC1",
			"plan-module-M1",
		]) {
			expect(html).toMatch(new RegExp(`\\sid="${id}"`));
		}
	});

	it("gives every anchored item the warn ring a landed issue draws (audit F4)", () => {
		const html = render(plan());
		const anchored = [
			...html.matchAll(/<[a-z]+\s(?:[^>]*\s)?id="plan-[^"]+"[^>]*>/g),
		];
		expect(anchored.length).toBeGreaterThan(3);
		for (const [tag] of anchored)
			expect(tag, tag.slice(0, 60)).toContain(
				"data-[landed=issue]:outline-gate-warn-solid",
			);
		expect(LANDED_RING).not.toMatch(/accent/);
	});

	it("marks the item a Resolve link lands on, scrolls to it, and focuses its first control", () => {
		const focused: string[] = [];
		const scrolled: unknown[] = [];
		const control = { focus: () => focused.push("control") };
		const item = {
			dataset: {} as Record<string, string>,
			scrollIntoView: (arg: unknown) => scrolled.push(arg),
			querySelector: () => control,
		};
		landOn(item as unknown as HTMLElement);
		expect(item.dataset.landed).toBe("issue");
		expect(scrolled).toEqual([{ block: "center" }]);
		expect(focused).toEqual(["control"]);
	});

	it("uses the hash once, so a later remount does not jump back", () => {
		const replaced: string[] = [];
		const history = {
			replaceState: (_: unknown, __: string, url?: string | URL | null) =>
				replaced.push(String(url)),
		};
		const location = {
			hash: "#plan-requirement-R2",
			pathname: "/missions/x/plan",
			search: "?a=1",
		};
		expect(consumePlanHash(location, history)).toBe("plan-requirement-R2");
		expect(replaced).toEqual(["/missions/x/plan?a=1"]);
		expect(
			consumePlanHash({ ...location, hash: "#other" }, history),
		).toBeNull();
		expect(replaced).toHaveLength(1);
	});
});

describe("the template, picked from templates.list", () => {
	const BOOKING = template();
	const SHA = "b".repeat(40);
	const UNREADABLE = template({
		slug: "template-legacy",
		readable: false,
		name: null,
		scope: null,
		startingState: null,
		latestSha: null,
	});

	/** The picker's trigger, from its opening tag to its close. */
	const picked = (html: string) => {
		const from = region(html, "plan-template-ref");
		return from.slice(0, from.indexOf("</button>"));
	};

	function renderWith(
		p: MissionPlan,
		templates?: Parameters<typeof withApi>[1],
	) {
		return renderToString(
			withApi(
				<TooltipProvider>
					<PlanEditor
						plan={p}
						readOnlyReason={null}
						pending={false}
						error={null}
						onSave={() => {}}
					/>
				</TooltipProvider>,
				templates,
			),
		);
	}

	it("is a picker, not a text field, naming the chosen template", () => {
		const html = renderWith(
			plan({ templateRef: "template-booking", templateVersion: SHA }),
			[BOOKING, UNREADABLE],
		);
		const trigger = tagOf(html, "plan-template-ref");
		expect(trigger).toMatch(/^<button/);
		expect(trigger).toContain('role="combobox"');
		expect(html).not.toContain('placeholder="template-booking"');
		expect(picked(html)).toContain(">Booking<");
	});

	it("says No template when the plan has none", () => {
		const html = renderWith(plan(), [BOOKING]);
		expect(picked(html)).toContain(">No template<");
		expect(html).not.toContain('data-testid="plan-template-latest"');
	});

	it("offers the latest commit when the plan pins another", () => {
		const html = renderWith(
			plan({ templateRef: "template-booking", templateVersion: SHA }),
			[BOOKING],
		);
		expect(html).toContain('data-testid="plan-template-use-latest"');
		expect(region(html, "plan-template-latest")).toContain(">aaaaaaa<");
		const pinned = renderWith(
			plan({
				templateRef: "template-booking",
				templateVersion: BOOKING.latestSha,
			}),
			[BOOKING],
		);
		expect(pinned).not.toContain('data-testid="plan-template-latest"');
	});

	it("waits, disabled, while the list loads", () => {
		const html = renderWith(plan());
		expect(tagOf(html, "plan-template-ref")).toMatch(/\sdisabled=""/);
		expect(picked(html)).toContain(">Loading templates<");
	});

	it("falls back to typing the name when the list cannot be read", () => {
		const html = renderWith(plan(), contractError(404, "NOT_FOUND"));
		expect(tagOf(html, "plan-template-ref")).toMatch(/^<input/);
		expect(html).toContain('data-testid="plan-template-ref-fallback"');
	});

	it("pins a chosen template's latest commit, and clears both for none", () => {
		const list = [BOOKING, UNREADABLE];
		expect(choiceFor("template-booking", list)).toEqual({
			templateRef: "template-booking",
			templateVersion: BOOKING.latestSha,
		});
		// No commit can be read from an unreadable repository: type it.
		expect(choiceFor("template-legacy", list)).toEqual({
			templateRef: "template-legacy",
			templateVersion: "",
		});
		expect(choiceFor(NO_TEMPLATE, list)).toEqual({
			templateRef: "",
			templateVersion: "",
		});
	});
});
