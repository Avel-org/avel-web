import type { Dispatch } from "avel-server/contract";
import { FileText } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDispatchBrief } from "@/lib/api/dispatches";
import { DetailModal } from "./action-modal";
import { type CodeTone, CodeView } from "./code-view";
import { ShortHash } from "./short-hash";
import { ErrorState, Surface } from "./surface";

/*
 * The brief a dispatch started with (step 9): scope, read, method and done
 * when, frozen at start with its hash. A queued dispatch, or one started
 * before step 9, has none, so the card offers nothing to open.
 */

/**
 * Each line of the brief as a tone: headings stand out, fence lines read as
 * keys, and anything inside a fence (the client's source) keeps its own
 * text, so a "#" there is not taken for one of the brief's headings.
 */
export function briefLineTones(text: string): (CodeTone | undefined)[] {
	let fenced = false;
	return text.split("\n").map((line) => {
		if (line.startsWith("```")) {
			fenced = !fenced;
			return "key";
		}
		if (fenced) return undefined;
		return line.startsWith("#") ? "heading" : undefined;
	});
}

/** The brief's hash on the card, and Read brief, which opens its text. */
export function DispatchBriefLine({
	dispatch,
	agentName,
}: {
	dispatch: Dispatch;
	agentName: string;
}) {
	const [open, setOpen] = useState(false);
	if (dispatch.briefSha256 === null) return null;
	return (
		<div
			data-testid={`dispatch-card-brief-text-${dispatch.id}`}
			className="flex flex-wrap items-center gap-1.5 type-small text-text-muted"
		>
			Brief
			<ShortHash
				value={dispatch.briefSha256}
				label="the brief's SHA-256"
				data-testid={`dispatch-card-brief-sha-${dispatch.id}`}
			/>
			<Button
				size="sm"
				variant="ghost"
				data-testid={`dispatch-card-brief-open-${dispatch.id}`}
				onClick={() => setOpen(true)}
			>
				<FileText aria-hidden="true" />
				Read brief
			</Button>
			{open ? (
				<DetailModal
					open
					onOpenChange={setOpen}
					title={`${agentName}'s brief`}
					description="What this run was given, frozen when it started: its scope, what to read, its method, and the checks that say it is done."
					data-testid="dispatch-brief-modal"
				>
					<BriefText dispatchId={dispatch.id} agentName={agentName} />
				</DetailModal>
			) : null}
		</div>
	);
}

/** The brief read from its route; mounted only while the modal is open. */
function BriefText({
	dispatchId,
	agentName,
}: {
	dispatchId: string;
	agentName: string;
}) {
	const query = useDispatchBrief(dispatchId);
	return (
		<Surface
			data-testid="dispatch-brief-surface"
			query={query}
			isEmpty={(brief) => brief.briefMd === null}
			loading={
				<div className="flex flex-col gap-2">
					<Skeleton className="h-4 w-1/2" />
					<Skeleton className="h-64 w-full" />
				</div>
			}
			empty={
				<p
					data-testid="dispatch-brief-none"
					className="type-small text-text-muted"
				>
					This run has no brief: it was queued, or started before briefs were
					written.
				</p>
			}
			error={ErrorState}
		>
			{(brief) => {
				const text = brief.briefMd ?? "";
				const tones = briefLineTones(text);
				return (
					<CodeView
						text={text}
						label={`${agentName}'s brief`}
						lineTone={(_line, index) => tones[index]}
						data-testid="dispatch-brief-code"
					/>
				);
			}}
		</Surface>
	);
}
