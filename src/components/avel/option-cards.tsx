import { type ReactNode, useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { Reason } from "./reason";

/*
 * A choice between a few things, as cards (the dialogs' option cards): each
 * a radio, or a checkbox where several may be chosen, with a title, a muted
 * line of facts and, where the choice does something, a well that says what
 * happens. The chosen card takes v3's one selected state (R10); one that
 * cannot be chosen says why (v3 UX 6), at full contrast.
 */

export type OptionCard<V extends string> = {
	value: V;
	title: ReactNode;
	/** Facts about it, a muted line under the title. */
	meta?: ReactNode;
	/** What choosing it does, in a well. */
	detail?: ReactNode;
	/** The well in the warn tone: choosing it can't be undone. */
	irreversible?: boolean;
	disabledReason?: string;
	/** The radio's or checkbox's own test id. */
	"data-testid"?: string;
};

/** One card's frame: the selected state follows its control's data-state. */
const cardClass = (off: boolean) =>
	cn(
		"flex items-start gap-2.5 rounded-card border border-border bg-app-panel px-3 py-2.5 transition-colors duration-(--duration-micro) ease-avel",
		off
			? "cursor-not-allowed bg-app-band"
			: "cursor-pointer hover:border-border-strong has-[[data-state=checked]]:border-selected-border has-[[data-state=checked]]:bg-selected",
	);

/** A card's words: title, facts, what it does, or why it can't be chosen. */
function CardBody<V extends string>({ option }: { option: OptionCard<V> }) {
	const off = option.disabledReason !== undefined;
	return (
		<span className="flex min-w-0 flex-1 flex-col gap-0.5">
			<span
				className={cn(
					"type-small font-medium",
					off ? "text-text-muted" : "text-foreground",
				)}
			>
				{option.title}
			</span>
			{option.meta ? (
				<span className="flex flex-wrap gap-x-3 gap-y-0.5 type-caption text-text-muted">
					{option.meta}
				</span>
			) : null}
			{option.detail && !off ? (
				<span
					className={cn(
						"mt-1 rounded-control border px-2.5 py-1.5 type-caption",
						option.irreversible
							? "border-gate-warn-line bg-gate-warn-banner text-foreground"
							: "border-border bg-app-well text-text-muted",
					)}
				>
					{option.detail}
				</span>
			) : null}
			{off ? <Reason className="mt-1">{option.disabledReason}</Reason> : null}
		</span>
	);
}

export function OptionCards<V extends string>({
	legend,
	value,
	onChange,
	options,
	columns = 1,
	"data-testid": testId,
}: {
	legend: string;
	/** "" when nothing is chosen yet. */
	value: V | "";
	onChange: (value: V) => void;
	options: readonly OptionCard<V>[];
	columns?: 1 | 2;
	"data-testid": string;
}) {
	const id = useId();
	return (
		<fieldset className="flex flex-col gap-2">
			<legend className="mb-2 type-small font-medium text-foreground">
				{legend}
			</legend>
			<RadioGroup
				data-testid={testId}
				value={value}
				onValueChange={(next) => onChange(next as V)}
				className={cn("grid gap-2", columns === 2 && "sm:grid-cols-2")}
			>
				{options.map((option) => {
					const off = option.disabledReason !== undefined;
					const itemId = `${id}-${option.value}`;
					return (
						<label
							key={option.value}
							htmlFor={itemId}
							data-option={option.value}
							data-disabled={off || undefined}
							className={cardClass(off)}
						>
							<RadioGroupItem
								id={itemId}
								value={option.value}
								disabled={off}
								data-testid={option["data-testid"]}
								className="mt-0.5 shrink-0"
							/>
							<CardBody option={option} />
						</label>
					);
				})}
			</RadioGroup>
		</fieldset>
	);
}

/** The same cards where several may be chosen: a checkbox on each. */
export function OptionCheckCards<V extends string>({
	legend,
	value,
	onChange,
	options,
	columns = 1,
	"data-testid": testId,
}: {
	legend: string;
	value: readonly V[];
	onChange: (value: V[]) => void;
	options: readonly OptionCard<V>[];
	columns?: 1 | 2;
	"data-testid": string;
}) {
	const id = useId();
	return (
		<fieldset
			data-testid={testId}
			className={cn("grid gap-2", columns === 2 && "sm:grid-cols-2")}
		>
			<legend className="mb-2 type-small font-medium text-foreground">
				{legend}
			</legend>
			{options.map((option) => {
				const off = option.disabledReason !== undefined;
				const itemId = `${id}-${option.value}`;
				const checked = value.includes(option.value);
				return (
					<label
						key={option.value}
						htmlFor={itemId}
						data-option={option.value}
						data-disabled={off || undefined}
						className={cardClass(off)}
					>
						<Checkbox
							id={itemId}
							checked={checked}
							disabled={off}
							data-testid={option["data-testid"]}
							onCheckedChange={(on) =>
								onChange(
									on === true
										? [...value, option.value]
										: value.filter((v) => v !== option.value),
								)
							}
							className="mt-0.5 shrink-0"
						/>
						<CardBody option={option} />
					</label>
				);
			})}
		</fieldset>
	);
}
