import { readFileSync } from "node:fs";
import { Command } from "cmdk";
import {
	DropdownMenu as DropdownMenuPrimitive,
	Select as SelectPrimitive,
} from "radix-ui";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
} from "@/components/ui/breadcrumb";
import { Checkbox } from "@/components/ui/checkbox";
import { CommandItem } from "@/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// The v3 component polishes (Palette.css, section named on each test).
// Portalled overlays (tooltip, toast) do not render on the server, so those
// two read their source here and were measured live in the QA pass.

const html = (node: React.ReactNode) => renderToString(node);
const decoded = (s: string) =>
	s
		.replaceAll("&gt;", ">")
		.replaceAll("&lt;", "<")
		.replaceAll("&amp;", "&")
		.replaceAll("&#x27;", "'");
const slot = (markup: string, name: string) =>
	decoded(
		markup.match(new RegExp(`<[a-z]+[^>]*data-slot="${name}"[^>]*>`))?.[0] ??
			"",
	);
const source = (path: string) =>
	readFileSync(
		new URL(`../src/components/ui/${path}`, import.meta.url),
		"utf8",
	);

describe("(1) the checkbox's check animates in (Polish 5)", () => {
	it("scales and fades in over the micro duration", () => {
		const indicator = slot(html(<Checkbox checked />), "checkbox-indicator");
		expect(indicator).toContain(
			"animate-in fade-in-0 zoom-in-75 duration-(--duration-micro) ease-avel",
		);
	});
});

describe("(2) the switch's thumb slides (Polish 5)", () => {
	it("moves its transform over the micro duration", () => {
		const thumb = slot(html(<Switch />), "switch-thumb");
		expect(thumb).toContain(
			"transition-transform duration-(--duration-micro) ease-avel",
		);
	});
});

describe("(3) a page's tabs share one sliding underline", () => {
	const tabs = (variant?: "default" | "line") =>
		html(
			<Tabs defaultValue="a">
				<TabsList variant={variant}>
					<TabsTrigger value="a">A</TabsTrigger>
					<TabsTrigger value="b">B</TabsTrigger>
				</TabsList>
			</Tabs>,
		);

	it("draws one accent-text indicator that slides over the state duration", () => {
		const markup = tabs("line");
		expect(markup.split('data-slot="tabs-indicator"')).toHaveLength(2);
		const indicator = slot(markup, "tabs-indicator");
		expect(indicator).toContain("bg-accent-text");
		expect(indicator).toContain(
			"data-animate:transition-[transform,width] data-animate:duration-(--duration-state) data-animate:ease-avel",
		);
		expect(indicator).toContain("motion-reduce:transition-none");
		// Hidden until measured in the browser; the trigger's own bar paints first.
		expect(indicator).toMatch(/\bopacity-0\b/);
	});

	it("hands the underline from the trigger to the indicator once measured", () => {
		const trigger = slot(tabs("line"), "tabs-trigger");
		expect(trigger).toContain(
			"group-data-[indicator=ready]/tabs-list:data-[state=active]:after:opacity-0!",
		);
	});

	it("leaves the segmented look alone: a chip, no underline", () => {
		expect(tabs("default")).not.toContain('data-slot="tabs-indicator"');
	});
});

describe("(4) the tooltip is a small float (no v3 class; the nearest is .menu)", () => {
	it("sits on the float surface, in caption type, with the popover shadow", () => {
		const tooltip = source("tooltip.tsx");
		expect(tooltip).toMatch(/bg-app-float[^"]*type-caption[^"]*shadow-popover/);
	});
});

describe("(5) the toast leads with v3 .toast-icon", () => {
	it("draws the icon in a 22px circle on its tone's soft ground", () => {
		const sonner = source("sonner.tsx");
		expect(sonner).toContain("size-[22px]! place-items-center rounded-full");
		expect(sonner).toContain('success: "[&_[data-icon]]:bg-gate-pass-soft!"');
	});
});

describe("(6) menu and select rows (v3 .menu-row, UX 6 .is-unavailable)", () => {
	const menu = (node: React.ReactNode) =>
		html(
			<DropdownMenuPrimitive.Root open>
				<DropdownMenuPrimitive.Trigger />
				<DropdownMenuPrimitive.Content>{node}</DropdownMenuPrimitive.Content>
			</DropdownMenuPrimitive.Root>,
		);

	it("sets rows 36px", () => {
		expect(
			slot(
				menu(<DropdownMenuItem>Open</DropdownMenuItem>),
				"dropdown-menu-item",
			),
		).toMatch(/\bh-9\b/);
	});

	it("disables a row with a reason, and prints the reason in the row", () => {
		const markup = menu(
			<DropdownMenuItem disabledReason="Reopen the client first">
				Start mission
			</DropdownMenuItem>,
		);
		expect(slot(markup, "dropdown-menu-item")).toContain('data-disabled=""');
		expect(markup).toMatch(
			/data-slot="item-reason" class="ml-auto type-caption text-text-muted">Reopen the client first</,
		);
	});

	it("checks a select's chosen option in accent-text", () => {
		expect(source("select.tsx")).toContain(
			'CheckIcon className="size-4 text-accent-text"',
		);
		expect(source("dropdown-menu.tsx")).toContain(
			'CheckIcon className="size-4 text-accent-text"',
		);
	});

	it("prints a select option's reason outside its text", () => {
		const markup = html(
			<SelectPrimitive.Root open value="a">
				<SelectPrimitive.Trigger />
				<SelectPrimitive.Content position="popper">
					<SelectPrimitive.Viewport>
						<SelectItem value="b" disabledReason="Already on the roster">
							Atlas
						</SelectItem>
					</SelectPrimitive.Viewport>
				</SelectPrimitive.Content>
			</SelectPrimitive.Root>,
		);
		// Radix renders an open select's content only in the browser; when it
		// does render here, the reason must be there and outside the item text.
		if (markup.includes('data-slot="select-item"')) {
			expect(markup).toContain(">Already on the roster<");
		}
		expect(source("select.tsx")).toMatch(
			/<\/SelectPrimitive\.ItemText>\s*\{disabledReason === undefined/,
		);
	});
});

describe("(7) an unavailable command row wraps its reason (v3 .cmdk-row.is-unavailable)", () => {
	const markup = html(
		<Command>
			<Command.List>
				<CommandItem value="New mission" reason="Not yet.">
					New mission
				</CommandItem>
			</Command.List>
		</Command>,
	);

	it("disables the row and grows it to hold the reason", () => {
		const row = slot(markup, "command-item");
		expect(row).toContain('data-disabled="true"');
		expect(row).toContain(
			"data-[disabled=true]:h-auto data-[disabled=true]:min-h-9 data-[disabled=true]:flex-wrap",
		);
	});

	it("puts the reason at the end, and on its own line on a phone", () => {
		expect(slot(markup, "command-reason")).toContain(
			"ml-auto type-caption text-text-muted max-[560px]:ml-[25px] max-[560px]:basis-full",
		);
	});
});

describe("(8) tables (Polish 2)", () => {
	const table = (sticky?: boolean) =>
		html(
			<Table stickyHeader={sticky}>
				<TableHeader>
					<TableRow>
						<TableHead>Spend</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					<TableRow>
						<TableCell>4.10</TableCell>
					</TableRow>
				</TableBody>
			</Table>,
		);

	it("sets numbers in tabular figures", () => {
		expect(slot(table(), "table")).toContain("tabular-nums");
	});

	it("holds the header band when asked, and only then", () => {
		const head = slot(table(true), "table-head");
		expect(head).toContain(
			"group-data-[sticky-header]/table:sticky group-data-[sticky-header]/table:top-0",
		);
		expect(slot(table(true), "table")).toContain('data-sticky-header="true"');
		expect(slot(table(), "table")).not.toContain("data-sticky-header");
		expect(head).toContain("bg-app-band");
	});
});

describe("(9) breadcrumbs (v3 UX 7 .crumbs)", () => {
	const markup = html(
		<Breadcrumb>
			<BreadcrumbList>
				<BreadcrumbItem>
					<BreadcrumbLink href="/missions">Missions</BreadcrumbLink>
				</BreadcrumbItem>
			</BreadcrumbList>
		</Breadcrumb>,
	);

	it("keep one line, and show only the last crumb on a phone", () => {
		expect(slot(markup, "breadcrumb-list")).toContain(
			"whitespace-nowrap text-text-subtle max-sm:[&>li:not(:last-child)]:hidden",
		);
	});

	it("ellipsise a long crumb, in a 24px target (UX 1)", () => {
		expect(slot(markup, "breadcrumb-link")).toContain(
			"inline-block max-w-full min-w-0 truncate py-1",
		);
	});
});

describe("(U1) small controls take a 24px hit (v3 UX 1)", () => {
	it("grows the checkbox and radio past their 16px boxes and 1px edges", () => {
		expect(slot(html(<Checkbox />), "checkbox")).toContain(
			"relative grid size-4 shrink-0 place-content-center after:absolute after:-inset-[5px]",
		);
		expect(
			slot(
				html(
					<RadioGroup>
						<RadioGroupItem value="a" />
					</RadioGroup>,
				),
				"radio-group-item",
			),
		).toContain("after:absolute after:-inset-[5px]");
	});

	it("grows the switch from 18px to 24 (and the small one from 14)", () => {
		const root = slot(html(<Switch />), "switch");
		expect(root).toContain("relative inline-flex");
		expect(root).toContain(
			"after:absolute after:inset-x-0 after:-inset-y-1 data-[size=sm]:after:-inset-x-px data-[size=sm]:after:-inset-y-1.5",
		);
	});
});

describe("(U2) a phone dialog is a bottom sheet (v3 UX 7)", () => {
	const markup = html(
		<Dialog open>
			<DialogContent>
				<DialogTitle>Close engagement</DialogTitle>
				<DialogFooter>
					<a href="#x" data-variant="link">
						What closing does
					</a>
				</DialogFooter>
			</DialogContent>
		</Dialog>,
	);

	it("pins to the bottom with top corners only, and scrolls under its footer", () => {
		const dialog = source("dialog.tsx");
		expect(dialog).toContain(
			"max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-h-[92dvh]",
		);
		expect(dialog).toContain("max-sm:rounded-b-none");
		expect(dialog).toContain("sticky bottom-0");
	});

	it("puts a link on its own first row; the buttons share the next at 38px", () => {
		const dialog = source("dialog.tsx");
		expect(dialog).toContain(
			"max-sm:*:data-[variant=link]:order-first max-sm:*:data-[variant=link]:basis-full",
		);
		expect(dialog).toContain("max-sm:*:data-[slot=button]:h-control-lg");
		// Portalled: the server renders nothing for it, so no stray markup.
		expect(markup).not.toContain("What closing does");
	});
});
