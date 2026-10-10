import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	DriveBrowser,
	type DriveState,
	kindCounts,
	recentFiles,
	visibleFiles,
} from "@/components/avel/drive-browser";
import {
	DRIVE_WRITE_REASON,
	PURGED_REASON,
} from "@/components/avel/drive-files";
import {
	AccessTab,
	DetailsTab,
	FilePanelBody,
	HistoryTab,
	PROMOTE_REASON,
	PURGED_PROMOTE_REASON,
} from "@/components/avel/drive-panel";
import {
	DRIVE_MISSING,
	FILE_KINDS,
	folderOf,
	folderPath,
	folderValue,
	inFolder,
	kindOf,
	SAMPLE_CLIENTS,
	SAMPLE_FILES,
	type SampleFile,
	sampleAccess,
	sampleFile,
	sampleFilesForClient,
	sampleHistory,
	sampleNotesForClient,
	samplePreview,
	scopePath,
	sizeLabel,
} from "@/components/avel/drive-placeholders";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api";
import { driveSearch, Route } from "../src/routes/drive";
import { renderPage, tagOf } from "./render-page";

// ---------------------------------------------------------------------------
// Markup helpers. The node environment has no DOM; tests read the markup.

function elementAt(html: string, start: number): string {
	const tag = /^<([a-z0-9]+)/.exec(html.slice(start))?.[1] ?? "";
	const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
	re.lastIndex = start;
	let depth = 0;
	for (let m = re.exec(html); m; m = re.exec(html)) {
		depth += m[0].startsWith("</") ? -1 : 1;
		if (depth === 0) return html.slice(start, re.lastIndex);
	}
	throw new Error(`unclosed element at ${start}`);
}

function element(html: string, testid: string): string {
	const at = html.indexOf(`data-testid="${testid}"`);
	expect(at, testid).toBeGreaterThan(-1);
	return elementAt(html, html.lastIndexOf("<", at));
}

const fromAttr = (v: string) =>
	v.replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
const text = (html: string) => fromAttr(html.replace(/<[^>]+>/g, ""));

type Region = { missing: string; start: number; end: number; html: string };

function regions(html: string): Region[] {
	return [...html.matchAll(/<[a-z0-9]+[^>]*data-sample-region="([^"]+)"/g)].map(
		(m) => {
			const start = m.index ?? 0;
			const body = elementAt(html, start);
			return {
				missing: fromAttr(m[1] ?? ""),
				start,
				end: start + body.length,
				html: body,
			};
		},
	);
}

function pills(html: string): { at: number; missing: string }[] {
	return [
		...html.matchAll(
			/<button[^>]*data-testid="sample-data"[^>]*data-missing="([^"]+)"/g,
		),
	].map((m) => ({ at: m.index ?? 0, missing: fromAttr(m[1] ?? "") }));
}

const ROUTES = new Set<string>(Object.values(DRIVE_MISSING));

/** Every region opens with its own pill; no pill strays; real things sit outside. */
function expectLabelled(html: string, real: string[]) {
	const rs = regions(html);
	expect(rs.length).toBeGreaterThan(0);
	for (const region of rs) {
		expect(ROUTES.has(region.missing), region.missing).toBe(true);
		const body = region.html.slice(region.html.indexOf(">") + 1);
		expect(body.match(/data-testid="([^"]+)"/)?.[1]).toBe("sample-data");
		expect(pills(region.html)[0]?.missing).toBe(region.missing);
	}
	for (const pill of pills(html)) {
		expect(
			rs.some((r) => pill.at > r.start && pill.at < r.end),
			pill.missing,
		).toBe(true);
	}
	for (const testid of real) {
		const at = html.indexOf(`data-testid="${testid}"`);
		expect(at, testid).toBeGreaterThan(-1);
		expect(
			rs.some((r) => at > r.start && at < r.end),
			`${testid} is real`,
		).toBe(false);
	}
}

/** A real control: disabled, with its reason linked for screen readers. */
function expectDisabledWithReason(
	html: string,
	testid: string,
	reason: string,
) {
	const tag = tagOf(html, testid);
	expect(tag).toMatch(/\sdisabled=""/);
	const id = tag.match(/aria-describedby="([^"]+)"/)?.[1];
	expect(id, testid).toBeDefined();
	expect(fromAttr(html)).toContain(`id="${id}"`);
	const at = html.indexOf(`id="${id}"`);
	expect(text(elementAt(html, html.lastIndexOf("<", at)))).toBe(reason);
}

const tip = (node: ReactNode) =>
	renderToString(<TooltipProvider>{node}</TooltipProvider>);

/**
 * The Drive as the route renders it, without the app shell: DriveBrowser over
 * the samples with this state. Cached per state, so tests that read the same
 * view share one render. The route's own wiring is tested once, below.
 */
const browsed = new Map<string, string>();
function browse(state: Partial<DriveState> = {}): string {
	const key = JSON.stringify(state);
	let html = browsed.get(key);
	if (html === undefined) {
		html = tip(
			<DriveBrowser
				query={{ status: "success", data: SAMPLE_FILES }}
				state={{ sort: "newest", view: "list", ...state }}
				onChange={() => {}}
			/>,
		);
		browsed.set(key, html);
	}
	return html;
}

const held = (f: SampleFile) => f.purgedAt === null;
const acme = SAMPLE_CLIENTS[0];
const booking = acme?.engagements[0];
if (!acme || !booking)
	throw new Error("samples need Acme and its first engagement");
const maybeMd = SAMPLE_FILES.find((f) => kindOf(f.mime) === "note" && held(f));
const maybePdf = SAMPLE_FILES.find(
	(f) => f.mime === "application/pdf" && held(f) && f.scope !== "general",
);
const maybeTomb = SAMPLE_FILES.find((f) => !held(f));
const maybeGeneral = SAMPLE_FILES.find((f) => f.scope === "general" && held(f));
// Checked by a named test below, so a sample change fails a test, not the load.
const md = maybeMd as SampleFile;
const pdf = maybePdf as SampleFile;
const tomb = maybeTomb as SampleFile;
const general = maybeGeneral as SampleFile;

// ---------------------------------------------------------------------------

describe("Drive samples", () => {
	it("hold a note, a pdf, a tombstone and a general file for these tests", () => {
		expect(maybeMd, "a note still held").toBeDefined();
		expect(maybePdf, "a client pdf still held").toBeDefined();
		expect(maybeTomb, "a tombstone").toBeDefined();
		expect(maybeGeneral, "a general file still held").toBeDefined();
	});

	it("are the same on every visit, and every id is its own", () => {
		expect(sampleFilesForClient("x")).toEqual(sampleFilesForClient("x"));
		expect(sampleNotesForClient("x")).toEqual(sampleNotesForClient("x"));
		const ids = SAMPLE_FILES.map((f) => f.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("follow the File scope rules", () => {
		for (const f of SAMPLE_FILES) {
			if (f.scope === "general") {
				expect(f.clientId).toBeNull();
				expect(f.engagementId).toBeNull();
			}
			if (f.scope === "client") {
				expect(f.clientId).not.toBeNull();
				expect(f.engagementId).toBeNull();
			}
			if (f.scope === "engagement") {
				// An engagement file names its client, and the client owns it.
				const client = SAMPLE_CLIENTS.find((c) => c.id === f.clientId);
				expect(client?.engagements.some((e) => e.id === f.engagementId)).toBe(
					true,
				);
			}
		}
		expect(new Set(SAMPLE_FILES.map((f) => f.scope))).toEqual(
			new Set(["general", "client", "engagement"]),
		);
	});

	it("carry no storage key, and a server-shaped hash", () => {
		for (const f of SAMPLE_FILES) {
			expect(Object.keys(f)).not.toContain("storageKey");
			expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
		}
	});

	it("include tombstones, purged after they were uploaded", () => {
		const tombs = SAMPLE_FILES.filter((f) => !held(f));
		expect(tombs.length).toBeGreaterThan(0);
		for (const f of tombs)
			expect(f.purgedAt && f.purgedAt > f.createdAt).toBe(true);
	});

	it("keep notes off a client's Files tab and on its Notes tab", () => {
		const { files, engagements } = sampleFilesForClient("client-x");
		expect(files.some((f) => kindOf(f.mime) === "note")).toBe(false);
		expect(
			files.some(
				(f) =>
					f.scope === "engagement" && f.engagementId === engagements[0]?.id,
			),
		).toBe(true);
		for (const n of sampleNotesForClient("client-x"))
			expect(kindOf(n.mime)).toBe("note");
		expect(sampleFilesForClient("client-x").files).not.toEqual(
			sampleFilesForClient("client-y").files,
		);
	});

	it("give firm agents read, and mission agents read only by brief", () => {
		const rows = sampleAccess(pdf);
		expect(rows.filter((r) => r.kind === "firm").map((r) => r.who)).toEqual([
			"Canon",
			"Trace",
			"Uno",
		]);
		expect(rows.filter((r) => r.kind === "firm").every((r) => r.reads)).toBe(
			true,
		);
		const other = rows.at(-1);
		expect(other).toMatchObject({
			who: "Any other mission agent",
			reads: false,
		});
		for (const r of rows.filter((r) => r.kind === "mission" && r.reads)) {
			expect(r.why).toMatch(/^Listed in \w+'s brief for mission \d{3}\.$/);
		}
	});

	it("end a tombstone's history with its deletion, and start every history with the upload", () => {
		for (const f of SAMPLE_FILES) {
			const events = sampleHistory(f);
			expect(events[0]?.what).toBe("uploaded");
			expect(events.at(-1)?.what === "deleted").toBe(!held(f));
		}
	});

	it("preview md and json only", () => {
		expect(samplePreview(md)).toMatch(/^# /);
		expect(samplePreview(pdf)).toBeNull();
	});
});

describe("folders", () => {
	it("round-trip through the URL, and fall back to every file", () => {
		for (const value of [
			"general",
			`client:${acme.id}`,
			`engagement:${booking.id}`,
		]) {
			expect(folderValue(folderOf(value))).toBe(value);
		}
		expect(folderOf("client:nope")).toEqual({ kind: "all" });
		expect(folderOf(undefined)).toEqual({ kind: "all" });
	});

	it("hold a client's engagement files inside the client's folder", () => {
		const client = folderOf(`client:${acme.id}`);
		const engagement = folderOf(`engagement:${booking.id}`);
		const inEngagement = SAMPLE_FILES.filter((f) => inFolder(f, engagement));
		expect(inEngagement.length).toBeGreaterThan(0);
		for (const f of inEngagement) expect(inFolder(f, client)).toBe(true);
		expect(
			SAMPLE_FILES.filter((f) => inFolder(f, folderOf("general"))).every(
				(f) => f.scope === "general",
			),
		).toBe(true);
	});

	it("name the path from the Drive down, and a file's scope in words", () => {
		expect(folderPath(folderOf(`engagement:${booking.id}`))).toEqual([
			"Drive",
			"Clients",
			acme.name,
			booking.name,
		]);
		expect(scopePath(general)).toBe("General");
		const engaged = SAMPLE_FILES.find((f) => f.engagementId === booking.id);
		expect(engaged && scopePath(engaged)).toBe(`${acme.name}, ${booking.name}`);
	});
});

describe("search, kind and sort", () => {
	const all = folderOf(undefined);

	it("search by name, filter by kind, and sort three ways", () => {
		const q = visibleFiles(SAMPLE_FILES, all, { q: "BRAND", sort: "newest" });
		expect(q.length).toBeGreaterThan(0);
		expect(q.every((f) => f.name.toLowerCase().includes("brand"))).toBe(true);
		const images = visibleFiles(SAMPLE_FILES, all, {
			kind: "image",
			sort: "newest",
		});
		expect(images.every((f) => kindOf(f.mime) === "image")).toBe(true);
		const byName = visibleFiles(SAMPLE_FILES, all, { sort: "name" }).map(
			(f) => f.name,
		);
		expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b)));
		const bySize = visibleFiles(SAMPLE_FILES, all, { sort: "size" });
		const sizes = bySize.map((f) => (held(f) ? f.bytes : 0));
		expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
		const newest = visibleFiles(SAMPLE_FILES, all, { sort: "newest" }).map(
			(f) => f.createdAt,
		);
		expect(newest).toEqual([...newest].sort().reverse());
	});

	it("show the four newest files still held as Recent", () => {
		const recent = recentFiles(SAMPLE_FILES, all);
		expect(recent).toHaveLength(4);
		expect(recent.every(held)).toBe(true);
		expect(recent).toEqual(
			visibleFiles(SAMPLE_FILES, all, { sort: "newest" })
				.filter(held)
				.slice(0, 4),
		);
	});

	it("count each kind before the kind chip narrows it", () => {
		const counts = kindCounts(SAMPLE_FILES, all, undefined);
		expect(counts.all).toBe(SAMPLE_FILES.length);
		expect(FILE_KINDS.reduce((n, k) => n + counts[k], 0)).toBe(
			SAMPLE_FILES.length,
		);
	});
});

describe("/drive", () => {
	it("is a construction route, and drops anything the URL shouldn't hold", () => {
		expect(Route.options.staticData?.device).toBe("construction");
		expect(
			driveSearch.parse({
				view: "tiles",
				kind: "video",
				sort: "random",
				q: "a",
			}),
		).toEqual({
			view: undefined,
			kind: undefined,
			sort: undefined,
			q: "a",
			folder: undefined,
			file: undefined,
		});
	});

	it("labels every sample region and leaves the controls real", async () => {
		// The real page, so the top bar's Upload is in it; a small folder keeps it quick.
		const html = await renderPage(`/drive?folder=engagement:${booking.id}`);
		expectLabelled(html, ["drive-upload", "drive-toolbar", "drive-drop"]);
		expect(new Set(regions(html).map((r) => r.missing))).toEqual(
			new Set([DRIVE_MISSING.folders, DRIVE_MISSING.files]),
		);
		expectDisabledWithReason(html, "drive-upload", DRIVE_WRITE_REASON);
		expectDisabledWithReason(html, "drive-drop-upload", DRIVE_WRITE_REASON);
		expect(tagOf(html, "drive-drop")).toContain('aria-disabled="true"');
	});

	it("rails every folder with its count: General, then each client and its engagements", async () => {
		const html = browse({ folder: `client:${acme.id}` });
		const rail = element(html, "drive-rail");
		for (const [value, folder] of [
			["all", folderOf(undefined)],
			["general", folderOf("general")],
			[`client:${acme.id}`, folderOf(`client:${acme.id}`)],
			[`engagement:${booking.id}`, folderOf(`engagement:${booking.id}`)],
		] as const) {
			expect(text(element(rail, `drive-folder-count-${value}`))).toBe(
				String(SAMPLE_FILES.filter((f) => inFolder(f, folder)).length),
			);
		}
		expect(tagOf(rail, `drive-folder-client:${acme.id}`)).toContain(
			'aria-current="true"',
		);
		expect(tagOf(rail, "drive-folder-all")).not.toContain("aria-current");
		// The client list sits under a "Clients" heading.
		expect(text(rail)).toMatch(/General\d+Clients/);
	});

	it("crumbs the folder path, and lists only that folder's files", async () => {
		const html = browse({ folder: `engagement:${booking.id}` });
		expect(text(element(html, "drive-crumbs"))).toBe(
			`Drive/Clients/${acme.name}/${booking.name}`,
		);
		const expected = SAMPLE_FILES.filter((f) => f.engagementId === booking.id);
		const rows = [
			...element(html, "drive-file-list").matchAll(
				/data-testid="drive-file-list-row-([^"]+)"/g,
			),
		].map((m) => m[1]);
		expect(rows.sort()).toEqual(expected.map((f) => f.id).sort());
	});

	it("shows no storage meter: the Drive has a per-upload cap, not a quota", async () => {
		// A Drive-wide quota, if one is ever decided, comes from avel-server
		// with a real number. Until then no used-of-cap figure is shown.
		const html = browse();
		expect(html).not.toMatch(/<meter\b|role="meter"|role="progressbar"/);
		expect(html).not.toMatch(/data-testid="drive-storage/);
		expect(text(html)).not.toMatch(/\bof \d+(\.\d+)? [KMGT]B\b/);
	});

	it("puts search, kind chips with counts, sort and the view toggle in the toolbar", async () => {
		const html = browse();
		expect(tagOf(html, "drive-toolbar-search")).toMatch(
			/^<input[^>]*type="search"/,
		);
		const counts = kindCounts(SAMPLE_FILES, folderOf(undefined), undefined);
		expect(text(element(html, "drive-toolbar-kind-all-count"))).toBe(
			String(counts.all),
		);
		expect(text(element(html, "drive-toolbar-kind-image-count"))).toBe(
			String(counts.image),
		);
		expect(tagOf(html, "drive-toolbar-view-list")).toContain(
			'aria-pressed="true"',
		);
		expect(html).toMatch(/data-testid="drive-toolbar-sort"[\s\S]*?>Newest</);
	});

	it("lays Recent out as two or four columns by its own width, never three", async () => {
		const html = browse();
		const grid =
			tagOf(html, "drive-recent")
				.match(/class="([^"]*)"/)?.[1]
				?.split(/\s+/) ?? [];
		expect(grid).toContain("grid-cols-2");
		expect(grid).toContain("@3xl:grid-cols-4");
		expect(grid.some((c) => /grid-cols-3|auto-fill|auto-fit/.test(c))).toBe(
			false,
		);
		// Measured on the column, not the window: the section is the container.
		expect(html).toMatch(/<section aria-label="Recent" class="[^"]*@container/);
	});

	it("shows the four most recent files as cards, and hides them while searching", async () => {
		const html = browse();
		const recent = recentFiles(SAMPLE_FILES, folderOf(undefined));
		const cards = [
			...element(html, "drive-recent").matchAll(
				/data-testid="drive-recent-([^"]+)"/g,
			),
		].map((m) => m[1]);
		expect(cards).toEqual(recent.map((f) => f.id));
		expect(browse({ q: "brand" })).not.toContain('data-testid="drive-recent"');
	});

	it("lists each file: tile, name over its scope, uploader, size, date, short hash", async () => {
		const html = browse();
		const row = element(html, `drive-file-list-row-${pdf.id}`);
		expect(row).toContain('data-testid="drive-file-tile"');
		expect(text(row)).toContain(pdf.name);
		expect(text(row)).toContain(scopePath(pdf));
		expect(text(row)).toContain(pdf.uploadedBy);
		expect(text(row)).toContain(sizeLabel(pdf.bytes));
		expect(text(row)).toContain(pdf.createdAt.slice(0, 10));
		expect(row).toContain(`title="${pdf.sha256}"`);
		expect(row).toContain(`>${pdf.sha256.slice(0, 8)}<`);
		expect(row).toContain('tabindex="0"');
	});

	it("marks a tombstone row: struck through, Bytes destroyed, no size", async () => {
		const html = browse();
		const row = element(html, `drive-file-list-row-${tomb.id}`);
		expect(tagOf(row, "drive-file-name")).toMatch(/\bline-through\b/);
		expect(row).toContain('data-testid="drive-file-purged"');
		expect(text(row)).toContain("Bytes destroyed");
		expect(text(row)).not.toContain(sizeLabel(tomb.bytes));
		const live = element(html, `drive-file-list-row-${pdf.id}`);
		expect(tagOf(live, "drive-file-name")).not.toMatch(/line-through/);
	});

	it("shows cards in the grid view, with a placeholder thumbnail for images", async () => {
		const html = browse({ view: "grid" });
		expect(html).not.toContain('data-testid="drive-file-list"');
		const grid = element(html, "drive-file-grid");
		expect(grid.match(/data-testid="drive-card-/g)).toHaveLength(
			SAMPLE_FILES.length,
		);
		const image = SAMPLE_FILES.find((f) => kindOf(f.mime) === "image");
		expect(element(grid, `drive-card-${image?.id}`)).toContain(
			'data-placeholder="true"',
		);
		expect(element(grid, `drive-card-${pdf.id}`)).not.toContain(
			"data-placeholder",
		);
		expect(tagOf(html, "drive-toolbar-view-grid")).toContain(
			'aria-pressed="true"',
		);
	});

	it("says nothing matches, with a way to clear, when the search finds nothing", async () => {
		const html = browse({ q: "zzzzzz" });
		expect(html).toContain('data-testid="drive-no-match"');
		expect(html).toContain('data-testid="drive-clear"');
	});

	it("opens the panel beside the list at 2xl for a known file only", async () => {
		// A five-file folder keeps the render small; the selection is the Drive's, not the folder's.
		const small = `engagement:${booking.id}`;
		const html = browse({ folder: small, file: pdf.id });
		const classes =
			tagOf(html, "drive-panel-aside")
				.match(/class="([^"]*)"/)?.[1]
				?.split(/\s+/) ?? [];
		for (const c of ["hidden", "2xl:flex", "sticky"])
			expect(classes).toContain(c);
		expect(element(html, "drive-panel-aside")).toContain(
			`data-file="${pdf.id}"`,
		);
		expect(browse({ folder: small, file: "nope" })).not.toContain(
			"drive-panel",
		);
	});

	it("reads its view, folder and file from the URL", async () => {
		const html = await renderPage(
			`/drive?folder=engagement:${booking.id}&view=grid&file=${pdf.id}`,
		);
		expect(tagOf(html, "drive-toolbar-view-grid")).toContain(
			'aria-pressed="true"',
		);
		expect(html).toContain('data-testid="drive-file-grid"');
		expect(text(element(html, "drive-crumbs"))).toBe(
			`Drive/Clients/${acme.name}/${booking.name}`,
		);
		expect(element(html, "drive-panel-aside")).toContain(
			`data-file="${pdf.id}"`,
		);
	});

	it("puts no middle dot anywhere on the page (ruling 4)", async () => {
		// Every row, and the panel with a file open.
		expect(element(browse(), "drive")).not.toContain("·");
		expect(
			element(
				browse({ folder: `engagement:${booking.id}`, file: pdf.id }),
				"drive",
			),
		).not.toContain("·");
	});
});

describe("the file panel", () => {
	const body = (file: SampleFile) =>
		tip(<FilePanelBody file={file} onClose={() => {}} />);

	it("previews md and json through the code view, and shows an icon otherwise", () => {
		const note = body(md);
		expect(fromAttr(tagOf(note, "drive-panel-preview"))).toContain(
			`data-sample-region="${DRIVE_MISSING.preview}"`,
		);
		expect(note).toContain('data-testid="drive-panel-preview-code-gutter"');
		const other = body(pdf);
		expect(tagOf(other, "drive-panel-preview")).toContain(
			'data-preview="icon"',
		);
		// A tombstone has no bytes to preview, even a note.
		const purgedNote = { ...md, purgedAt: "2026-10-01T09:00:00.000Z" };
		expect(tagOf(body(purgedNote), "drive-panel-preview")).toContain(
			'data-preview="icon"',
		);
	});

	it("names the file and where it lives", () => {
		const html = body(pdf);
		expect(text(element(html, "drive-panel-name"))).toBe(pdf.name);
		expect(text(element(html, "drive-panel-path"))).toBe(
			`Drive, ${scopePath(pdf)}`,
		);
	});

	it("keeps Download, Delete and Promote real and disabled, each with its reason", () => {
		const live = tip(
			<>
				<FilePanelBody file={pdf} onClose={() => {}} />
				<AccessTab file={pdf} />
			</>,
		);
		expectDisabledWithReason(live, "drive-download", DRIVE_WRITE_REASON);
		expectDisabledWithReason(live, "drive-delete", DRIVE_WRITE_REASON);
		expectDisabledWithReason(live, "drive-promote", PROMOTE_REASON);
		const gone = body(tomb);
		expectDisabledWithReason(gone, "drive-download", PURGED_REASON);
		expect(tagOf(gone, "drive-panel-name")).toMatch(/\bline-through\b/);
		expect(gone).toContain('data-testid="drive-panel-purged"');
	});

	it("has three tabs, Details first", () => {
		const triggers = [
			...body(pdf).matchAll(/data-testid="drive-tab-([a-z]+)"[^>]*>([^<]+)</g),
		].map((m) => m[2]);
		expect(triggers).toEqual(["Details", "Agent access", "History"]);
	});

	it("details: type, size, the hash with Copy, uploader and date, the bytes' state", () => {
		const html = tip(<DetailsTab file={pdf} />);
		expect(text(html)).toContain("application/pdf");
		expect(text(html)).toContain(sizeLabel(pdf.bytes));
		expect(tagOf(html, "drive-details-sha")).toBeDefined();
		expect(tagOf(html, "drive-details-sha-copy")).toContain(
			'aria-label="Copy the SHA-256"',
		);
		expect(text(element(html, "drive-details-state"))).toBe("Held");
		expect(
			text(element(tip(<DetailsTab file={tomb} />), "drive-details-state")),
		).toBe(`Destroyed ${tomb.purgedAt?.slice(0, 10)}. The record stays.`);
	});

	it("agent access on a tombstone: no one can read it, and nothing to promote", () => {
		expect(sampleAccess(tomb)).toEqual([]);
		const html = tip(<AccessTab file={tomb} />);
		expect(text(element(html, "drive-access-none"))).toBe(
			`No one can read this file: its bytes were destroyed on ${tomb.purgedAt?.slice(0, 10)}. The record stays for the audit trail.`,
		);
		expect(html).not.toContain('data-testid="drive-access-row"');
		expect(html).not.toContain("drive-access-one-way");
		expectDisabledWithReason(html, "drive-promote", PURGED_PROMOTE_REASON);
		// A file still held keeps its readers.
		expect(tip(<AccessTab file={pdf} />)).not.toContain("drive-access-none");
	});

	it("agent access: who reads and why, and the one-way door on client files only", () => {
		const html = tip(<AccessTab file={pdf} />);
		const rows = [
			...html.matchAll(
				/data-testid="drive-access-row" data-reads="(true|false)"/g,
			),
		].map((m) => m[1]);
		expect(rows).toEqual(sampleAccess(pdf).map((r) => String(r.reads)));
		expect(html).toContain('data-testid="drive-access-one-way"');
		expect(tip(<AccessTab file={general} />)).not.toContain(
			"drive-access-one-way",
		);
		expect(text(element(html, "drive-promote-steps"))).toBe(
			"Draft→Review→Approve→Pinned by hash",
		);
	});

	it("history: every event in order, the deletion last on a tombstone", () => {
		const html = tip(<HistoryTab file={tomb} />);
		const whats = [
			...html.matchAll(
				/data-testid="drive-history-event" data-what="([a-z]+)"/g,
			),
		].map((m) => m[1]);
		expect(whats).toEqual(sampleHistory(tomb).map((e) => e.what));
		expect(whats.at(-1)).toBe("deleted");
	});

	it("labels its sample regions and never offers a field", () => {
		const html = tip(
			<>
				<FilePanelBody file={md} onClose={() => {}} />
				<AccessTab file={md} />
				<HistoryTab file={md} />
			</>,
		);
		expectLabelled(html, ["drive-download", "drive-delete", "drive-promote"]);
		expect(html).not.toMatch(/<(textarea|input|form)\b/);
	});
});

describe("every state of the Drive, inside its region", () => {
	const failed = {
		status: "error" as const,
		error: new ApiError({
			method: "GET",
			path: "/api/files",
			kind: "contract",
			status: 500,
			code: "INTERNAL",
			message: "m",
			requestId: "req_drive",
		} as ConstructorParameters<typeof ApiError>[0]),
		refetch: () => undefined,
		isFetching: false,
	};
	const state = { sort: "newest" as const, view: "list" as const };

	it("loading, empty and error, each labelled", () => {
		const loading = tip(
			<DriveBrowser
				query={{ status: "pending" }}
				state={state}
				onChange={() => {}}
			/>,
		);
		expect(tagOf(loading, "drive-surface")).toContain('data-state="loading"');
		expect(loading).toContain('data-testid="drive-skeleton"');
		const empty = tip(
			<DriveBrowser
				query={{ status: "success", data: [] }}
				state={state}
				onChange={() => {}}
			/>,
		);
		expect(tagOf(empty, "drive-surface")).toContain('data-state="empty"');
		expect(empty).toContain('data-testid="drive-empty-drop"');
		expect(
			empty.match(/data-testid="empty-state-description"[^>]*>([^<]+)</)?.[1],
		).not.toMatch(/contract|avel-server|not built|yet\b|route/i);
		const error = tip(
			<DriveBrowser query={failed} state={state} onChange={() => {}} />,
		);
		expect(tagOf(error, "drive-surface")).toContain('data-state="error"');
		expect(error).toContain('data-testid="surface-error"');
		for (const html of [loading, empty, error]) expectLabelled(html, []);
	});

	it("finds a file by id only among the Drive's own", () => {
		expect(sampleFile(pdf.id)).toEqual(pdf);
		expect(sampleFile("nope")).toBeUndefined();
	});
});
