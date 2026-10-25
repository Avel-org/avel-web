import { useNavigate } from "@tanstack/react-router";
import type { Client, Engagement } from "avel-server/contract";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { ApiError } from "@/lib/api";
import { isoDate, useClientEngagements } from "@/lib/api/clients";
import {
	type CreateIntakeBody,
	questionsFromLines,
	useCreateIntake,
} from "@/lib/api/intakes";
import { ActionModal, type IssuePath, ModalField } from "./action-modal";
import { OptionCards } from "./option-cards";
import { useOpenGeneration } from "./use-open-generation";

/*
 * A new intake (POST /api/intakes): a draft under one of the client's active
 * engagements, holding what the client asked for. It opens on the intake's
 * page, where Canon can brief it or the operator writes the brief.
 */

/** The longest source the contract takes. */
const SOURCE_MAX = 100_000;

export function NewIntakeModal({
	client,
	engagementId,
	open,
	onOpenChange,
}: {
	client: Pick<Client, "id" | "name">;
	/** The engagement to start on, when opened from one. */
	engagementId?: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const create = useCreateIntake();
	const engagements = useClientEngagements(client.id, "active");
	const navigate = useNavigate();
	const generation = useOpenGeneration(open);
	const active =
		engagements.data?.pages.flatMap((page) => page.data) ?? undefined;
	return (
		<NewIntakeForm
			key={`${client.id}:${engagementId ?? ""}:${generation}`}
			open={open}
			onOpenChange={(next) => {
				if (!next) create.reset();
				onOpenChange(next);
			}}
			clientName={client.name}
			engagements={active}
			engagementId={engagementId}
			pending={create.isPending}
			error={create.error}
			onSubmit={(body) =>
				create.mutate(body, {
					onSuccess: (intake) => {
						toast.success("Intake created as a draft.");
						onOpenChange(false);
						void navigate({
							to: "/clients/$id/intakes/$intakeId",
							params: { id: client.id, intakeId: intake.id },
						});
					},
				})
			}
		/>
	);
}

const INTAKE_FIELDS = ["engagementId", "sourceMd", "openQuestions"] as const;

const intakeFieldOf = (path: IssuePath): string | null =>
	(INTAKE_FIELDS as readonly unknown[]).includes(path[0])
		? (path[0] as string)
		: null;

/** What Create sends: the trimmed source, and questions only when typed. */
export function newIntakeBody(
	engagementId: string,
	source: string,
	questions: string,
): CreateIntakeBody {
	const open = questionsFromLines(questions);
	return {
		engagementId,
		sourceMd: source.trim(),
		...(open.length > 0 ? { openQuestions: open } : {}),
	};
}

/**
 * The form: which engagement, what the client asked for, and any questions
 * already open. `engagements` is undefined while they load.
 */
export function NewIntakeForm({
	open = true,
	onOpenChange = () => {},
	clientName,
	engagements,
	engagementId,
	pending,
	error,
	onSubmit,
	title = "New intake",
	description = `For ${clientName}. An intake holds what the client asked for; its brief is what a mission starts from.`,
	clientPicker,
}: {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	/** "" while New mission has no client chosen; then only the picker shows. */
	clientName: string;
	engagements:
		| Pick<Engagement, "id" | "name" | "scopeMd" | "startedAt">[]
		| undefined;
	engagementId?: string;
	pending: boolean;
	error: ApiError | null;
	onSubmit: (body: CreateIntakeBody) => void;
	title?: string;
	description?: string;
	/** New mission's choice of client, above the engagement. */
	clientPicker?: ReactNode;
}) {
	// One engagement is the only choice: chosen already.
	const only = engagements?.length === 1 ? engagements[0]?.id : undefined;
	const [chosen, setChosen] = useState<string>(engagementId ?? only ?? "");
	const [source, setSource] = useState("");
	const [questions, setQuestions] = useState("");
	const [sourceMissing, setSourceMissing] = useState(false);
	// A choice made under another client (New mission's picker changed) no
	// longer names one of these engagements. With a picker, nothing counts
	// as chosen while the new client's engagements load: the old choice
	// would create the intake under the client just left.
	const listed =
		engagements === undefined
			? clientPicker === undefined
			: engagements.some((e) => e.id === chosen);
	const engagement = chosen !== "" && listed ? chosen : (only ?? "");
	const noClient = clientPicker !== undefined && clientName === "";
	const none =
		!noClient && engagements !== undefined && engagements.length === 0;

	const submit = () => {
		if (source.trim() === "") {
			setSourceMissing(true);
			return;
		}
		onSubmit(newIntakeBody(engagement, source, questions));
	};

	return (
		<ActionModal
			open={open}
			onOpenChange={onOpenChange}
			size="form"
			title={title}
			description={description}
			dirty={source.trim() !== "" || questions.trim() !== ""}
			submitLabel="Create intake"
			pendingLabel="Creating"
			submitDisabledReason={
				noClient
					? "Choose a client."
					: none
						? "Start an engagement first."
						: engagement === ""
							? "Choose an engagement."
							: undefined
			}
			onSubmit={submit}
			pending={pending}
			error={error}
			fieldOf={intakeFieldOf}
			data-testid="intake-new"
		>
			{clientPicker}
			{noClient ? null : engagements === undefined ? (
				<div
					data-testid="intake-new-engagements-loading"
					className="flex flex-col gap-2"
				>
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-14 w-full rounded-card" />
				</div>
			) : none ? (
				<p
					data-testid="intake-new-no-engagement"
					className="rounded-control border border-border bg-app-well px-3 py-2 type-small text-text-muted"
				>
					{`${clientName} has no active engagement. An intake sits under one, so start an engagement first.`}
				</p>
			) : (
				<OptionCards
					legend="Engagement"
					value={engagement}
					onChange={setChosen}
					columns={engagements.length > 1 ? 2 : 1}
					data-testid="intake-new-engagement"
					options={engagements.map((e) => ({
						value: e.id,
						title: e.name,
						meta: (
							<>
								<span className="type-mono">{`Started ${isoDate(e.startedAt)}`}</span>
								{e.scopeMd ? (
									<span className="line-clamp-1">{e.scopeMd}</span>
								) : null}
							</>
						),
						"data-testid": `intake-new-engagement-${e.id}`,
					}))}
				/>
			)}
			<ModalField
				name="sourceMd"
				label="What the client asked for"
				hint="Markdown"
				error={
					sourceMissing
						? "Paste or write what the client asked for."
						: undefined
				}
				testid="intake-new-source"
			>
				{(props) => (
					<Textarea
						{...props}
						rows={10}
						maxLength={SOURCE_MAX}
						placeholder="Their request, an email, call notes or an existing brief. Canon reads this when it briefs the intake."
						value={source}
						onChange={(e) => {
							setSource(e.target.value);
							setSourceMissing(false);
						}}
					/>
				)}
			</ModalField>
			<ModalField
				name="openQuestions"
				label="Open questions"
				hint="Optional, one per line"
				testid="intake-new-questions"
			>
				{(props) => (
					<Textarea
						{...props}
						rows={3}
						placeholder="Which booking providers do they use today?"
						value={questions}
						onChange={(e) => setQuestions(e.target.value)}
					/>
				)}
			</ModalField>
		</ActionModal>
	);
}
