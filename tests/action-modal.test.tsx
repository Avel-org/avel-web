import { Dialog as DialogPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	ActionModalFrame,
	type ActionModalFrameProps,
	closeIntent,
	type FieldIssue,
	issuesOf,
	ModalField,
	placeIssues,
	shellClass,
	submitsOn,
} from "@/components/avel/action-modal";
import { HoverCard } from "@/components/avel/hover-card";
import { InlineExpand, showMoreLabel } from "@/components/avel/inline-expand";
import { fieldChanges, WhatChanges } from "@/components/avel/what-changes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api";
import { tagOf } from "./render-page";

// ---------------------------------------------------------------------------
// Fixtures: refusals shaped as avel-server sends them.

const where = { method: "POST", path: "/api/x", requestId: "req-1" } as const;

const validation = (body: FieldIssue[]) =>
	new ApiError({
		...where,
		kind: "contract",
		status: 400,
		code: "VALIDATION_FAILED",
		message: "for logs only",
		details: { body: body.map((i) => ({ ...i, path: [...i.path] })) },
	});

const precondition = (issues: FieldIssue[]) =>
	new ApiError({
		...where,
		kind: "contract",
		status: 422,
		code: "PRECONDITION_FAILED",
		message: "for logs only",
		details: {
			reason: "plan_changes_approved_brief",
			issues: issues.map((i) => ({ ...i, path: [...i.path] })),
		},
	});

const notFound = new ApiError({
	...where,
	kind: "contract",
	status: 404,
	code: "NOT_FOUND",
	message: "for logs only",
});

// ---------------------------------------------------------------------------
// Issues.

describe("issuesOf", () => {
	it("reads a 400's body issues and a 422's issues, and nothing else", () => {
		expect(issuesOf(validation([{ path: ["name"], message: "m" }]))).toEqual([
			{ path: ["name"], message: "m" },
		]);
		expect(
			issuesOf(precondition([{ path: ["brief", "summary"], message: "p" }])),
		).toEqual([{ path: ["brief", "summary"], message: "p" }]);
		expect(issuesOf(notFound)).toEqual([]);
		expect(issuesOf(null)).toEqual([]);
		expect(issuesOf(new Error("not an ApiError"))).toEqual([]);
	});
});

describe("placeIssues", () => {
	const issues: FieldIssue[] = [
		{ path: ["name"], message: "Too long" },
		{ path: ["name"], message: "Taken" },
		{ path: [0, "x"], message: "Positional" },
		{ path: [], message: "Whole request" },
	];

	it("puts each issue on its field, in order, and keeps the rest apart", () => {
		const { byField, unplaced } = placeIssues(issues, (path) =>
			typeof path[0] === "string" ? path[0] : null,
		);
		expect(byField).toEqual({ name: ["Too long", "Taken"] });
		expect(unplaced.map((i) => i.message)).toEqual([
			"Positional",
			"Whole request",
		]);
	});

	it("words a placed issue with the caller's copy", () => {
		const { byField } = placeIssues(
			issues.slice(0, 1),
			() => "name",
			(issue) => `Name: ${issue.message}`,
		);
		expect(byField).toEqual({ name: ["Name: Too long"] });
	});
});

// ---------------------------------------------------------------------------
// Closing and submitting.

describe("closing and submitting", () => {
	it("asks before discarding a change, except while a request is in flight", () => {
		expect(closeIntent(false, false)).toBe("close");
		expect(closeIntent(true, false)).toBe("ask");
		expect(closeIntent(true, true)).toBe("close");
	});

	const key = (over: Partial<Parameters<typeof submitsOn>[0]>) => ({
		key: "Enter",
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		...over,
	});

	it("submits on ⌘Enter or Ctrl+Enter only, and never while blocked", () => {
		expect(submitsOn(key({ metaKey: true }), false)).toBe(true);
		expect(submitsOn(key({ ctrlKey: true }), false)).toBe(true);
		expect(submitsOn(key({}), false)).toBe(false);
		expect(submitsOn(key({ metaKey: true, shiftKey: true }), false)).toBe(
			false,
		);
		expect(submitsOn(key({ metaKey: true }), true)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// The frame, rendered inside an open dialog root without its portal.

const noop = () => {};

function frame(
	over: Partial<ActionModalFrameProps> = {},
	children?: ReactNode,
): string {
	const props: ActionModalFrameProps = {
		size: "form",
		title: "Add engagement",
		dirty: false,
		submitLabel: "Add engagement",
		onSubmit: noop,
		pending: false,
		error: null,
		"data-testid": "m",
		confirmingDiscard: false,
		onRequestClose: noop,
		onKeep: noop,
		onDiscard: noop,
		onSubmitClick: noop,
		...over,
	};
	return renderToString(
		<TooltipProvider>
			<DialogPrimitive.Root open>
				<ActionModalFrame {...props}>
					{children ?? props.children}
				</ActionModalFrame>
			</DialogPrimitive.Root>
		</TooltipProvider>,
	);
}

const nameField = (
	<ModalField name="name" label="Name" testid="f-name">
		{(props) => <input {...props} />}
	</ModalField>
);

describe("the modal shell", () => {
	it("fills the screen below md, and centres by size from md", () => {
		for (const size of ["confirm", "form", "stepper"] as const) {
			const classes = shellClass(size).split(/\s+/);
			expect(classes).toContain("inset-0");
			// Nothing narrows, rounds or moves it unless md applies.
			for (const c of classes) {
				if (
					/^(rounded|translate|-translate|max-w|top-|left-|border$)/.test(c)
				) {
					throw new Error(`${size}: ${c} applies below md`);
				}
			}
			expect(classes.some((c) => c.startsWith("md:max-w-"))).toBe(true);
		}
	});
});

describe("the modal frame", () => {
	it("titles itself and names the primary by what it does", () => {
		const html = frame({ submitLabel: "Apply 6 agents" });
		expect(html).toContain(">Add engagement<");
		expect(tagOf(html, "m-submit")).not.toContain('disabled=""');
		expect(html).toContain("Apply 6 agents");
	});

	it("puts a refused field's message on the field, marked invalid", () => {
		const html = frame(
			{ error: validation([{ path: ["name"], message: "Give it a name." }]) },
			nameField,
		);
		expect(tagOf(html, "f-name")).toContain('aria-invalid="true"');
		expect(html).toMatch(/data-testid="f-name-error"[^>]*>Give it a name.</);
		// Every issue is on a field, so the row only points at them.
		expect(html).toContain("Check the fields marked above.");
		expect(html).not.toContain('data-testid="action-modal-unplaced"');
	});

	it("lists what no field holds above the buttons, with the error map's copy", () => {
		const html = frame(
			{
				error: precondition([
					{ path: ["brief", "requirements", 0], message: "R1 changed" },
				]),
				fieldOf: () => null,
			},
			nameField,
		);
		expect(html).toContain('data-testid="action-modal-unplaced"');
		expect(html).toContain("brief.requirements.0");
		expect(html).toContain("R1 changed");
		expect(html).toContain(
			"This plan changes the brief that was approved at intake.",
		);
		expect(tagOf(html, "f-name")).not.toContain("aria-invalid");
	});

	it("gives an error with no issues its error-map copy", () => {
		const html = frame({ error: notFound });
		expect(html).toContain('data-testid="action-modal-refusal"');
		expect(html).not.toContain("Check the fields marked above.");
	});

	it("shows a refusal's request id, in mono with a copy button (audit F4)", () => {
		const traced = new ApiError({
			...where,
			kind: "contract",
			status: 404,
			code: "NOT_FOUND",
			message: "for logs only",
			requestId: "req_refused_7f3c",
		});
		const html = frame({ error: traced });
		const refusal = html.slice(
			html.indexOf('data-testid="action-modal-refusal"'),
		);
		expect(refusal).toContain('data-testid="surface-error-reference"');
		expect(refusal).toMatch(
			/data-testid="surface-error-request-id"[^>]*>req_refused_7f3c</,
		);
		expect(refusal).toContain('data-testid="surface-error-copy"');
	});

	it("asks before discarding, in place of the buttons", () => {
		const html = frame({ confirmingDiscard: true });
		expect(html).toContain('data-testid="m-discard"');
		expect(html).toContain('data-testid="m-keep"');
		expect(html).not.toContain('data-testid="m-submit"');
	});

	it("makes an irreversible write's primary the filled danger confirm (audit D7)", () => {
		expect(tagOf(frame({ destructive: true }), "m-submit")).toContain(
			'data-variant="destructive-confirm"',
		);
		expect(tagOf(frame(), "m-submit")).not.toContain(
			'data-variant="destructive',
		);
	});

	it("disables the primary with its reason, and while pending says so", () => {
		expect(
			tagOf(frame({ submitDisabledReason: "Nothing changed" }), "m-submit"),
		).toContain('disabled=""');
		const pending = frame({ pending: true, pendingLabel: "Applying" });
		expect(tagOf(pending, "m-submit")).toContain('disabled=""');
		expect(pending).toContain("Applying");
	});

	it("numbers a stepper's steps and offers Back after the first", () => {
		const steps = ["Client", "Engagement", "Repository"];
		const first = frame({ size: "stepper", steps, step: 0, onBack: noop });
		expect(first).toContain('aria-current="step"');
		expect(first).not.toContain('data-testid="m-back"');
		expect(frame({ size: "stepper", steps, step: 1, onBack: noop })).toContain(
			'data-testid="m-back"',
		);
	});
});

// ---------------------------------------------------------------------------
// WhatChanges.

describe("fieldChanges", () => {
	type Form = { name: string; repo: string | null; tags: string[] };
	const fields = [
		{ key: "name", label: "Name" },
		{ key: "repo", label: "Repository", mono: true },
		{ key: "tags", label: "Tags" },
	] as const;

	it("adds, removes and changes, in the fields' order", () => {
		expect(
			fieldChanges<Form>(
				{ name: "Booking", repo: "a/b", tags: [] },
				{ name: "Booking app", repo: null, tags: ["x", "y"] },
				fields,
			),
		).toEqual([
			{
				label: "Name",
				kind: "change",
				from: "Booking",
				to: "Booking app",
				mono: undefined,
			},
			{ label: "Repository", kind: "remove", from: "a/b", mono: true },
			{ label: "Tags", kind: "add", to: "x, y", mono: undefined },
		]);
	});

	it("reads blank values alike, and an equal list as no change", () => {
		expect(
			fieldChanges<Form>(
				{ name: "A", repo: null, tags: ["x"] },
				{ name: "A", repo: "", tags: ["x"] },
				fields,
			),
		).toEqual([]);
	});

	it("treats everything as added when there was nothing before", () => {
		expect(
			fieldChanges<Form>(
				undefined,
				{ name: "A", repo: null, tags: [] },
				fields,
			),
		).toEqual([{ label: "Name", kind: "add", to: "A", mono: undefined }]);
	});
});

describe("WhatChanges", () => {
	it("says so when nothing changes", () => {
		const html = renderToString(<WhatChanges changes={[]} data-testid="w" />);
		expect(tagOf(html, "w")).toContain('data-count="0"');
		expect(html).toContain("Nothing changes yet.");
	});

	it("speaks each change's kind, and strikes what a change replaces", () => {
		const html = renderToString(
			<WhatChanges
				data-testid="w"
				changes={[{ label: "Name", kind: "change", from: "A", to: "B" }]}
			/>,
		);
		expect(html.replaceAll("<!-- -->", "")).toContain(
			'<span class="sr-only">Changes </span>',
		);
		expect(html).toMatch(/line-through[^>]*>A</);
		expect(html).toContain(">B<");
	});
});

// ---------------------------------------------------------------------------
// InlineExpand and HoverCard.

describe("InlineExpand", () => {
	const gates = ["a", "b", "c", "d", "e"];
	const render = (items: string[]) =>
		renderToString(
			<InlineExpand
				data-testid="x"
				items={items}
				visible={3}
				getKey={(g) => g}
				noun="gates"
				render={(g) => <span>{`gate-${g}`}</span>}
			/>,
		);

	it("shows the first few, and counts the rest on the toggle", () => {
		const html = render(gates);
		expect(tagOf(html, "x-toggle")).toContain('aria-expanded="false"');
		expect(html).toContain("Show 2 more gates");
		expect(html.indexOf("gate-c")).toBeLessThan(html.indexOf("x-rest"));
	});

	it("keeps the rest inert while closed", () => {
		const html = render(gates);
		expect(html).toMatch(
			/inert=""[^>]*>(<!-- -->)?<ul[^>]*data-testid="x-rest"/,
		);
	});

	it("has no toggle when everything fits", () => {
		expect(render(gates.slice(0, 3))).not.toContain("x-toggle");
	});

	it("counts in the singular for one", () => {
		expect(showMoreLabel(1, "gates")).toBe("Show 1 more gate");
		expect(showMoreLabel(4, "agents")).toBe("Show 4 more agents");
	});
});

describe("HoverCard", () => {
	it("renders the trigger untouched and closed, with no card yet", () => {
		const html = renderToString(
			<HoverCard data-testid="h" trigger={<a href="/x">atlas</a>}>
				<p>preview</p>
			</HoverCard>,
		);
		expect(tagOf(html, "h")).toContain('data-state="closed"');
		expect(html).toContain('<a href="/x">atlas</a>');
		expect(html).not.toContain("preview");
		expect(tagOf(html, "h")).not.toContain("aria-describedby");
	});
});
