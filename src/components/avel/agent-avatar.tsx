import { cn } from "@/lib/utils";

/*
 * An agent's avatar (operator request, 2026-10-22): a picture drawn from its
 * slug, so an agent always looks the same wherever it appears and two agents
 * never share one. A five by five pattern, mirrored down its middle, in the
 * neutral ink on the raised ground: blue means something to act on and the
 * gate colours mean a verdict (audit D3), so an avatar carries neither.
 */

const CELLS = 5;
/** Columns drawn before the mirror: 0, 1 and the middle. */
const HALF = Math.ceil(CELLS / 2);

/** FNV-1a over the slug's UTF-16 units: small, stable, and spreads well. */
function hash(text: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/**
 * Which cells are filled, row by row, mirrored. Never empty and never full:
 * either would read as no picture at all.
 */
export function avatarCells(slug: string): boolean[][] {
	let bits = hash(slug);
	const rows = Array.from({ length: CELLS }, () => {
		const half = Array.from({ length: HALF }, () => {
			const on = (bits & 1) === 1;
			bits = bits >>> 1 || hash(`${slug}:${bits}`);
			return on;
		});
		return [...half, ...half.slice(0, CELLS - HALF).reverse()];
	});
	const filled = rows.flat().filter(Boolean).length;
	if (filled === 0 || filled === CELLS * CELLS) {
		// The middle cross: rare, and still a picture.
		return rows.map((row, r) =>
			row.map((_, c) => r === HALF - 1 || c === HALF - 1),
		);
	}
	return rows;
}

const SIZE = {
	sm: "size-tile-sm rounded-sm p-1",
	md: "size-tile-md rounded-tile p-1.5",
	lg: "size-tile-lg rounded-tile p-1.5",
	xl: "size-16 rounded-card p-3",
} as const;

export function AgentAvatar({
	slug,
	size = "md",
	className,
	"data-testid": testId,
}: {
	slug: string;
	size?: keyof typeof SIZE;
	className?: string;
	"data-testid"?: string;
}) {
	const cells = avatarCells(slug);
	return (
		<span
			aria-hidden="true"
			data-testid={testId ?? `agent-avatar-${slug}`}
			className={cn(
				"inline-flex shrink-0 border border-border bg-app-raised text-text-subtle",
				SIZE[size],
				className,
			)}
		>
			<svg
				aria-hidden="true"
				viewBox={`0 0 ${CELLS} ${CELLS}`}
				className="size-full"
				shapeRendering="crispEdges"
			>
				{cells.flatMap((row, r) =>
					row.map((on, c) =>
						on ? (
							<rect
								// biome-ignore lint/suspicious/noArrayIndexKey: a fixed grid; a cell is its position
								key={`${r}-${c}`}
								x={c}
								y={r}
								width={1}
								height={1}
								fill="currentColor"
							/>
						) : null,
					),
				)}
			</svg>
		</span>
	);
}
