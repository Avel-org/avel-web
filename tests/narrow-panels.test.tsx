import type { QueryClient } from "@tanstack/react-query";
import { finding, gateReason } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import { CitationChip } from "@/components/avel/canon-citation";
import { CanonMessageRow } from "@/components/avel/canon-panel";
import { FindingsPanel } from "@/components/avel/findings-panel";
import { GateReceipt } from "@/components/avel/gate-panel";
import { queryKeys } from "@/lib/api/keys";
import { citation, message, pages, render } from "./canon-fixtures";
import { tagOf } from "./render-page";

/*
 * At a phone's width (375px, measured live once): nothing the panels hold
 * may push sideways. Long tokens truncate with the whole value on hover, or
 * break; rows wrap. These hold the classes that did it.
 */

const LONG = "a-very-long-unbroken-identifier-that-would-push-the-row-wider";
const MISSION = "00000000-0000-4000-8000-000000000001";

describe("panels at a phone's width", () => {
	it("truncates a gate reason's long source, whole on hover", async () => {
		const reason = gateReason.parse({
			gate: "qa",
			findingId: "check:1",
			kind: "check",
			source: LONG,
			subject: "x",
			policy: "mandatory",
			rule: "mandatory_failed",
			effect: "block",
			degraded: false,
			overridable: false,
			severity: null,
			overrides: [],
			message: "m",
		});
		const html = await render(
			<GateReceipt
				run={{
					id: MISSION,
					at: "2026-10-19T10:00:00.000Z",
					missionId: MISSION,
					commitSha: "c".repeat(40),
					baseSha: "b".repeat(40),
					result: "fail",
					decideVersion: 1,
					receiptVersion: 1,
					configSha256: "e".repeat(64),
					receiptSha256: "d".repeat(64),
					gates: [
						{
							gate: "qa",
							policy: "mandatory",
							result: "fail",
							reasons: [reason],
						},
					],
					reasons: [reason],
					ignoredOverrides: [],
					excludedDispatches: [],
					receipt: "{}",
				}}
				drafts={{}}
				onDraft={() => {}}
			/>,
		);
		expect(html).toMatch(
			new RegExp(`<span title="${LONG}" class="[^"]*min-w-0[^"]*truncate`),
		);
	});

	it("truncates a finding's long rule, wraps its actions under it, and keeps the status row in the body", async () => {
		const f = finding.parse({
			id: "00000000-0000-4000-8000-000000000401",
			missionId: MISSION,
			clientId: null,
			rule: `spec-check:${LONG}`,
			subject: "s",
			severity: "high",
			class: "c",
			status: "open",
			dismissedReason: null,
			caughtBy: "judge",
			reportedByDispatchId: null,
			createdAt: "2026-10-19T09:00:00.000Z",
			updatedAt: "2026-10-19T09:00:00.000Z",
		});
		const html = await render(
			<FindingsPanel missionId={MISSION} />,
			(qc: QueryClient) =>
				qc.setQueryData(
					[...queryKeys.findings.list(MISSION, "open")],
					pages([f], { counts: { open: 12, confirmed: 340, dismissed: 1200 } }),
				),
		);
		expect(html).toMatch(
			new RegExp(`title="spec-check:${LONG}" class="[^"]*truncate`),
		);
		// The header's actions can't shrink; in the body the row can wrap.
		expect(html.indexOf('data-testid="findings-status"')).toBeGreaterThan(
			html.indexOf('data-testid="findings-panel-content"'),
		);
		expect(
			html.indexOf('data-testid="findings-panel-content"'),
		).toBeGreaterThan(html.indexOf('data-testid="findings-panel-header"'));
		expect(tagOf(html, "findings-status")).toMatch(
			/max-w-full[^"]*flex-wrap|flex-wrap[^"]*max-w-full/,
		);
	});

	it("keeps Canon's bubble inside the row beside its mark, and a citation chip inside the bubble", async () => {
		const html = await render(
			<CanonMessageRow
				message={message(2, {
					role: "canon",
					citations: [citation({ fileName: `${LONG}.md` })],
				})}
			/>,
		);
		expect(html).toContain("max-w-[calc(85%_-_1.75rem)]");
		const chip = await render(
			<CitationChip
				source={citation({ fileName: `${LONG}.md` })}
				data-testid="c"
			/>,
		);
		expect(chip).toContain("max-w-[min(16rem,100%)]");
		expect(tagOf(chip, "c")).toContain("max-w-full");
	});
});
