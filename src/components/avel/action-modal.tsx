import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
	createContext,
	type KeyboardEvent,
	type ReactNode,
	useContext,
	useId,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
	CLOSE_BUTTON,
	DialogOverlay,
	DialogPortal,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import { describeError } from "@/lib/error-map";
import { cn } from "@/lib/utils";
import { isShortcut, useShortcutLabel } from "@/shell/shortcut";
import { RequestReference } from "./surface";

/*
 * The one modal shell (AVEL-DESIGN.md ruling 35): Confirm, Form and Stepper
 * sizes over one structure. A header that is a verb and its object, the
 * fields, a WhatChanges strip, a row for what the server refused that no
 * field can hold, then the buttons. ⌘Enter submits. Esc, the close button
 * and a click outside close at once when nothing changed, and ask first when
 * something did. Below md every size fills the screen.
 *
 * The caller owns the request: it passes `pending` and `error`, and closes
 * the modal on success. A refusal keeps the modal open with what was typed,
 * each issue on its field by path.
 */

// ---------------------------------------------------------------------------
// Issues: pure, tested directly.

export type IssuePath = readonly (string | number)[];
export type FieldIssue = { path: IssuePath; message: string };

/**
 * The issues a refused request carries for its form: VALIDATION_FAILED's
 * body issues (400) and PRECONDITION_FAILED's details.issues (422, such as
 * plan_changes_approved_brief). Anything else carries none.
 */
export function issuesOf(error: unknown): FieldIssue[] {
	if (!(error instanceof ApiError)) return [];
	const { failure } = error;
	if (failure.kind !== "contract") return [];
	if (failure.code === "VALIDATION_FAILED") {
		return (failure.details?.body ?? []).map(({ path, message }) => ({
			path,
			message,
		}));
	}
	if (failure.code === "PRECONDITION_FAILED") {
		return (failure.details.issues ?? []).map(({ path, message }) => ({
			path,
			message,
		}));
	}
	return [];
}

/** The default field for an issue: its path's first segment, when a name. */
export const firstSegment = (path: IssuePath): string | null =>
	typeof path[0] === "string" ? path[0] : null;

/** Each issue on the field `fieldOf` names, and the rest apart, in order. */
export function placeIssues(
	issues: readonly FieldIssue[],
	fieldOf: (path: IssuePath) => string | null,
	describe: (issue: FieldIssue) => string = (issue) => issue.message,
): { byField: Record<string, string[]>; unplaced: FieldIssue[] } {
	const byField: Record<string, string[]> = {};
	const unplaced: FieldIssue[] = [];
	for (const issue of issues) {
		const field = fieldOf(issue.path);
		if (field === null) {
			unplaced.push(issue);
		} else {
			byField[field] ??= [];
			byField[field].push(describe(issue));
		}
	}
	return { byField, unplaced };
}

// ---------------------------------------------------------------------------
// Fields.

const IssuesContext = createContext<Record<string, string[]>>({});

/** The refusal's messages for one field of the open modal; none outside one. */
export function useFieldIssues(name: string): string[] {
	return useContext(IssuesContext)[name] ?? [];
}

/**
 * A labelled field inside an ActionModal. The server's messages for `name`
 * sit under the control, linked to it and marking it invalid, so a screen
 * reader hears them with the field. `error` adds a message of the caller's
 * own, such as a check made before sending.
 */
export function ModalField({
	name,
	label,
	hint,
	error,
	testid,
	children,
}: {
	name: string;
	label: string;
	hint?: string;
	error?: string;
	testid: string;
	children: (props: {
		id: string;
		"data-testid": string;
		"aria-invalid": boolean | undefined;
		"aria-describedby": string | undefined;
	}) => ReactNode;
}) {
	const id = useId();
	const errorId = `${id}-error`;
	const messages = [...(error ? [error] : []), ...useFieldIssues(name)];
	return (
		<div className="flex flex-col gap-1.5" data-field={name}>
			<label htmlFor={id} className="type-small font-medium text-foreground">
				{label}
				{hint ? (
					<span className="ml-2 font-normal text-text-subtle">{hint}</span>
				) : null}
			</label>
			{children({
				id,
				"data-testid": testid,
				"aria-invalid": messages.length > 0 ? true : undefined,
				"aria-describedby": messages.length > 0 ? errorId : undefined,
			})}
			{messages.length > 0 ? (
				// One paragraph, so the control's description is its whole text.
				<p
					id={errorId}
					data-testid={`${testid}-error`}
					className="type-small text-gate-block"
				>
					{[...new Set(messages)].join(" ")}
				</p>
			) : null}
		</div>
	);
}

// ---------------------------------------------------------------------------
// The shell.

export type ModalSize = "confirm" | "form" | "stepper";

const SIZE: Record<ModalSize, string> = {
	confirm: "md:max-w-md",
	form: "md:max-w-xl",
	stepper: "md:max-w-3xl",
};

/**
 * The shell every modal shares: full screen below md, centred by size above.
 * It is a v3 dialog: the float surface and the dialog shadow, whose own ring
 * draws its edge, so it takes no border.
 */
export function shellClass(size: ModalSize): string {
	return cn(
		// overflow-hidden clips to the radius: the footer band's square
		// corners otherwise show past the rounded bottom.
		"fixed z-(--z-modal) flex flex-col overflow-hidden bg-app-float shadow-dialog outline-hidden",
		"duration-(--duration-state) ease-avel data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
		"inset-0 max-md:h-dvh",
		"md:inset-auto md:top-1/2 md:left-1/2 md:max-h-[calc(100dvh-4rem)] md:w-full md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-dialog md:data-[state=open]:zoom-in-95",
		SIZE[size],
	);
}

/**
 * Renders open modals in place instead of through the portal. The portal
 * mounts only in a browser, so a server render (a test) of an open modal
 * would show nothing. Tests wrap what they render in this; the app never
 * does.
 */
const InlineModalContext = createContext(false);

export function InlineModals({ children }: { children: ReactNode }) {
	return (
		<InlineModalContext.Provider value={true}>
			{children}
		</InlineModalContext.Provider>
	);
}

/** Whether open overlays render in place: true only under InlineModals. */
export function useInlineModals(): boolean {
	return useContext(InlineModalContext);
}

/** The dialog's root, then either the portal and content, or in place. */
function ModalRoot({
	open,
	onOpenChange,
	size,
	testId,
	content,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	size: ModalSize;
	testId: string;
	content: Omit<
		React.ComponentProps<typeof DialogPrimitive.Content>,
		"children" | "className"
	>;
	children: ReactNode;
}) {
	const inline = useInlineModals();
	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
			{inline ? (
				open ? (
					<div
						data-testid={testId}
						data-size={size}
						className={shellClass(size)}
					>
						{children}
					</div>
				) : null
			) : (
				<DialogPortal>
					<DialogOverlay />
					<DialogPrimitive.Content
						data-testid={testId}
						data-size={size}
						className={shellClass(size)}
						{...content}
					>
						{children}
					</DialogPrimitive.Content>
				</DialogPortal>
			)}
		</DialogPrimitive.Root>
	);
}

export type ActionModalProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	size: ModalSize;
	/** A verb and its object: "Apply preset", "Add engagement". */
	title: string;
	description?: ReactNode;
	/** Something was typed or chosen: closing asks first. */
	dirty: boolean;
	/** What the primary button does: "Apply 6 agents". Never "Submit". */
	submitLabel: string;
	/** The primary button, and ⌘Enter anywhere in the modal. */
	onSubmit: () => void;
	pending: boolean;
	pendingLabel?: string;
	submitDisabledReason?: string;
	/**
	 * An irreversible write: the primary is the filled danger confirm (audit
	 * D7), the dialog's last button, after the dialog has named the effect.
	 */
	destructive?: boolean;
	error: ApiError | null;
	fieldOf?: (path: IssuePath) => string | null;
	describeIssue?: (issue: FieldIssue) => string;
	/** A WhatChanges strip, shown above the buttons. */
	changes?: ReactNode;
	/** Stepper only: the steps' names, the current one, and Back. */
	steps?: readonly string[];
	step?: number;
	/**
	 * How the steps show: v3's numbered discs (.steps-num), or its pills,
	 * "1 Agent", its number quiet before its name (.steps-pills), for a form whose steps are short nouns.
	 */
	stepStyle?: "numbered" | "pills";
	onBack?: () => void;
	children?: ReactNode;
	"data-testid": string;
};

/** What a close the operator asked for does: closes, or asks first. */
export function closeIntent(dirty: boolean, pending: boolean): "close" | "ask" {
	// While a request is in flight there is nothing to discard yet.
	return dirty && !pending ? "ask" : "close";
}

/** True for ⌘Enter or Ctrl+Enter when the primary can act. */
export function submitsOn(
	event: Parameters<typeof isShortcut>[0],
	blocked: boolean,
): boolean {
	return isShortcut(event, "Enter") && !blocked;
}

export function ActionModal(props: ActionModalProps) {
	const {
		open,
		onOpenChange,
		size,
		dirty,
		onSubmit,
		pending,
		submitDisabledReason,
	} = props;
	const [confirmingDiscard, setConfirmingDiscard] = useState(false);
	const blocked = pending || submitDisabledReason !== undefined;

	const close = () => {
		setConfirmingDiscard(false);
		onOpenChange(false);
	};
	const requestClose = () => {
		if (closeIntent(dirty, pending) === "ask") setConfirmingDiscard(true);
		else close();
	};
	const submit = () => {
		if (!blocked) onSubmit();
	};

	return (
		<ModalRoot
			open={open}
			onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}
			size={size}
			testId={props["data-testid"]}
			content={{
				onKeyDown: (event: KeyboardEvent) => {
					if (isShortcut(event, "Enter")) event.preventDefault();
					if (submitsOn(event, blocked)) onSubmit();
				},
				onEscapeKeyDown: (event) => {
					// Esc on the discard question keeps editing.
					if (confirmingDiscard) {
						event.preventDefault();
						setConfirmingDiscard(false);
					}
				},
			}}
		>
			<ActionModalFrame
				{...props}
				confirmingDiscard={confirmingDiscard}
				onRequestClose={requestClose}
				onKeep={() => setConfirmingDiscard(false)}
				onDiscard={close}
				onSubmitClick={submit}
			/>
		</ModalRoot>
	);
}

export type ActionModalFrameProps = Omit<
	ActionModalProps,
	"open" | "onOpenChange"
> & {
	confirmingDiscard: boolean;
	onRequestClose: () => void;
	onKeep: () => void;
	onDiscard: () => void;
	onSubmitClick: () => void;
};

/**
 * Everything inside the modal: header, fields, strip, refusal and buttons.
 * Presentational, so a test renders it inside an open Dialog root without
 * the portal, which only mounts in a browser.
 */
export function ActionModalFrame({
	title,
	description,
	submitLabel,
	pending,
	pendingLabel = "Saving",
	submitDisabledReason,
	destructive = false,
	error,
	fieldOf = firstSegment,
	describeIssue,
	changes,
	steps,
	step = 0,
	stepStyle = "numbered",
	onBack,
	children,
	"data-testid": testId,
	confirmingDiscard,
	onRequestClose,
	onKeep,
	onDiscard,
	onSubmitClick,
}: ActionModalFrameProps) {
	const submitHint = useShortcutLabel("↵");
	const { byField, unplaced } = placeIssues(
		issuesOf(error),
		fieldOf,
		describeIssue,
	);
	return (
		<>
			<header className="flex flex-col gap-1 px-6 pt-5 pb-4 pr-14">
				{/* Through onRequestClose, so an edited form asks first. */}
				<button
					type="button"
					data-testid={`${testId}-dismiss`}
					className={CLOSE_BUTTON}
					onClick={onRequestClose}
				>
					<XIcon aria-hidden="true" />
					<span className="sr-only">Close</span>
				</button>
				{steps ? (
					stepStyle === "pills" ? (
						<StepPills steps={steps} step={step} testId={testId} />
					) : (
						<StepTrail steps={steps} step={step} />
					)
				) : null}
				<DialogPrimitive.Title className="type-page text-foreground">
					{title}
				</DialogPrimitive.Title>
				{description ? (
					<DialogPrimitive.Description className="type-small text-text-muted">
						{description}
					</DialogPrimitive.Description>
				) : (
					// Radix wants a description or an explicit none.
					<DialogPrimitive.Description className="sr-only">
						{title}
					</DialogPrimitive.Description>
				)}
			</header>
			<IssuesContext.Provider value={byField}>
				<div className="app-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-5">
					{children}
				</div>
			</IssuesContext.Provider>
			{/* What the write changes and what the server refused sit above the
			    band, outside the scroll, so the band holds only the buttons. */}
			{changes || error ? (
				<div className="flex flex-col gap-3 px-6 pb-4">
					{changes}
					{error ? (
						<RefusalRow
							error={error}
							unplaced={unplaced}
							placed={unplaced.length < issuesOf(error).length}
							describe={describeIssue ?? ((issue) => issue.message)}
						/>
					) : null}
				</div>
			) : null}
			<footer className="flex flex-col gap-3 border-t border-border bg-app-band py-3 pr-4 pl-6 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
				{confirmingDiscard ? (
					<div
						role="alertdialog"
						aria-label="Discard changes?"
						data-testid={`${testId}-discard`}
						className="flex flex-wrap items-center justify-end gap-2"
					>
						<p className="mr-auto type-small text-foreground">
							Discard what you changed?
						</p>
						<Button
							variant="ghost"
							size="sm"
							data-testid={`${testId}-keep`}
							autoFocus
							onClick={onKeep}
						>
							Keep editing
						</Button>
						<Button
							variant="destructive"
							size="sm"
							data-testid={`${testId}-discard-confirm`}
							onClick={onDiscard}
						>
							Discard
						</Button>
					</div>
				) : (
					<div className="flex flex-wrap items-center justify-end gap-2">
						{steps && step > 0 && onBack ? (
							<Button
								variant="ghost"
								data-testid={`${testId}-back`}
								className="mr-auto"
								disabled={pending}
								onClick={onBack}
							>
								Back
							</Button>
						) : null}
						<Button
							variant="ghost"
							data-testid={`${testId}-cancel`}
							onClick={onRequestClose}
						>
							Cancel
						</Button>
						<Button
							variant={destructive ? "destructive-confirm" : "default"}
							data-testid={`${testId}-submit`}
							disabled={pending}
							disabledReason={submitDisabledReason}
							onClick={onSubmitClick}
						>
							{pending ? pendingLabel : submitLabel}
							<kbd className="ml-1 hidden type-mono opacity-70 md:inline">
								{submitHint}
							</kbd>
						</Button>
					</div>
				)}
			</footer>
		</>
	);
}

/**
 * Where a stepper stands, as v3's step pills: each step a small pill, "1
 * Agent", the current one in the selected fill with the accent ring and
 * text (Polish 10), the rest quiet.
 */
function StepPills({
	steps,
	step,
	testId,
}: {
	steps: readonly string[];
	step: number;
	testId: string;
}) {
	return (
		<ol
			aria-label="Steps"
			data-testid={`${testId}-steps`}
			className="mb-1 flex flex-wrap items-center gap-1.5"
		>
			{steps.map((name, i) => (
				<li
					key={name}
					data-testid={`${testId}-step-${i}`}
					aria-current={i === step ? "step" : undefined}
					className={cn(
						"inline-flex h-6 items-center gap-1.5 rounded-sm px-2 type-small",
						i === step
							? "bg-selected text-accent-text ring-1 ring-accent-line ring-inset"
							: i < step
								? "bg-gate-pending-soft text-text"
								: "bg-gate-pending-soft text-text-subtle",
					)}
				>
					<span className="tabular-nums opacity-70">{i + 1}</span>
					{name}
					{i < step ? <span className="sr-only">, done</span> : null}
				</li>
			))}
		</ol>
	);
}

/**
 * Where a stepper stands: v3's numbered steps. Finished steps take the
 * primary face, the current one an accent ring (where the operator is), and
 * the rest quiet discs.
 */
function StepTrail({
	steps,
	step,
}: {
	steps: readonly string[];
	step: number;
}) {
	return (
		<ol aria-label="Steps" className="mb-1 flex flex-wrap gap-x-4 gap-y-1">
			{steps.map((name, i) => (
				<li
					key={name}
					aria-current={i === step ? "step" : undefined}
					className={cn(
						"flex items-center gap-2 type-small",
						i === step ? "text-text" : "text-text-subtle",
					)}
				>
					<span
						className={cn(
							"inline-grid size-[22px] place-items-center rounded-full border type-caption font-medium",
							i < step && "control-on text-text-on-solid",
							i === step && "border-accent bg-app-panel text-accent-text",
							i > step &&
								"border-transparent bg-gate-pending-soft text-text-subtle",
						)}
					>
						{i + 1}
					</span>
					{name}
				</li>
			))}
		</ol>
	);
}

/**
 * What the server refused that no field holds: the error map's copy, and
 * each issue that maps to no field. When every issue sits on a field, a
 * pointer to them is enough.
 */
function RefusalRow({
	error,
	unplaced,
	placed,
	describe,
}: {
	error: ApiError;
	unplaced: readonly FieldIssue[];
	placed: boolean;
	describe: (issue: FieldIssue) => string;
}) {
	const copy = describeError(error);
	const onFieldsOnly = placed && unplaced.length === 0;
	return (
		<div
			role="alert"
			data-testid="action-modal-refusal"
			className="flex flex-col gap-1 rounded-control border border-gate-block-line bg-gate-block-soft px-3 py-2"
		>
			<p className="type-small text-foreground">
				{onFieldsOnly ? "Check the fields marked above." : copy.what}
			</p>
			{unplaced.length > 0 ? (
				<ul
					data-testid="action-modal-unplaced"
					className="flex flex-col gap-0.5"
				>
					{unplaced.map((issue) => (
						<li
							key={`${issue.path.join(".")}:${issue.message}`}
							className="type-small text-foreground"
						>
							{issue.path.length > 0 ? (
								<span className="mr-2 type-mono text-text-subtle">
									{issue.path.join(".")}
								</span>
							) : null}
							{describe(issue)}
						</li>
					))}
				</ul>
			) : null}
			{onFieldsOnly ? null : (
				<p className="type-small text-text-muted">{copy.next}</p>
			)}
			{/* The id support traces the refusal by (audit F4), as every
			    error state shows it. */}
			{error.requestId ? <RequestReference id={error.requestId} /> : null}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Viewing.

/**
 * A detail modal (ruling 35: preset and playbook detail): the same shell and
 * header, a body, and Close. It changes nothing, so it never asks before
 * closing and has no primary.
 */
export function DetailModal({
	open,
	onOpenChange,
	size = "form",
	title,
	description,
	children,
	"data-testid": testId,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	size?: ModalSize;
	title: string;
	description?: ReactNode;
	children: ReactNode;
	"data-testid": string;
}) {
	return (
		<ModalRoot
			open={open}
			onOpenChange={onOpenChange}
			size={size}
			testId={testId}
			content={{}}
		>
			<header className="flex flex-col gap-1 px-6 pt-5 pb-4 pr-14">
				<DialogPrimitive.Close
					data-testid={`${testId}-dismiss`}
					className={CLOSE_BUTTON}
				>
					<XIcon aria-hidden="true" />
					<span className="sr-only">Close</span>
				</DialogPrimitive.Close>
				<DialogPrimitive.Title className="type-page text-foreground">
					{title}
				</DialogPrimitive.Title>
				<DialogPrimitive.Description
					className={description ? "type-small text-text-muted" : "sr-only"}
				>
					{description ?? title}
				</DialogPrimitive.Description>
			</header>
			<div className="app-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-5">
				{children}
			</div>
			<footer className="flex justify-end border-t border-border bg-app-band py-3 pr-4 pl-6">
				<DialogPrimitive.Close asChild>
					<Button variant="ghost" data-testid={`${testId}-close`}>
						Close
					</Button>
				</DialogPrimitive.Close>
			</footer>
		</ModalRoot>
	);
}
