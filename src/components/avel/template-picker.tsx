import type { Template } from "avel-server/contract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { templateName, useTemplates } from "@/lib/api/templates";
import { ShortHash } from "./short-hash";

/*
 * The plan's template, chosen from the templates avel-server allows
 * (templates.list) rather than typed. Choosing one also sets the commit to
 * its latest, since the contract sets templateRef and templateVersion
 * together; the commit stays editable beside it for an older one.
 */

/** The select's value for "no template": not a slug, which is kebab-case. */
export const NO_TEMPLATE = "__none";

/** What a choice changes: the slug, and the commit to pin with it. */
export type TemplateChoice = { templateRef: string; templateVersion: string };

/** The change for choosing `value` from these templates. */
export function choiceFor(
	value: string,
	templates: readonly Template[],
): TemplateChoice {
	if (value === NO_TEMPLATE) return { templateRef: "", templateVersion: "" };
	const chosen = templates.find((t) => t.slug === value);
	return { templateRef: value, templateVersion: chosen?.latestSha ?? "" };
}

/** The props Field hands its control: the label's id, test id and errors. */
type FieldProps = {
	id: string;
	"data-testid": string;
	"aria-invalid": boolean | undefined;
	"aria-describedby": string | undefined;
};

export function TemplatePicker({
	value,
	readOnly,
	field,
	onChange,
}: {
	/** The draft's templateRef; empty means none. */
	value: string;
	readOnly: boolean;
	field: FieldProps;
	onChange: (choice: TemplateChoice) => void;
}) {
	const query = useTemplates();
	if (query.status === "error") {
		// The list could not be read: typing the slug still works, and the
		// server checks it on save.
		return (
			<div className="flex flex-col gap-1">
				<Input
					{...field}
					readOnly={readOnly}
					maxLength={100}
					placeholder="template-booking"
					className="type-mono"
					value={value}
					onChange={(e) =>
						onChange({ templateRef: e.target.value, templateVersion: "" })
					}
				/>
				<p
					data-testid="plan-template-ref-fallback"
					className="type-caption text-text-subtle"
				>
					Templates could not be read, so type the template's name.
				</p>
			</div>
		);
	}
	const templates = query.status === "success" ? query.data : [];
	const known = templates.some((t) => t.slug === value);
	const current = templates.find((t) => t.slug === value);
	return (
		<Select
			value={value === "" ? NO_TEMPLATE : value}
			disabled={readOnly || query.status === "pending"}
			onValueChange={(next) => onChange(choiceFor(next, templates))}
		>
			<SelectTrigger {...field} className="w-full">
				<SelectValue>
					{query.status === "pending" && value === ""
						? "Loading templates"
						: value === ""
							? "No template"
							: current
								? templateName(current)
								: value}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={NO_TEMPLATE} data-testid="plan-template-option-none">
					No template
				</SelectItem>
				{templates.map((t) => (
					<SelectItem
						key={t.slug}
						value={t.slug}
						data-testid={`plan-template-option-${t.slug}`}
					>
						<span className="flex items-baseline gap-2">
							{templateName(t)}
							<span className="type-mono text-text-subtle">{t.slug}</span>
						</span>
					</SelectItem>
				))}
				{value !== "" && !known && query.status === "success" ? (
					<SelectItem value={value} data-testid="plan-template-option-unlisted">
						{`${value}, not in the allowlist`}
					</SelectItem>
				) : null}
			</SelectContent>
		</Select>
	);
}

/**
 * Under the commit: the chosen template's latest commit, and a button to pin
 * it, shown only when the draft pins a different one.
 */
export function LatestCommit({
	templateRef,
	templateVersion,
	readOnly,
	onUse,
}: {
	templateRef: string;
	templateVersion: string;
	readOnly: boolean;
	onUse: (sha: string) => void;
}) {
	const query = useTemplates();
	const latest =
		query.status === "success"
			? query.data.find((t) => t.slug === templateRef)?.latestSha
			: undefined;
	if (!latest || latest === templateVersion.trim()) return null;
	return (
		<p
			data-testid="plan-template-latest"
			className="flex flex-wrap items-center gap-2 type-caption text-text-subtle"
		>
			<span>
				{"Latest on "}
				<span className="type-mono">{templateRef}</span>
				{": "}
				<ShortHash value={latest} label="the latest commit" />
			</span>
			{readOnly ? null : (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					data-testid="plan-template-use-latest"
					onClick={() => onUse(latest)}
				>
					Use latest
				</Button>
			)}
		</p>
	);
}
