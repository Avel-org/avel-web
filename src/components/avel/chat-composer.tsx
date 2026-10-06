import { ArrowUpIcon, ChevronDown, Globe, Paperclip } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * The Command Center chat composer (AVEL-DESIGN.md sections 5 and 10).
 *
 * One rounded pill with two rows: the message on top, then a tool row with
 * the tools on the left and Send on the right. The radius stays generous so
 * the two rows still read as a pill.
 *
 * The pill is a steel surface (ruling 30: sheen and top edge) at the 15px
 * body size. Clicking or focusing the field draws nothing: no ring, no border
 * step, no fill change. The caret is the indicator (ruling 31, for this
 * composer only; every other field keeps ruling 22).
 *
 * At rest the composer floats, and an accent glow under it pulses in step
 * (rulings 21 and 23). The float is on a wrapper holding both the pill and
 * the glow, so they rise together and pause together while anything inside
 * has focus: text never moves under the caret, and a keyboard user never
 * chases a moving button. The glow peaks as the pill rises: avelPulse runs
 * 1 → 0.4 → 1 over the float's 4s, offset by half a period. Its outer layer
 * sets the range, from about 0.22 to 0.55 in dark and stronger in light,
 * where the accent reads fainter on white. Under reduced motion both stop,
 * and the glow stays as a soft static shadow.
 *
 * `sendDisabledReason` is required while avel-server has no chat endpoint: the
 * composer is real and takes text, but Send is disabled by state, with the
 * reason in its tooltip and linked for screen readers (ruling 11).
 *
 * The tool row holds the operator's chosen tools: attach a file, choose a
 * model, search the web. None can act yet, because avel-server has no upload,
 * model list or search behind the chat, so each is real UI disabled by state
 * with its reason (ruling 11). `tools` replaces them, for when they are wired.
 */
export function ChatComposer({
	sendDisabledReason,
	tools,
}: {
	sendDisabledReason: string;
	tools?: ReactNode;
}) {
	const inputId = useId();
	return (
		<form
			data-testid="chat-composer"
			onSubmit={(event) => event.preventDefault()}
		>
			<div
				data-testid="chat-composer-float"
				className="group/float relative isolate animate-float focus-within:[animation-play-state:paused] motion-reduce:animate-none"
			>
				<div
					aria-hidden="true"
					data-testid="chat-composer-glow"
					className="pointer-events-none absolute inset-x-[10%] top-3 -bottom-3 -z-10 opacity-55 motion-reduce:opacity-35 [.light_&]:opacity-80 [.light_&]:motion-reduce:opacity-50"
				>
					<div
						data-testid="chat-composer-glow-pulse"
						className="size-full animate-[avelPulse_4s_ease-in-out_infinite] rounded-full bg-accent blur-2xl [animation-delay:-2s] group-focus-within/float:[animation-play-state:paused] motion-reduce:animate-none"
					/>
				</div>
				<div
					data-testid="chat-composer-pill"
					className="surface-steel flex flex-col gap-2 rounded-[1.75rem] border border-border bg-app-field p-3"
				>
					<label htmlFor={inputId} className="sr-only">
						Message
					</label>
					<Textarea
						id={inputId}
						data-testid="chat-composer-input"
						rows={1}
						placeholder="Write a message"
						// The primitive's field styles (inset shadow, focus border and
						// fill) are all undone here: inside the pill the field is bare
						// text, and focus shows only as the caret (ruling 31).
						className="max-h-40 min-h-10 resize-none rounded-none border-0 bg-transparent px-2 py-1.5 text-[0.9375rem] leading-[1.375rem] shadow-none! focus-visible:bg-transparent focus-visible:outline-none md:text-[0.9375rem]"
					/>
					<div
						data-testid="chat-composer-tool-row"
						className="flex items-center justify-between gap-2"
					>
						<div
							role="toolbar"
							aria-label="Tools"
							data-testid="chat-composer-tools"
							className="flex items-center gap-1.5"
						>
							{tools ?? <ComposerTools />}
						</div>
						<Button
							type="submit"
							aria-label="Send"
							data-testid="chat-composer-send"
							disabledReason={sendDisabledReason}
							className="size-9 rounded-full px-0"
						>
							<ArrowUpIcon aria-hidden="true" />
						</Button>
					</div>
				</div>
			</div>
		</form>
	);
}

/**
 * Attach, model and web search: one height (32px), all pills (ruling 30),
 * each disabled with its reason.
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
				className="rounded-full"
			>
				<Paperclip aria-hidden="true" />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				data-testid="chat-composer-tool-model"
				disabledReason="Model choice is not built yet."
				className="gap-1 rounded-full px-3 text-text-muted"
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
				className="rounded-full"
			>
				<Globe aria-hidden="true" />
			</Button>
		</>
	);
}
