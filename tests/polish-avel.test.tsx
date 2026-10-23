import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentCardSkeleton } from "@/components/avel/catalog-agent-card";
import {
	type DataColumn,
	DataTable,
	STRETCHED_LINK,
} from "@/components/avel/data-table";
import { DispatchCardSkeleton } from "@/components/avel/dispatch-board";
import { MissionRowsSkeleton } from "@/components/avel/mission-panels";
import { Reason } from "@/components/avel/reason";
import { ROW_LINK_GROUP, RowChevron } from "@/components/avel/row-link";
import { SectionPanel } from "@/components/avel/section-panel";
import { tagOf } from "./render-page";

/*
 * The v3 polish pass in src/components/avel (Palette.css, UX 1 to UX 8):
 * each piece's own contract, tested where it is built. The pages that use
 * them assert they are in place. (tests/polish.test.tsx holds the
 * primitives' polish.)
 */

describe("row links (v3 UX 5)", () => {
	it("end in a chevron that brightens and nudges 2px on the row's hover or focus", () => {
		const out = renderToString(
			<a href="/x" className={ROW_LINK_GROUP}>
				Row
				<RowChevron />
			</a>,
		);
		expect(out).toContain('class="group/row"');
		const chevron = out.match(/<svg[^>]*data-slot="row-chevron"[^>]*>/)?.[0];
		expect(chevron).toBeDefined();
		for (const cls of [
			"group-hover/row:translate-x-0.5",
			"group-focus-visible/row:translate-x-0.5",
			"group-hover/row:text-text",
			"text-text-subtle",
			"duration-(--duration-micro)",
		])
			expect(chevron).toContain(cls);
		expect(chevron).toContain('aria-hidden="true"');
	});
});

describe("a reason printed inline (v3 UX 6, .reason)", () => {
	it("is a muted caption after a 13px subtle icon", () => {
		const out = renderToString(
			<Reason data-testid="r">Sign in to start a mission</Reason>,
		);
		const tag = tagOf(out, "r");
		expect(tag).toContain('data-slot="reason"');
		expect(tag).toMatch(/\btype-caption\b/);
		expect(tag).toMatch(/\btext-text-muted\b/);
		expect(out).toMatch(
			/<svg[^>]*class="[^"]*size-\[13px\][^"]*text-text-subtle/,
		);
		expect(out).toContain("Sign in to start a mission");
	});
});

describe("skeletons in their content's shape (v3 UX 8)", () => {
	it("draws a dispatch card: name, slug, a pill where the status sits, the budget track", () => {
		const out = renderToString(<DispatchCardSkeleton />);
		expect(tagOf(out, "dispatch-card-skeleton")).toMatch(
			/rounded-card border border-border bg-app-panel p-3/,
		);
		expect(tagOf(out, "dispatch-card-skeleton")).toContain(
			'aria-hidden="true"',
		);
		// v3 .skel-pill: 22px high, 64px wide, the pill radius.
		expect(tagOf(out, "dispatch-card-skeleton-pill")).toMatch(
			/h-\[22px\] w-16 rounded-sm/,
		);
		expect(out.match(/data-slot="skeleton"/g)).toHaveLength(5);
	});

	it("draws mission rows with a pill where the status sits", () => {
		const out = renderToString(<MissionRowsSkeleton rows={3} testId="m" />);
		expect(out.match(/data-testid="m-row"/g)).toHaveLength(3);
		expect(out.match(/data-testid="m-pill"/g)).toHaveLength(3);
		expect(tagOf(out, "m-pill")).toMatch(/h-\[22px\] w-16 rounded-sm/);
	});

	it("draws agent cards with a pill where the kind badge sits", () => {
		const out = renderToString(<AgentCardSkeleton data-testid="a" />);
		expect(out.match(/data-testid="a-pill"/g)).toHaveLength(3);
		// The badge's own height: the skeleton keeps the loaded card's shape.
		expect(tagOf(out, "a-pill")).toMatch(/h-5 w-14 rounded-sm/);
	});
});

describe("section panel headers on a phone (v3 UX 7)", () => {
	it("wrap their actions under the title, in one row at its end", () => {
		const out = renderToString(
			<SectionPanel
				title="Dispatches"
				data-testid="p"
				actions={<button type="button">New dispatch</button>}
			>
				body
			</SectionPanel>,
		);
		// A section is a DataPanel: its parts carry the panel's own test id.
		expect(tagOf(out, "p-header")).toMatch(/\bflex-wrap\b/);
		const actions = tagOf(out, "p-actions");
		expect(actions).toMatch(/\bml-auto\b/);
		expect(actions).toMatch(/\bjustify-end\b/);
	});
});

describe("table rows (v3 UX 5)", () => {
	type Row = { id: string };
	const plain: DataColumn<Row>[] = [
		{ id: "id", header: "Id", cell: (r: Row) => r.id },
	];
	const table = (
		props: Partial<Parameters<typeof DataTable<Row>>[0]> = {},
		columns = plain,
	) =>
		renderToString(
			<DataTable
				label="Rows"
				columns={columns}
				rows={[{ id: "a" }]}
				getRowId={(r) => r.id}
				data-testid="t"
				{...props}
			/>,
		);

	it("give a row with no action no hover fill and no tab stop", () => {
		const row = tagOf(table(), "t-row-a");
		expect(row).toMatch(/\bhover:bg-transparent\b/);
		expect(row).not.toContain("tabindex");
	});

	it("make a row that opens something focusable, with a pointer", () => {
		const row = tagOf(table({ onRowClick: () => {} }), "t-row-a");
		expect(row).toContain('tabindex="0"');
		expect(row).toMatch(/\bcursor-pointer\b/);
		expect(row).not.toMatch(/\bhover:bg-transparent\b/);
	});

	it("stretch a row's one opening link over it, which then answers hover", () => {
		const out = table({ linkedRows: true }, [
			{
				id: "name",
				header: "Name",
				cell: (r: Row) => (
					<a href={`/x/${r.id}`} className={STRETCHED_LINK}>
						{r.id}
					</a>
				),
			},
		]);
		const row = tagOf(out, "t-row-a");
		expect(row).toMatch(/\brelative\b/);
		expect(row).not.toMatch(/\bhover:bg-transparent\b/);
		expect(row).not.toContain("tabindex");
		expect(out).toContain("after:absolute after:inset-0");
	});
});

describe("hit targets (v3 UX 1)", () => {
	it("grow every agent link to 24px without moving it", () => {
		// The agent link renders through the router; its one class string is
		// read from the source instead.
		const source = readFileSync("src/components/avel/agent-actor.tsx", "utf8");
		expect(source).toMatch(/const LINK_CLASS =\s*"py-1\.5 -my-1\.5 /);
	});

	it("give a sortable header's button 24px, its margin taking the padding back", () => {
		const out = renderToString(
			<DataTable
				label="Rows"
				columns={[
					{
						id: "id",
						header: "Id",
						cell: (r: { id: string }) => r.id,
						sortable: true,
					},
				]}
				rows={[]}
				getRowId={(r) => r.id}
				onSortChange={() => {}}
				data-testid="t"
			/>,
		);
		const sort = tagOf(out, "t-sort-id");
		expect(sort).toMatch(/(?:"|\s)-my-1\s/);
		expect(sort).toMatch(/\bpy-1\b/);
	});
});
