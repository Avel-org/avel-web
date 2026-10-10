/**
 * Sample data for the Drive (AVEL-DESIGN.md ruling 33): /drive and a
 * client's Notes and Files tabs. avel-server has no File routes yet; the
 * File entity is specced in DATA-CONTRACTS-V2.md ("File") and built after the
 * first mission. Every type here is local, shaped as the contract carries it
 * (camelCase, server-detected mime and bytes, a server-computed sha256, a
 * purgedAt tombstone, no storage key on the wire), and every value is
 * invented. Each is replaced by the contract's shape, and deleted, when its
 * route lands. Nothing here is sent anywhere or written into a real field.
 *
 * Values derive from fixed keys and from the scope's id, so a page shows
 * the same files on every visit: one that reshuffled would look live.
 */

/** The source each kind of sample stands in for, named in its pill. */
export const DRIVE_MISSING = {
	files: "GET /api/files",
	folders: "the Drive's scopes (GET /api/files)",
	access: "the Drive's read rules for agents",
	history: "a file's history",
	notes: "GET /api/files (notes)",
	preview: "a file's text preview",
} as const;

export type DriveMissing = (typeof DRIVE_MISSING)[keyof typeof DRIVE_MISSING];

export type FileScope = "general" | "client" | "engagement";

/** One stored file, as the Drive will list it. */
export type SampleFile = {
	id: string;
	scope: FileScope;
	/** Set for client and engagement files; null for general ones. */
	clientId: string | null;
	/** Set exactly for engagement files. */
	engagementId: string | null;
	name: string;
	/** Detected by the server from the bytes, never taken from the upload. */
	mime: string;
	bytes: number;
	/** Computed by the server over the bytes. */
	sha256: string;
	/** Who uploaded it: a GitHub login. */
	uploadedBy: string;
	/** Set once the bytes are destroyed; the row stays as a tombstone. */
	purgedAt: string | null;
	createdAt: string;
};

/** A note: a markdown file in the same store, shown as a card. */
export type SampleNote = SampleFile & { title: string; excerpt: string };

// ---------------------------------------------------------------------------
// Determinism.

/** FNV-1a over the key: a stable, well-spread seed. */
function seedOf(key: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < key.length; i++) {
		hash ^= key.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/** A deterministic sequence of numbers in [0, 1) from the key. */
function sequence(key: string): () => number {
	let state = seedOf(key) || 1;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 0x1_0000_0000;
	};
}

const HEX = "0123456789abcdef";
const hexOf = (next: () => number, length: number) =>
	Array.from({ length }, () => HEX[Math.floor(next() * 16)]).join("");

/** A v4-shaped uuid from the key, so ids pass a uuid() check. */
export function driveUuid(key: string): string {
	const h = hexOf(sequence(`uuid:${key}`), 32);
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** An ISO datetime between Jan 2025 and Oct 2026, from the sequence. */
function dateOf(next: () => number): string {
	const start = Date.UTC(2025, 0, 6);
	const span = Date.UTC(2026, 9, 5) - start;
	const day = Math.floor((next() * span) / 86_400_000);
	const minute = Math.floor(next() * 600);
	return new Date(
		start + day * 86_400_000 + (8 * 60 + minute) * 60_000,
	).toISOString();
}

// ---------------------------------------------------------------------------
// The scopes: general, then each client with its engagements.

export type SampleEngagement = { id: string; name: string };
export type SampleClient = {
	id: string;
	name: string;
	engagements: SampleEngagement[];
};

const CLIENT_SEEDS: [string, string[]][] = [
	["Acme Dental", ["Booking app", "Payments"]],
	["Harbor Clinic", ["Patient portal"]],
	["Meridian Hotels", ["Rebrand", "Loyalty API"]],
	["Northwind Freight", []],
];

export const SAMPLE_CLIENTS: readonly SampleClient[] = CLIENT_SEEDS.map(
	([name, engagements]) => ({
		id: driveUuid(`client:${name}`),
		name,
		engagements: engagements.map((e) => ({
			id: driveUuid(`engagement:${name}:${e}`),
			name: e,
		})),
	}),
);

// ---------------------------------------------------------------------------
// Files.

type Seed = [name: string, mime: string, bytes: number];

const PDF = "application/pdf";
const MD = "text/markdown";
const JSON_MIME = "application/json";
const PNG = "image/png";
const JPG = "image/jpeg";
const ZIP = "application/zip";
const XLSX =
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX =
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const CSV = "text/csv";

const GENERAL: Seed[] = [
	["Engagement playbook.md", MD, 22_400],
	["Delivery checklist.md", MD, 7_800],
	["Statement of work template.docx", DOCX, 96_000],
	["Brand kit.zip", ZIP, 41_000_000],
	["Code review rubric.pdf", PDF, 210_000],
	["Pricing model 2026.xlsx", XLSX, 120_000],
	["Golden fixture spec.md", MD, 18_000],
	["Security baseline.pdf", PDF, 640_000],
	["Architecture patterns.pdf", PDF, 2_700_000],
	["Client intake form.docx", DOCX, 54_000],
	["Rate card.csv", CSV, 3_100],
	["Office photos.zip", ZIP, 88_000_000],
];

const CLIENT: Seed[] = [
	["Statement of work.pdf", PDF, 412_000],
	["Master services agreement.pdf", PDF, 520_000],
	["Brand guidelines v2.6.pdf", PDF, 6_800_000],
	["Logo pack.zip", ZIP, 12_400_000],
	["Kickoff call notes.md", MD, 9_400],
	["Pricing tiers.xlsx", XLSX, 88_000],
	["Stakeholder map.png", PNG, 980_000],
	["Invoice history.csv", CSV, 14_000],
];

const ENGAGEMENT: Seed[] = [
	["API integration schema.json", JSON_MIME, 31_000],
	["Data model sketch.png", PNG, 1_240_000],
	["Booking flow wireframes.pdf", PDF, 3_300_000],
	["Architecture topology.png", PNG, 2_100_000],
	["Security checklist.xlsx", XLSX, 64_000],
	["Release checklist.md", MD, 4_100],
	["Acceptance criteria.md", MD, 11_200],
	["Staff schedule export.csv", CSV, 52_000],
	["Site photos.jpg", JPG, 4_600_000],
	["Test fixtures.zip", ZIP, 7_700_000],
];

const PEOPLE = ["javaris500", "javaris500", "mara-ops", "front-desk-lead"];

/** A pick of `count` seeds, without repeats, in a fixed order. */
function pick(pool: Seed[], next: () => number, count: number): Seed[] {
	const order = pool
		.map((seed) => ({ seed, at: next() }))
		.sort((a, b) => a.at - b.at)
		.map((x) => x.seed);
	return order.slice(0, Math.min(count, pool.length));
}

function filesOf(
	key: string,
	pool: Seed[],
	count: number,
	scope: FileScope,
	clientId: string | null,
	engagementId: string | null,
): SampleFile[] {
	const next = sequence(`files:${key}`);
	return pick(pool, next, count).map(([name, mime, bytes]) => {
		const createdAt = dateOf(next);
		// About one file in eight is a tombstone: bytes destroyed, row kept.
		const purged = next() < 0.13;
		return {
			id: driveUuid(`file:${key}:${name}`),
			scope,
			clientId,
			engagementId,
			name,
			mime,
			bytes: Math.round(bytes * (0.75 + next() * 0.5)),
			sha256: hexOf(next, 64),
			uploadedBy: PEOPLE[Math.floor(next() * PEOPLE.length)] ?? "javaris500",
			purgedAt: purged
				? new Date(Date.parse(createdAt) + 9 * 86_400_000).toISOString()
				: null,
			createdAt,
		};
	});
}

/** Newest first; ties by name, so the order never wobbles. */
export function newestFirst<T extends { createdAt: string; name: string }>(
	files: readonly T[],
): T[] {
	return [...files].sort(
		(a, b) =>
			b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name),
	);
}

/** A client's own files and its engagements' files. */
export function sampleClientDrive(
	client: Pick<SampleClient, "id" | "engagements">,
): SampleFile[] {
	const own = filesOf(
		`client:${client.id}`,
		CLIENT,
		6,
		"client",
		client.id,
		null,
	);
	const engaged = client.engagements.flatMap((e) =>
		filesOf(`engagement:${e.id}`, ENGAGEMENT, 5, "engagement", client.id, e.id),
	);
	return newestFirst([...own, ...engaged]);
}

/** Every sample file in the Drive, across scopes, newest first. */
export const SAMPLE_FILES: readonly SampleFile[] = newestFirst([
	...filesOf("general", GENERAL, 12, "general", null, null),
	...SAMPLE_CLIENTS.flatMap(sampleClientDrive),
]);

export function sampleFile(id: string | undefined): SampleFile | undefined {
	return id ? SAMPLE_FILES.find((f) => f.id === id) : undefined;
}

/**
 * A real client's files, for its Files tab: its own files and, from one
 * sample engagement named for it, engagement files tagged with that name.
 * The client is real; the files are samples keyed on its id.
 */
export function sampleFilesForClient(clientId: string): {
	files: SampleFile[];
	engagements: SampleEngagement[];
} {
	const engagements = [
		{ id: driveUuid(`engagement:${clientId}:a`), name: "Current engagement" },
	];
	return {
		files: sampleClientDrive({ id: clientId, engagements }).filter(
			(f) => f.mime !== MD,
		),
		engagements,
	};
}

// ---------------------------------------------------------------------------
// Folders: where a file lives, as the rail and the breadcrumb show it.

/** A folder, as a URL value: all, general, or a client or engagement id. */
export type DriveFolder =
	| { kind: "all" }
	| { kind: "general" }
	| { kind: "client"; client: SampleClient }
	| { kind: "engagement"; client: SampleClient; engagement: SampleEngagement };

/** "all", "general", "client:<id>" or "engagement:<id>" to a folder. */
export function folderOf(value: string | undefined): DriveFolder {
	if (value === "general") return { kind: "general" };
	const [kind, id] = (value ?? "").split(":");
	for (const client of SAMPLE_CLIENTS) {
		if (kind === "client" && client.id === id)
			return { kind: "client", client };
		const engagement = client.engagements.find((e) => e.id === id);
		if (kind === "engagement" && engagement) {
			return { kind: "engagement", client, engagement };
		}
	}
	return { kind: "all" };
}

export function folderValue(folder: DriveFolder): string | undefined {
	switch (folder.kind) {
		case "all":
			return undefined;
		case "general":
			return "general";
		case "client":
			return `client:${folder.client.id}`;
		case "engagement":
			return `engagement:${folder.engagement.id}`;
	}
}

/** Whether a file sits in a folder; a client folder holds its engagements'. */
export function inFolder(file: SampleFile, folder: DriveFolder): boolean {
	switch (folder.kind) {
		case "all":
			return true;
		case "general":
			return file.scope === "general";
		case "client":
			return file.clientId === folder.client.id;
		case "engagement":
			return file.engagementId === folder.engagement.id;
	}
}

/** The folder path, from the Drive down: ["Drive", "Clients", "Acme", "Booking app"]. */
export function folderPath(folder: DriveFolder): string[] {
	switch (folder.kind) {
		case "all":
			return ["Drive"];
		case "general":
			return ["Drive", "General"];
		case "client":
			return ["Drive", "Clients", folder.client.name];
		case "engagement":
			return ["Drive", "Clients", folder.client.name, folder.engagement.name];
	}
}

/** Where a file lives, as words: "General", "Acme Dental", "Acme Dental, Booking app". */
export function scopePath(file: SampleFile): string {
	if (file.scope === "general") return "General";
	const client = SAMPLE_CLIENTS.find((c) => c.id === file.clientId);
	const engagement = client?.engagements.find(
		(e) => e.id === file.engagementId,
	);
	if (!client) return file.scope === "engagement" ? "Engagement" : "Client";
	return engagement ? `${client.name}, ${engagement.name}` : client.name;
}

// ---------------------------------------------------------------------------
// Kinds.

export type FileKind =
	| "document"
	| "spreadsheet"
	| "image"
	| "archive"
	| "note";

export const FILE_KINDS: readonly FileKind[] = [
	"document",
	"spreadsheet",
	"image",
	"archive",
	"note",
];

/** A file's kind, from its server-detected mime. */
export function kindOf(mime: string): FileKind {
	if (mime === MD) return "note";
	if (mime.startsWith("image/")) return "image";
	if (mime === ZIP) return "archive";
	if (mime.includes("spreadsheet") || mime === CSV) return "spreadsheet";
	return "document";
}

/** "9.4 KB", "6.8 MB", "1.2 GB". */
export function sizeLabel(bytes: number): string {
	if (bytes < 1000) return `${bytes} B`;
	if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
	if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
	return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

// ---------------------------------------------------------------------------
// Notes: markdown files, shown as cards on a client's Notes tab.

const NOTE_SEEDS: [string, string][] = [
	[
		"Discovery call summary",
		"Wants online booking with deposits. Staff schedules change weekly; double-booking is the pain to remove first.",
	],
	[
		"Scope decisions",
		"Payments through Stripe only. No mobile app in this engagement. Admin can override a booking with a written reason.",
	],
	[
		"Open questions",
		"Who owns cancellation fees? Do recurring appointments need their own rules, or are they a series of single bookings?",
	],
	[
		"Stakeholder map",
		"Owner signs off on scope. Front desk lead is the daily contact and tests every release.",
	],
	[
		"Risks",
		"Their calendar export drops time zones. Imports need a fixture with a daylight-saving week.",
	],
];

export function sampleNotesForClient(clientId: string): SampleNote[] {
	const next = sequence(`notes:${clientId}`);
	const count = 3 + Math.floor(next() * 3);
	return newestFirst(
		NOTE_SEEDS.slice(0, count).map(([title, excerpt]) => ({
			id: driveUuid(`note:${clientId}:${title}`),
			scope: "client" as const,
			clientId,
			engagementId: null,
			name: `${title}.md`,
			title,
			excerpt,
			mime: MD,
			bytes: 2_000 + Math.floor(next() * 9_000),
			sha256: hexOf(next, 64),
			uploadedBy: PEOPLE[Math.floor(next() * PEOPLE.length)] ?? "javaris500",
			purgedAt: null,
			createdAt: dateOf(next),
		})),
	);
}

// ---------------------------------------------------------------------------
// The panel's samples: a text preview, who may read a file, and its history.

/** The first lines of a text file, for md and json; null for the rest. */
export function samplePreview(file: SampleFile): string | null {
	const title = file.name.replace(/\.[a-z]+$/, "");
	if (file.mime === MD) {
		return [
			`# ${title}`,
			"",
			"## Context",
			`Kept for ${scopePath(file)}. Read by Canon when drafting an intake.`,
			"",
			"## Decisions",
			"- Record each decision with its date and who made it.",
			"- Link the brief that a decision changed.",
		].join("\n");
	}
	if (file.mime === JSON_MIME) {
		return [
			"{",
			`  "title": "${title}",`,
			'  "version": "1.4.0",',
			'  "endpoints": [',
			'    { "method": "GET", "path": "/bookings" },',
			'    { "method": "POST", "path": "/bookings" }',
			"  ]",
			"}",
		].join("\n");
	}
	return null;
}

export type AccessRow = {
	who: string;
	/** "firm" agents read across scopes; "mission" agents only by brief. */
	kind: "firm" | "mission";
	reads: boolean;
	why: string;
};

const FIRM_AGENTS: [string, string][] = [
	["Canon", "Firm agent: reads across scopes to answer and draft intakes."],
	["Trace", "Firm agent: reads across scopes to research a question."],
	["Uno", "Firm agent: reads across scopes to keep client work in order."],
];

/** Who may read a file and why: firm agents always, mission agents by brief. */
export function sampleAccess(file: SampleFile): AccessRow[] {
	// A tombstone has no bytes: no one, not even a firm agent, can read it.
	if (file.purgedAt !== null) return [];
	const next = sequence(`access:${file.id}`);
	const briefs = file.scope === "general" ? ["Leonora"] : ["Atlas", "Brennan"];
	const listed = briefs.filter(() => next() < 0.6);
	return [
		...FIRM_AGENTS.map(([who, why]) => ({
			who,
			kind: "firm" as const,
			reads: true,
			why,
		})),
		...listed.map((who) => ({
			who,
			kind: "mission" as const,
			reads: true,
			why: `Listed in ${who}'s brief for mission ${String(10 + Math.floor(next() * 20)).padStart(3, "0")}.`,
		})),
		{
			who: "Any other mission agent",
			kind: "mission" as const,
			reads: false,
			why: "Only when a dispatch brief lists this file.",
		},
	];
}

export type HistoryEvent = {
	id: string;
	at: string;
	what: "uploaded" | "attached" | "promoted" | "deleted";
	by: string;
	detail: string;
};

/** A file's events, oldest first: uploaded, then any of attached, promoted, deleted. */
export function sampleHistory(file: SampleFile): HistoryEvent[] {
	const next = sequence(`history:${file.id}`);
	const at = (days: number) =>
		new Date(Date.parse(file.createdAt) + days * 86_400_000).toISOString();
	const events: HistoryEvent[] = [
		{
			id: `${file.id}:uploaded`,
			at: file.createdAt,
			what: "uploaded",
			by: file.uploadedBy,
			detail: `${sizeLabel(file.bytes)}, ${file.mime}`,
		},
	];
	if (file.scope !== "general" && next() < 0.6) {
		events.push({
			id: `${file.id}:attached`,
			at: at(2),
			what: "attached",
			by: "Canon",
			detail: "Attached to an intake draft",
		});
	}
	if (kindOf(file.mime) === "note" && next() < 0.5) {
		events.push({
			id: `${file.id}:promoted`,
			at: at(5),
			what: "promoted",
			by: file.uploadedBy,
			detail: "Promoted to a knowledge skill draft",
		});
	}
	if (file.purgedAt !== null) {
		events.push({
			id: `${file.id}:deleted`,
			at: file.purgedAt,
			what: "deleted",
			by: file.uploadedBy,
			detail: "Bytes destroyed; the record is kept",
		});
	}
	return events;
}
