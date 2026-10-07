import { HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import { KIND } from "./drive-files";
import {
	FILE_KINDS,
	type SampleFile,
	STORAGE_CAP,
	sizeLabel,
	storageOf,
} from "./drive-placeholders";

/*
 * The storage strip: bytes held against the cap, and the same bytes split
 * by kind as one segmented bar with a legend. A tombstone holds no bytes.
 */

const percent = (part: number, whole: number) =>
	whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;

export function StorageStrip({ files }: { files: readonly SampleFile[] }) {
	const { used, byKind } = storageOf(files);
	const usedPct = percent(used, STORAGE_CAP);
	return (
		<div
			data-testid="drive-storage"
			className="grid gap-4 rounded-md border border-border surface-steel bg-app-panel p-4 lg:grid-cols-[16rem_minmax(0,1fr)]"
		>
			<div className="flex flex-col gap-2">
				<span className="flex items-center gap-2 type-caption text-text-subtle">
					<HardDrive aria-hidden="true" className="size-3.5" />
					Storage
				</span>
				<span className="flex items-baseline gap-1.5">
					<span
						data-testid="drive-storage-used"
						className="type-h2 text-foreground tabular-nums"
					>
						{sizeLabel(used)}
					</span>
					<span className="type-small text-text-subtle">{`of ${sizeLabel(STORAGE_CAP)}`}</span>
				</span>
				{/* The native meter speaks; the bar beside it is what the eye reads. */}
				<meter
					aria-label="Storage used"
					min={0}
					max={STORAGE_CAP}
					value={used}
					data-testid="drive-storage-meter"
					className="sr-only"
				>
					{`${sizeLabel(used)} of ${sizeLabel(STORAGE_CAP)}, ${usedPct}%`}
				</meter>
				<div
					aria-hidden="true"
					data-testid="drive-storage-bar"
					className="h-1.5 overflow-hidden rounded-full bg-app-recessed"
				>
					<div
						className="h-full rounded-full bg-accent"
						style={{ width: `${usedPct}%` }}
					/>
				</div>
			</div>
			<div className="flex min-w-0 flex-col gap-2">
				<span className="type-caption text-text-subtle">By kind</span>
				<div
					aria-hidden="true"
					data-testid="drive-kind-bar"
					className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-app-recessed"
				>
					{FILE_KINDS.map((kind) =>
						byKind[kind].bytes > 0 ? (
							<span
								key={kind}
								data-kind={kind}
								className={cn("h-full", KIND[kind].bar)}
								style={{ width: `${percent(byKind[kind].bytes, used)}%` }}
							/>
						) : null,
					)}
				</div>
				<ul
					aria-label="Storage by kind"
					data-testid="drive-kind-legend"
					className="flex flex-wrap gap-x-5 gap-y-1.5"
				>
					{FILE_KINDS.map((kind) => (
						<li
							key={kind}
							data-testid={`drive-kind-${kind}`}
							className="flex items-center gap-2 whitespace-nowrap"
						>
							<span
								aria-hidden="true"
								className={cn("size-2 rounded-full", KIND[kind].bar)}
							/>
							<span className="type-small text-text-muted">
								{KIND[kind].plural}
							</span>
							<span className="type-mono-small text-text-subtle tabular-nums">
								{byKind[kind].count}
							</span>
							<span className="type-mono-small text-text-subtle tabular-nums">
								{sizeLabel(byKind[kind].bytes)}
							</span>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}
