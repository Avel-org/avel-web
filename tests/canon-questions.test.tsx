import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { CanonPanel } from "@/components/avel/canon-panel";
import {
	CanonQuestionCard,
	CanonQuestionsPanel,
	SettledQuestion,
} from "@/components/avel/canon-questions";
import { queryKeys } from "@/lib/api/keys";
import {
	CHUNK,
	element,
	FILE,
	INTAKE,
	message,
	OPERATOR,
	pages,
	question,
	render,
	SESSION,
	session,
} from "./canon-fixtures";
import { tagOf } from "./render-page";

const counts = { open: 1, answered: 2, acknowledged: 0, dismissed: 1 };

describe("an open question, as a card", () => {
	it("shows its header chip, the question, why it asks and its sources", async () => {
		const q = question(1, {
			sources: [
				{ fileId: FILE, fileName: "brief.md", purged: false, chunkId: CHUNK },
			],
		});
		const html = await render(
			<CanonQuestionCard question={q} intakeId={INTAKE} />,
		);
		expect(element(html, `canon-question-${q.id}-header`)).toContain(">Auth<");
		expect(html).toContain("How do patients sign in?");
		expect(html).toContain(
			"The brief names patients but not how they sign in.",
		);
		expect(element(html, `canon-question-${q.id}-source-${CHUNK}`)).toContain(
			">brief.md<",
		);
	});

	it("offers its options as radio cards plus Other, one choice", async () => {
		const q = question(1);
		const html = await render(
			<CanonQuestionCard question={q} intakeId={INTAKE} />,
		);
		expect(tagOf(html, `canon-question-${q.id}-option-Email link`)).toContain(
			'role="radio"',
		);
		expect(html).toContain(`data-testid="canon-question-${q.id}-option-other"`);
		expect(html).toContain("A one-time link by email.");
	});

	it("offers checkboxes where several may be chosen, with Other as free text", async () => {
		const q = question(2, { multiSelect: true });
		const html = await render(
			<CanonQuestionCard question={q} intakeId={INTAKE} />,
		);
		expect(tagOf(html, `canon-question-${q.id}-option-Password`)).toContain(
			'role="checkbox"',
		);
		expect(html).toContain(`data-testid="canon-question-${q.id}-other"`);
	});

	it("holds Answer until something is chosen; Acknowledge and Dismiss are ghost", async () => {
		const q = question(1);
		const html = await render(
			<CanonQuestionCard question={q} intakeId={INTAKE} />,
		);
		expect(tagOf(html, `canon-question-${q.id}-answer`)).toContain(
			'data-variant="default"',
		);
		expect(tagOf(html, `canon-question-${q.id}-answer`)).toMatch(
			/\sdisabled=""/,
		);
		expect(html).toContain("Choose an option or write an answer.");
		for (const b of ["acknowledge", "dismiss"])
			expect(tagOf(html, `canon-question-${q.id}-${b}`)).toContain(
				'data-variant="ghost"',
			);
	});
});

describe("settled questions", () => {
	it("says how each was settled, the note in Markdown, who and when", async () => {
		const q = question(3, {
			status: "answered",
			answer: { selected: ["Email link"], other: "and SSO later" },
			effectMd: "Adds **magic links** to the brief.",
			decidedBy: OPERATOR,
			decidedAt: "2026-10-19T10:15:00.000Z",
		});
		const html = await render(<SettledQuestion question={q} />);
		expect(element(html, `canon-settled-${q.id}-answer`)).toContain(
			"Answer: Email link, and SSO later",
		);
		expect(element(html, `canon-settled-${q.id}-effect`)).toContain("<strong");
		expect(html).toContain("javaris500");
		expect(html).toContain("19 Oct, 10:15");
	});

	it("splits by status with each count over the intake", async () => {
		const html = await render(<CanonQuestionsPanel intakeId={INTAKE} />, (qc) =>
			qc.setQueryData(
				[...queryKeys.canon.questions(INTAKE, "answered")],
				pages(
					[
						question(3, {
							status: "answered",
							answer: { selected: ["Password"], other: null },
						}),
					],
					{ counts },
				),
			),
		);
		expect(tagOf(html, "canon-questions-status-answered")).toContain(
			'aria-pressed="true"',
		);
		expect(element(html, "canon-questions-status-dismissed")).toContain(">1<");
	});
});

describe("the open questions in the Canon panel", () => {
	it("stack above the composer while the session is open", async () => {
		const seed = (qc: QueryClient) => {
			const s = session({ openQuestions: 1 });
			qc.setQueryData([...queryKeys.canon.sessions(INTAKE)], pages([s]));
			qc.setQueryData([...queryKeys.canon.session(SESSION)], s);
			qc.setQueryData([...queryKeys.canon.messages(SESSION)], [message(1)]);
			qc.setQueryData(
				[...queryKeys.canon.questions(INTAKE, "open")],
				pages([question(1)], { counts }),
			);
		};
		const html = await render(<CanonPanel intakeId={INTAKE} />, seed);
		expect(html.indexOf('data-testid="canon-open-questions"')).toBeGreaterThan(
			-1,
		);
		expect(html.indexOf('data-testid="canon-open-questions"')).toBeLessThan(
			html.indexOf('data-testid="canon-composer"'),
		);
	});
});
