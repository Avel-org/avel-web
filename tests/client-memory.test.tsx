import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { ClientMemoryPanel, MemoryRow } from "@/components/avel/client-memory";
import { queryKeys } from "@/lib/api/keys";
import {
	CLIENT,
	element,
	memory,
	OPERATOR,
	pages,
	render,
} from "./canon-fixtures";
import { tagOf } from "./render-page";

const PROPOSED = memory(1, { contentMd: "Uses **Stripe** for payments." });
const KEPT = memory(2, {
	status: "kept",
	proposedBy: null,
	decidedBy: OPERATOR,
	decidedAt: "2026-10-19T10:00:00.000Z",
});
const REMOVED = memory(3, { status: "removed", decidedBy: OPERATOR });

const seed =
	(rows = [PROPOSED, KEPT, REMOVED]) =>
	(qc: QueryClient) =>
		qc.setQueryData([...queryKeys.canon.memory(CLIENT)], pages(rows));

describe("a client's memory", () => {
	it("groups Canon's proposals apart from what is kept, removed behind a toggle", async () => {
		const html = await render(<ClientMemoryPanel clientId={CLIENT} />, seed());
		expect(element(html, "client-memory-proposed")).toContain(
			`data-testid="client-memory-${PROPOSED.id}"`,
		);
		expect(element(html, "client-memory-kept")).toContain(
			`data-testid="client-memory-${KEPT.id}"`,
		);
		expect(html).not.toContain('data-testid="client-memory-removed"');
		expect(element(html, "client-memory-removed-toggle")).toContain(
			"Show removed (1)",
		);
	});

	it("renders the memory's Markdown, and who proposed or wrote it", async () => {
		const html = await render(<ClientMemoryPanel clientId={CLIENT} />, seed());
		expect(element(html, `client-memory-${PROPOSED.id}`)).toContain("<strong");
		expect(element(html, `client-memory-${PROPOSED.id}`)).toContain(
			"Proposed by Canon",
		);
		expect(element(html, `client-memory-${PROPOSED.id}`)).toContain(
			'data-actor-mark="canon"',
		);
		expect(element(html, `client-memory-${KEPT.id}`)).toContain(
			"Written by javaris500",
		);
	});

	it("offers Keep only on a proposal; Edit and Remove on both", async () => {
		const html = await render(<ClientMemoryPanel clientId={CLIENT} />, seed());
		expect(tagOf(html, `client-memory-${PROPOSED.id}-keep`)).toContain(
			'data-variant="secondary"',
		);
		expect(html).not.toContain(`client-memory-${KEPT.id}-keep`);
		for (const m of [PROPOSED, KEPT]) {
			expect(html).toContain(`data-testid="client-memory-${m.id}-edit"`);
			expect(html).toContain(`data-testid="client-memory-${m.id}-remove"`);
		}
	});

	it("keeps a removed memory as a record: struck, with nothing to do", async () => {
		const html = await render(<MemoryRow memory={REMOVED} clientId={CLIENT} />);
		expect(html).toContain("line-through");
		expect(html).not.toContain(`client-memory-${REMOVED.id}-edit`);
		expect(html).not.toContain(`client-memory-${REMOVED.id}-remove`);
	});

	it("says so, compactly, when there is none, and offers Write a memory", async () => {
		const html = await render(
			<ClientMemoryPanel clientId={CLIENT} />,
			seed([]),
		);
		expect(element(html, "client-memory-empty")).toContain("No memory yet");
		expect(html).toContain('data-testid="client-memory-write-open"');
	});
});
