import type { SkillLayer, SkillType } from "avel-server/contract";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SKILL_WRITE_REASON } from "./catalog-skill-inspector";
import { Field } from "./client-form";

/*
 * A new skill, written by an operator (agents never write skills). The form
 * is real: what is typed stays on this page. "When to use it" is the
 * description, the one part every agent always reads, so its length shows as
 * it is typed. Saving needs a write route that does not exist yet, so the
 * submit is disabled with its reason, and nothing is ever sent.
 */

const LAYERS: { value: SkillLayer; label: string }[] = [
	{ value: "role", label: "Role, part of an agent's identity" },
	{ value: "stack", label: "Stack, given at dispatch" },
	{ value: "domain", label: "Domain, given at dispatch" },
];

const TYPES: { value: SkillType; label: string }[] = [
	{ value: "knowledge", label: "Knowledge, text the agent reads" },
	{ value: "capability", label: "Capability, a tool its room provides" },
];

export function NewSkillForm() {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [content, setContent] = useState("");
	const [layer, setLayer] = useState<SkillLayer>("role");
	const [type, setType] = useState<SkillType>("knowledge");
	return (
		<section
			aria-labelledby="new-skill-title"
			data-testid="skill-new"
			className="flex flex-col gap-4 pb-6"
		>
			<header className="flex flex-col gap-1">
				<h2 id="new-skill-title" className="type-page text-foreground">
					New skill
				</h2>
				<p className="type-body text-text-muted">
					Saved as a draft, then reviewed and approved before any role or
					mission can carry it.
				</p>
			</header>
			<form
				data-testid="skill-new-form"
				className="flex flex-col gap-4 p-4 rounded-card border border-border bg-app-panel shadow-card"
				onSubmit={(event) => event.preventDefault()}
			>
				<Field label="Name" testid="skill-new-name">
					{(props) => (
						<Input
							{...props}
							maxLength={200}
							placeholder="release-notes"
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					)}
				</Field>
				<Field
					label="When to use it"
					hint="The agent reads only this to decide."
					testid="skill-new-description"
				>
					{(props) => (
						<div className="flex flex-col gap-1">
							<Textarea
								{...props}
								rows={2}
								value={description}
								onChange={(event) => setDescription(event.target.value)}
							/>
							<p
								data-testid="skill-new-description-length"
								data-length={description.length}
								aria-live="polite"
								className="type-caption text-text-subtle"
							>
								<span className="type-mono">{description.length}</span>
								{" characters, loaded on every dispatch"}
							</p>
						</div>
					)}
				</Field>
				<Field label="Instructions" testid="skill-new-content">
					{(props) => (
						<Textarea
							{...props}
							rows={10}
							className="type-mono"
							value={content}
							onChange={(event) => setContent(event.target.value)}
						/>
					)}
				</Field>
				<div className="flex flex-wrap gap-4">
					<Field label="Layer" testid="skill-new-layer">
						{({ id, "data-testid": testId }) => (
							<Select
								value={layer}
								onValueChange={(next) => setLayer(next as SkillLayer)}
							>
								<SelectTrigger id={id} data-testid={testId} className="w-72">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{LAYERS.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</Field>
					<Field label="Type" testid="skill-new-type">
						{({ id, "data-testid": testId }) => (
							<Select
								value={type}
								onValueChange={(next) => setType(next as SkillType)}
							>
								<SelectTrigger id={id} data-testid={testId} className="w-72">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{TYPES.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</Field>
				</div>
				<div className="flex justify-end">
					<Button
						type="submit"
						data-testid="skill-new-submit"
						disabledReason={SKILL_WRITE_REASON.create}
					>
						Save as draft
					</Button>
				</div>
			</form>
		</section>
	);
}
