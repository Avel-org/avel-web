import { ArrowUpIcon, ChevronDown, Globe, Paperclip } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Button } from "@/components/ui/button";

/**
 * The Command Center chat composer (AVEL-DESIGN.md sections 5 and 10).
 *
 * One box with two rows: the message on top, then a tool row with the tools
 * on the left and Send on the right. It is a v3 card on the field surface,
 * at the dialog radius so the two rows read as one large input.
 *
 * At rest the composer floats, and a baby blue accent glow under it pulses
 * in step (rulings 21 and 23, restored by the operator). The float is on a
 * wrapper holding both the box and the glow, so they rise together and
 * pause together while anything inside has focus: text never moves under
 * the caret, and a keyboard user never chases a moving button. The glow is
 * stronger in light, where the accent reads fainter on white. Under reduced
 * motion both stop, and the glow stays as a soft static shadow.
 *
 * Clicking or focusing the field draws nothing: no ring, no border step, no
 * fill change. The caret is the indicator (ruling 31, for this composer
 * only; every other field keeps ruling 22).
 *
 * `sendDisabledReason` is required: Send is disabled by state whenever it
 * can't send (signed out, nothing written, Canon answering), with the reason
 * in its tooltip and linked for screen readers (ruling 11).
 *
 * The tool row holds the operator's chosen tools: attach a file, choose a
 * model, search the web. None can act yet, because avel-server has no upload,
 * model list or search behind the chat, so each is real UI disabled by state
 * with its reason (ruling 11). `tools` replaces them, for when they are wired.
 */
export function ChatComposer({
	sendDisabledReason,
	tools,
	float = true,
	value,
	onChange,
	onSend,
	placeholder = "Write a message",
	label = "Message",
	maxLength,
}: {
	/** Why Send is off; undefined once a sender is wired and it may send. */
	sendDisabledReason: string | undefined;
	tools?: ReactNode;
	/**
	 * The float and glow are Home's alone (rulings 21 and 23); a composer in
	 * a panel, such as Canon's, sits still.
	 */
	float?: boolean;
	/** Controlled text, for a composer that sends. */
	value?: string;
	onChange?: (value: string) => void;
	/** Send: the button, or Cmd/Ctrl+Enter in the field. */
	onSend?: () => void;
	placeholder?: string;
	label?: string;
	maxLength?: number;
}) {
	const inputId = useId();
	const send = () => {
		if (sendDisabledReason === undefined && onSend) onSend();
	};
	const pill = (
		<div
			data-testid="chat-composer-pill"
			className="flex flex-col gap-2 rounded-dialog border border-border bg-app-field p-3 shadow-card"
		>
			<label htmlFor={inputId} className="sr-only">
				{label}
			</label>
			{/* A bare textarea, not the Textarea primitive: the box around it
			    is the field, so the textarea carries no field-surface (no
			    edge, no focus ring or halo). Focus shows only as the caret
			    (ruling 31); app.css already drops a textarea's outline. */}
			<textarea
				id={inputId}
				data-testid="chat-composer-input"
				rows={1}
				placeholder={placeholder}
				maxLength={maxLength}
				value={value}
				onChange={
					onChange ? (event) => onChange(event.target.value) : undefined
				}
				onKeyDown={(event) => {
					if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
						event.preventDefault();
						send();
					}
				}}
				className="field-sizing-content max-h-40 min-h-10 w-full resize-none bg-transparent px-2 py-1.5 type-body text-text placeholder:text-text-subtle"
			/>
			<div
				data-testid="chat-composer-tool-row"
				className="flex items-center justify-between gap-2"
			>
				<div
					role="toolbar"
					aria-label="Tools"
					data-testid="chat-composer-tools"
					// A phone wraps the tools rather than pushing Send off the row.
					className="flex min-w-0 flex-wrap items-center gap-1.5"
				>
					{tools ?? <ComposerTools />}
				</div>
				<Button
					type="submit"
					size="icon"
					aria-label="Send"
					data-testid="chat-composer-send"
					disabledReason={sendDisabledReason}
				>
					<ArrowUpIcon aria-hidden="true" />
				</Button>
			</div>
		</div>
	);
	return (
		<form
			data-testid="chat-composer"
			onSubmit={(event) => {
				event.preventDefault();
				send();
			}}
		>
			{float ? (
				<div
					data-testid="chat-composer-float"
					className="group/float relative isolate animate-float focus-within:[animation-play-state:paused] motion-reduce:animate-none"
				>
					<div
						aria-hidden="true"
						data-testid="chat-composer-glow"
						className="pointer-events-none absolute inset-x-[10%] top-3 -bottom-3 -z-10 opacity-80 motion-reduce:opacity-50 in-[.dark]:opacity-55 in-[.dark]:motion-reduce:opacity-35"
					>
						<div
							data-testid="chat-composer-glow-pulse"
							className="size-full animate-glow rounded-full bg-accent blur-2xl group-focus-within/float:[animation-play-state:paused] motion-reduce:animate-none"
						/>
					</div>
					{pill}
				</div>
			) : (
				pill
			)}
		</form>
	);
}

/**
 * Attach, model and web search: one height (28px, v3's small control), each
 * disabled with its reason.
 *
 * The model control is a plain button labelled "Model": nothing in the docs
 * or the contract lists models, and a menu of names would look like a working
 * choice. Web search is a toggle, so it carries aria-pressed even while it
 * cannot be pressed. No roving focus between them yet: each disabled tool is
 * reached through its reason's wrapper, one tab stop apiece.
 */
function ComposerTools() {
	return (
		<>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label="Attach file"
				data-testid="chat-composer-tool-attach"
				disabledReason="File upload is not built yet."
			>
				<Paperclip aria-hidden="true" />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				data-testid="chat-composer-tool-model"
				disabledReason="Model choice is not built yet."
				className="gap-1 text-text-muted"
			>
				Model
				<ChevronDown aria-hidden="true" />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label="Web search"
				aria-pressed={false}
				data-testid="chat-composer-tool-search"
				disabledReason="Web search is not built yet."
			>
				<Globe aria-hidden="true" />
			</Button>
		</>
	);
}
