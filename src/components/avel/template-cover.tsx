import type {
	StartingState,
	Template,
	TemplateScope,
} from "avel-server/contract";
import { Building2, Sprout, TriangleAlert } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { SCOPE_LABEL, STARTING_STATE_LABEL } from "@/lib/api/templates";
import { cn } from "@/lib/utils";

/*
 * A template's cover (ruling 48). The contract has no image for a template,
 * so the cover is drawn: an inline SVG made from its scope (the motif) and
 * its starting state (the ground), varied per slug by a hash, so each
 * template keeps the same picture on every render and every machine. It sits
 * on a flat band with a hairline under it, drawn in neutral inks only: v3 has
 * no decorative hues, and the accent is kept for what the operator can act
 * on. The art is decoration: it is aria-hidden, and the chips over it and the
 * card around it say the same in words, unreadable included.
 *
 * `image` is the slot for a real screenshot, should the manifest gain one.
 * It is a prop, never read from a field the contract does not have.
 */

type CoverTemplate = Pick<
	Template,
	"slug" | "name" | "readable" | "scope" | "startingState"
>;

/** FNV-1a: a stable 32-bit number from the slug. */
export function coverSeed(slug: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < slug.length; i++) {
		hash ^= slug.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/** mulberry32: a small seeded generator, so the art is the same everywhere. */
function seeded(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** The art's height in its own units: the cover is 11rem tall. */
const COVER_H = 176;

/** A whole-pixel value, so server and browser print the same attribute. */
const px = (n: number) => Math.round(n * 10) / 10;

// The art's classes: neutral token fills and strokes only. The "lit" part of
// a motif is a stronger ink, not a hue.
const FACE = "fill-app-panel stroke-text-muted/50";
const RAISED = "fill-app-raised";
const INK = "fill-text-muted/40";
const LINE = "fill-none stroke-text-muted/50";
const FAINT = "fill-none stroke-border";
const LIT = "fill-text-subtle";
const LIT_LINE = "fill-none stroke-text-subtle";
const LIT_SOFT = "fill-app-raised stroke-text-subtle";

type Rand = () => number;

/** Pick one index of n. */
const pick = (rand: Rand, n: number) => Math.floor(rand() * n);

// ---------------------------------------------------------------------------
// The motifs, one per scope, drawn about (0, 0) within about 80 by 52.

function FullStack({ rand }: { rand: Rand }) {
	const lit = pick(rand, 3);
	return (
		<g>
			{/* The database: a cylinder at the base. */}
			<rect x={-34} y={20} width={80} height={26} className="fill-border" />
			<path d="M -40 18 v 20 a 40 7 0 0 0 80 0 v -20" className={FACE} />
			<ellipse cx={0} cy={18} rx={40} ry={7} className={FACE} />
			<path d="M -40 28 a 40 7 0 0 0 80 0" className={LINE} />
			{/* The API: a slab of services. */}
			<rect
				x={-40}
				y={-10}
				width={92}
				height={22}
				rx={3}
				className="fill-border"
			/>
			<rect x={-46} y={-16} width={92} height={22} rx={3} className={FACE} />
			<path d="M -30 -5 H 30" className={LINE} />
			{[-30, 0, 30].map((x, i) => (
				<circle
					key={x}
					cx={x}
					cy={-5}
					r={4}
					className={i === lit ? LIT : FACE}
				/>
			))}
			{/* The screen: a window on top. */}
			<rect
				x={-50}
				y={-50}
				width={112}
				height={28}
				rx={3}
				className="fill-border"
			/>
			<rect x={-56} y={-56} width={112} height={28} rx={3} className={FACE} />
			{[-50, -45, -40].map((x) => (
				<circle key={x} cx={x} cy={-51} r={1.5} className={INK} />
			))}
			<rect
				x={-48}
				y={-46}
				width={38}
				height={12}
				rx={1.5}
				className={LIT_SOFT}
			/>
			<rect x={-4} y={-46} width={30} height={4} rx={1} className={INK} />
			<rect x={-4} y={-38} width={46} height={4} rx={1} className={INK} />
			{/* The joins between the layers. */}
			<path
				d="M 0 -28 V -16 M 0 6 V 11"
				strokeDasharray="2 2"
				className={LIT_LINE}
			/>
		</g>
	);
}

function Frontend({ rand }: { rand: Rand }) {
	const sidebar = rand() < 0.5;
	const lit = pick(rand, 3);
	return (
		<g>
			<rect
				x={-66}
				y={-44}
				width={144}
				height={96}
				rx={5}
				className="fill-border"
			/>
			<rect x={-72} y={-50} width={144} height={96} rx={5} className={FACE} />
			<path d="M -72 -38 H 72" className={LINE} />
			{[-64, -58, -52].map((x) => (
				<circle key={x} cx={x} cy={-44} r={1.75} className={INK} />
			))}
			<rect x={-34} y={-47} width={72} height={6} rx={3} className={RAISED} />
			{sidebar ? (
				<>
					<rect
						x={-66}
						y={-32}
						width={26}
						height={72}
						rx={2}
						className={RAISED}
					/>
					{[-26, -18, -10, -2].map((y) => (
						<rect
							key={y}
							x={-62}
							y={y}
							width={16}
							height={3}
							rx={1}
							className={INK}
						/>
					))}
					<rect
						x={-34}
						y={-32}
						width={100}
						height={28}
						rx={2}
						className={LIT_SOFT}
					/>
					<rect x={-28} y={-24} width={44} height={4} rx={1} className={INK} />
					{[0, 1, 2].map((i) => (
						<rect
							key={i}
							x={-34 + i * 34}
							y={2}
							width={30}
							height={38}
							rx={2}
							className={i === lit ? LIT_LINE : RAISED}
						/>
					))}
				</>
			) : (
				<>
					<rect
						x={-66}
						y={-32}
						width={132}
						height={8}
						rx={2}
						className={RAISED}
					/>
					<rect
						x={-66}
						y={-20}
						width={132}
						height={26}
						rx={2}
						className={LIT_SOFT}
					/>
					<rect x={-56} y={-12} width={52} height={4} rx={1} className={INK} />
					<rect x={-56} y={-4} width={34} height={4} rx={1} className={INK} />
					{[0, 1, 2].map((i) => (
						<rect
							key={i}
							x={-66 + i * 45}
							y={12}
							width={42}
							height={28}
							rx={2}
							className={i === lit ? LIT_LINE : RAISED}
						/>
					))}
				</>
			)}
		</g>
	);
}

/** A rack's six units, top to bottom. */
const UNITS = [0, 1, 2, 3, 4, 5] as const;

function Backend({ rand }: { rand: Rand }) {
	const racks = 2 + pick(rand, 2);
	const left = -((racks - 1) * 44) / 2;
	// Each rack's left edge, and which of its six units shows a live light.
	const racksAt = Array.from({ length: racks }, () => ({
		x: 0,
		lit: pick(rand, 6),
	})).map((rack, r) => ({ ...rack, x: left + r * 44 }));
	return (
		<g>
			{/* The service bus over the racks, and its one live node. */}
			<path d={`M ${left} -46 H ${left + (racks - 1) * 44}`} className={LINE} />
			{racksAt.map((rack) => (
				<path key={rack.x} d={`M ${rack.x} -46 V -38`} className={LINE} />
			))}
			<circle cx={0} cy={-52} r={5} className={LIT_SOFT} />
			<path d="M 0 -47 V -46" className={LIT_LINE} />
			{racksAt.map((rack) => {
				const x = rack.x - 17;
				return (
					<g key={rack.x}>
						<rect
							x={x + 5}
							y={-33}
							width={34}
							height={84}
							rx={2}
							className="fill-border"
						/>
						<rect
							x={x}
							y={-38}
							width={34}
							height={84}
							rx={2}
							className={FACE}
						/>
						{UNITS.map((u) => (
							<g key={u}>
								<rect
									x={x + 4}
									y={-34 + u * 13}
									width={26}
									height={9}
									rx={1}
									className={RAISED}
								/>
								<circle
									cx={x + 25}
									cy={-29.5 + u * 13}
									r={1.75}
									className={rack.lit === u ? LIT : INK}
								/>
								<rect
									x={x + 7}
									y={-31 + u * 13}
									width={10}
									height={3}
									rx={1}
									className={INK}
								/>
							</g>
						))}
					</g>
				);
			})}
		</g>
	);
}

function Integration({ rand }: { rand: Rand }) {
	const hubY = px(-8 + rand() * 16);
	const block = (x: number) => (
		<g>
			<rect
				x={x + 5}
				y={-27}
				width={46}
				height={58}
				rx={3}
				className="fill-border"
			/>
			<rect x={x} y={-32} width={46} height={58} rx={3} className={FACE} />
			{[-24, -16, -8].map((y) => (
				<rect
					key={y}
					x={x + 7}
					y={y}
					width={30}
					height={4}
					rx={1}
					className={INK}
				/>
			))}
			<rect x={x + 7} y={4} width={32} height={14} rx={2} className={RAISED} />
		</g>
	);
	return (
		<g>
			{block(-80)}
			{block(34)}
			<path
				d={`M -34 -12 C -14 -12 -14 ${hubY} -12 ${hubY} M 12 ${hubY} C 14 ${hubY} 14 -12 34 -12`}
				className={LIT_LINE}
			/>
			<path
				d={`M -34 12 C -14 12 -14 ${hubY} -12 ${hubY} M 12 ${hubY} C 14 ${hubY} 14 12 34 12`}
				strokeDasharray="3 3"
				className={LINE}
			/>
			<circle cx={0} cy={hubY} r={12} className={LIT_SOFT} />
			<path
				d={`M -4 ${hubY - 5} V ${hubY - 1} M 4 ${hubY - 5} V ${hubY - 1} M -6 ${hubY - 1} H 6 V ${hubY + 2} a 6 6 0 0 1 -12 0 Z`}
				className={LIT_LINE}
			/>
		</g>
	);
}

function Data({ rand }: { rand: Rand }) {
	const heights = Array.from({ length: 5 }, () => px(16 + rand() * 46));
	const top = heights.indexOf(Math.max(...heights));
	const bars = heights.map((h, i) => ({ x: -6 + i * 16, h }));
	return (
		<g>
			<path d="M -74 -30 v 60 a 24 6 0 0 0 48 0 v -60" className={FACE} />
			<ellipse cx={-50} cy={-30} rx={24} ry={6} className={FACE} />
			<path
				d="M -74 -10 a 24 6 0 0 0 48 0 M -74 10 a 24 6 0 0 0 48 0"
				className={LINE}
			/>
			<path d="M -22 0 H -14" strokeDasharray="2 2" className={LIT_LINE} />
			<path d="M -10 42 H 78" className={LINE} />
			{bars.map((bar, i) => (
				<rect
					key={bar.x}
					x={bar.x}
					y={42 - bar.h}
					width={10}
					height={bar.h}
					rx={1.5}
					className={i === top ? LIT : FACE}
				/>
			))}
			<polyline
				points={bars.map((bar) => `${bar.x + 5},${px(34 - bar.h)}`).join(" ")}
				className={LIT_LINE}
			/>
		</g>
	);
}

function Automation({ rand }: { rand: Rand }) {
	const start = rand() * Math.PI * 2;
	const lit = pick(rand, 4);
	const nodes = [0, 1, 2, 3].map((i) => {
		const a = start + (i * Math.PI) / 2;
		return { x: px(Math.cos(a) * 40), y: px(Math.sin(a) * 40 - 2) };
	});
	return (
		<g>
			<circle cx={0} cy={-2} r={40} className={FAINT} strokeWidth={6} />
			<circle
				cx={0}
				cy={-2}
				r={40}
				strokeDasharray="10 8"
				className={LIT_LINE}
			/>
			{nodes.map((node, i) => (
				<rect
					key={`${node.x}-${node.y}`}
					x={node.x - 9}
					y={node.y - 9}
					width={18}
					height={18}
					rx={4}
					className={i === lit ? LIT_SOFT : FACE}
				/>
			))}
			<circle cx={0} cy={-2} r={16} className={FACE} />
			<path
				d="M 0 -2 V -12 M 0 -2 L 8 3"
				className={LIT_LINE}
				strokeLinecap="round"
			/>
			<circle cx={0} cy={-2} r={1.75} className={LIT} />
		</g>
	);
}

function Migration({ rand }: { rand: Rand }) {
	const moved = 1 + pick(rand, 3);
	const cells = [0, 1, 2, 3, 4, 5];
	const cell = (x: number, i: number) => ({
		x: x + 6 + (i % 2) * 18,
		y: -24 + Math.floor(i / 2) * 18,
	});
	return (
		<g>
			{/* The old system: dashed, with gaps where cells have left. */}
			<rect
				x={-80}
				y={-30}
				width={44}
				height={60}
				rx={3}
				strokeDasharray="3 3"
				className={LINE}
			/>
			{cells.slice(moved).map((i) => {
				const c = cell(-80, i);
				return (
					<rect
						key={i}
						x={c.x}
						y={c.y}
						width={14}
						height={14}
						rx={1.5}
						className={RAISED}
					/>
				);
			})}
			{/* The new system: solid, filling up. */}
			<rect
				x={41}
				y={-25}
				width={44}
				height={60}
				rx={3}
				className="fill-border"
			/>
			<rect x={36} y={-30} width={44} height={60} rx={3} className={FACE} />
			{cells.map((i) => {
				const c = cell(36, i);
				return (
					<rect
						key={i}
						x={c.x}
						y={c.y}
						width={14}
						height={14}
						rx={1.5}
						className={i < 6 - moved ? RAISED : LIT_SOFT}
					/>
				);
			})}
			<path
				d="M -32 -14 Q 0 -60 32 -14"
				strokeDasharray="3 3"
				className={LIT_LINE}
			/>
			<path
				d="M 26 -20 L 32 -14 L 34 -22"
				className={LIT_LINE}
				strokeLinecap="round"
			/>
			{[0.3, 0.5, 0.7].map((t) => {
				const x = px((1 - t) ** 2 * -32 + 2 * (1 - t) * t * 0 + t ** 2 * 32);
				const y = px((1 - t) ** 2 * -14 + 2 * (1 - t) * t * -60 + t ** 2 * -14);
				return (
					<rect
						key={t}
						x={x - 4}
						y={y - 4}
						width={8}
						height={8}
						rx={1}
						className={LIT}
						opacity={0.4 + t * 0.6}
					/>
				);
			})}
		</g>
	);
}

function Audit({ rand }: { rand: Rand }) {
	const checked = Array.from({ length: 5 }, () => rand() < 0.6);
	return (
		<g>
			<rect
				x={-50}
				y={-44}
				width={72}
				height={94}
				rx={3}
				className="fill-border"
			/>
			<path d="M -56 -50 H -4 L 16 -30 V 44 H -56 Z" className={FACE} />
			<path d="M -4 -50 V -30 H 16" className={LINE} />
			{checked.map((on, i) => {
				const y = -22 + i * 13;
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed rows, never reordered
					<g key={i}>
						<rect
							x={-48}
							y={y - 4}
							width={8}
							height={8}
							rx={1.5}
							className={on ? LIT_SOFT : LINE}
						/>
						{on ? (
							<path
								d={`M -46.5 ${y} l 2 2 l 3.5 -4`}
								className={LIT_LINE}
								strokeLinecap="round"
							/>
						) : null}
						<rect
							x={-34}
							y={y - 2}
							width={i % 2 ? 30 : 40}
							height={4}
							rx={1}
							className={INK}
						/>
					</g>
				);
			})}
			<circle cx={28} cy={14} r={22} strokeWidth={3} className={LIT_SOFT} />
			<path
				d="M 44 30 L 60 46"
				strokeWidth={6}
				strokeLinecap="round"
				className={LIT_LINE}
			/>
		</g>
	);
}

const MOTIF = {
	"full-stack": FullStack,
	frontend: Frontend,
	backend: Backend,
	integration: Integration,
	data: Data,
	automation: Automation,
	migration: Migration,
	audit: Audit,
} as const satisfies Record<
	TemplateScope,
	(props: { rand: Rand }) => ReactNode
>;

// ---------------------------------------------------------------------------
// The ground, from the starting state.

/** Greenfield: an open, ruled field running to a horizon. */
function OpenField({ width, vx }: { width: number; vx: number }) {
	const horizon = 136;
	const rays = Math.ceil(width / 36) + 4;
	const columns = Array.from(
		{ length: Math.ceil(width / 24) },
		(_, i) => 12 + i * 24,
	);
	return (
		<g data-ground="greenfield">
			{columns.map((cx) =>
				[16, 40, 64, 88, 112].map((y) => (
					<circle
						key={`${cx}-${y}`}
						cx={cx}
						cy={y}
						r={0.9}
						className="fill-border"
					/>
				)),
			)}
			<path d={`M 0 ${horizon} H ${width}`} className={LINE} />
			{[142, 150, 161, 174].map((y) => (
				<path key={y} d={`M 0 ${y} H ${width}`} className={FAINT} />
			))}
			{Array.from({ length: rays * 2 + 1 }, (_, i) => {
				const k = i - rays;
				return (
					<path
						key={k}
						d={`M ${px(vx + k * 18)} ${horizon} L ${px(vx + k * 64)} ${COVER_H}`}
						className={FAINT}
					/>
				);
			})}
		</g>
	);
}

/** Brownfield: an existing skyline, hatched, that the motif is added to. */
function Existing({
	width,
	rand,
	hatch,
}: {
	width: number;
	rand: Rand;
	hatch: string;
}) {
	const ground = 146;
	const blocks: { x: number; w: number; h: number }[] = [];
	for (let x = -4; x < width; ) {
		const w = px(18 + rand() * 26);
		blocks.push({ x, w, h: px(14 + rand() * 50) });
		x += w + px(2 + rand() * 6);
	}
	return (
		<g data-ground="brownfield">
			<defs>
				<pattern
					id={hatch}
					width={6}
					height={6}
					patternUnits="userSpaceOnUse"
					patternTransform="rotate(45)"
				>
					<path d="M 0 0 V 6" className="stroke-border" strokeWidth={2} />
				</pattern>
			</defs>
			{blocks.map((b) => (
				<rect
					key={b.x}
					x={b.x}
					y={ground - b.h}
					width={b.w}
					height={b.h}
					fill={`url(#${hatch})`}
					strokeDasharray="3 2"
					className="stroke-text-muted/30"
				/>
			))}
			<path d={`M 0 ${ground} H ${width}`} className={LINE} />
			<rect
				x={0}
				y={ground}
				width={width}
				height={COVER_H - ground}
				className="fill-app-raised"
			/>
		</g>
	);
}

/** An unreadable repository: an empty, dashed slot. Nothing is guessed. */
function EmptySlot({ cx }: { cx: number }) {
	return (
		<g data-ground="unknown" transform={`translate(${cx} 92)`}>
			<rect
				x={-60}
				y={-40}
				width={120}
				height={80}
				rx={6}
				strokeDasharray="4 4"
				className={LINE}
			/>
			<rect
				x={-40}
				y={-22}
				width={80}
				height={44}
				rx={4}
				strokeDasharray="2 3"
				className={FAINT}
			/>
		</g>
	);
}

/** The generated art: ground, then motif. Decoration only. */
export function CoverArt({
	template,
	variant,
	"data-testid": testId,
}: {
	template: CoverTemplate;
	variant: "card" | "strip";
	"data-testid": string;
}) {
	const hatch = `cover-hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
	const rand = seeded(coverSeed(template.slug));
	// Wide enough that a card or a strip never scales the art up: a wider
	// box shows more ground, never a bigger motif.
	const width = variant === "strip" ? 1600 : 640;
	// Each slug sits its motif a little differently, inside the safe area.
	const jitter = px((rand() - 0.5) * 28);
	const cx = variant === "strip" ? width - 220 + jitter * 2 : 336 + jitter;
	const vx = px(width * (0.3 + rand() * 0.4));
	const Motif = template.scope ? MOTIF[template.scope] : null;
	const known = template.readable;
	return (
		<svg
			aria-hidden="true"
			focusable="false"
			data-testid={testId}
			data-scope={template.scope ?? undefined}
			data-starting-state={template.startingState ?? undefined}
			viewBox={`0 0 ${width} ${COVER_H}`}
			preserveAspectRatio={
				variant === "strip" ? "xMaxYMid slice" : "xMidYMid slice"
			}
			strokeWidth={1.25}
			strokeLinejoin="round"
			className="absolute inset-0 size-full"
		>
			{!known ? (
				<EmptySlot cx={cx} />
			) : (
				<>
					{template.startingState === "greenfield" ? (
						<OpenField width={width} vx={vx} />
					) : template.startingState === "brownfield" ? (
						<Existing width={width} rand={rand} hatch={hatch} />
					) : null}
					{Motif ? (
						<g
							transform={`translate(${cx} 98) scale(1.1)`}
							data-motif={template.scope}
						>
							<Motif rand={rand} />
						</g>
					) : null}
				</>
			)}
		</svg>
	);
}

// v3's tag shape, on the panel so it reads over the art.
const CHIP =
	"inline-flex h-[22px] items-center gap-1 rounded-sm border border-border bg-app-panel px-2 type-caption font-medium text-text [&_svg]:size-3";

const STATE_ICON = {
	greenfield: Sprout,
	brownfield: Building2,
} as const satisfies Record<StartingState, typeof Sprout>;

/**
 * The cover: the template's own image when its manifest names one, else the
 * generated art, with the scope and starting state as chips over its top
 * left. A named image can still fail to load (avel-server answers 404 for a
 * missing, oversized or non-image file), so a failed load falls back to the
 * art. `children` lays over its bottom (the page's strip puts a sentence
 * there).
 */
export function TemplateCover({
	template,
	image,
	variant = "card",
	children,
	className,
	"data-testid": testId,
}: {
	template: CoverTemplate;
	/** The manifest's cover (Template.cover): a same-origin URL and its alt. */
	image?: { url: string; alt: string } | null;
	variant?: "card" | "strip";
	children?: ReactNode;
	className?: string;
	"data-testid": string;
}) {
	const StateIcon = template.startingState
		? STATE_ICON[template.startingState]
		: null;
	// The URL carries the commit, so a new cover is a new URL and retries.
	const [failed, setFailed] = useState<string | null>(null);
	const shown = image && failed !== image.url ? image : null;
	return (
		<div
			data-testid={testId}
			data-readable={template.readable}
			data-cover={shown ? "image" : "generated"}
			className={cn(
				"relative overflow-hidden border-b border-border bg-app-band",
				className,
			)}
		>
			{shown ? (
				<img
					src={shown.url}
					alt={shown.alt}
					data-testid={`${testId}-image`}
					onError={() => setFailed(shown.url)}
					className="absolute inset-0 size-full object-cover"
				/>
			) : (
				<CoverArt
					template={template}
					variant={variant}
					data-testid={`${testId}-art`}
				/>
			)}
			<span className="absolute top-3 left-3 flex flex-wrap gap-1.5 pr-3">
				{template.readable ? (
					<>
						{template.scope ? (
							<span data-testid={`${testId}-scope`} className={CHIP}>
								{SCOPE_LABEL[template.scope]}
							</span>
						) : null}
						{template.startingState && StateIcon ? (
							<span data-testid={`${testId}-state`} className={CHIP}>
								<StateIcon aria-hidden="true" />
								{STARTING_STATE_LABEL[template.startingState]}
							</span>
						) : null}
					</>
				) : (
					<span data-testid={`${testId}-unreadable`} className={CHIP}>
						<TriangleAlert aria-hidden="true" className="text-gate-warn" />
						Not readable
					</span>
				)}
			</span>
			{children}
		</div>
	);
}
