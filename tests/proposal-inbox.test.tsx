import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { proposalSchema } from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	ProposalsSection,
	proposalCountLabel,
} from "@/components/avel/proposal-inbox";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiProvider } from "@/lib/api";
import { fakeApi } from "./clients-fixtures";
import { tagOf } from "./render-page";

/*
 * Pending proposals in the inbox (module 14): what each would do and where
 * it came from, approved or dismissed by the operator. Nothing writes them
 * yet, so "None waiting" is the state the inbox shows today.
 */

const proposal = (extra: Record<string, unknown> = {}) =>
	proposalSchema.parse({
		id: "00000000-0000-4000-8000-000000000801",
		kind: "next_module",
		source: "code",
		engagementId: null,
		missionId: null,
		summary: "Dispatch the payments module next: the scheduling gate is green.",
		payload: {},
		premise: {},
		status: "pending",
		reason: null,
		decidedBy: null,
		decidedAt: null,
		createdAt: "2026-10-24T10:00:00.000Z",
		updatedAt: "2026-10-24T10:00:00.000Z",
		...extra,
	});

const render = (node: React.ReactNode) =>
	renderToString(
		<ApiProvider client={fakeApi().client}>
			<QueryClientProvider client={new QueryClient()}>
				<TooltipProvider>{node}</TooltipProvider>
			</QueryClientProvider>
		</ApiProvider>,
	);

describe("pending proposals", () => {
	it("says what each would do, its kind and where it came from, with approve and dismiss", () => {
		const p = proposal();
		const html = render(
			<ProposalsSection proposals={[p]} count={1} failed={false} />,
		);
		expect(html).toContain(p.summary);
		expect(html).toContain("Next module");
		expect(html).toContain("From AVEL");
		expect(tagOf(html, `proposal-${p.id}-approve`)).toMatch(/^<button/);
		expect(tagOf(html, `proposal-${p.id}-dismiss`)).toMatch(/^<button/);
		const canon = render(
			<ProposalsSection
				proposals={[proposal({ source: "model", kind: "intake_questions" })]}
				count={1}
				failed={false}
			/>,
		);
		expect(canon).toContain("From Canon");
		expect(canon).toContain("Intake questions");
	});

	it("says none are waiting, or that they could not be read", () => {
		expect(
			render(<ProposalsSection proposals={[]} count={0} failed={false} />),
		).toContain("None waiting.");
		expect(
			render(
				<ProposalsSection proposals={undefined} count={undefined} failed />,
			),
		).toContain("Could not load these.");
		expect(proposalCountLabel(1)).toBe("1 proposal");
		expect(proposalCountLabel(3)).toBe("3 proposals");
	});
});
