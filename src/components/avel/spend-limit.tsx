import { type MissionDetail, spendCeilingUsd } from "avel-server/contract";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSetSpendCeiling } from "@/lib/api/mission-lifecycle";
import { ActionModal, ModalField } from "./action-modal";
import { formatUsd } from "./dispatch-budget";
import { useOpenGeneration } from "./use-open-generation";

/*
 * A mission's spend limit, in USD: set when its intake is approved, and on
 * the mission's Spend panel after (PATCH /api/missions/:id). A draft's goes
 * either way; an active mission's only up, since a lower one would halt
 * every running dispatch on the next tick.
 */

/**
 * The typed limit, checked by the contract's own schema: null while empty,
 * else the number or why it is not one.
 */
export function parseSpendLimit(
	text: string,
): { value: number } | { problem: string } | null {
	const trimmed = text.trim().replace(/[$,\s]/g, "");
	if (trimmed === "") return null;
	const value = Number(trimmed);
	if (!Number.isFinite(value)) return { problem: "Give the limit in dollars." };
	if (value <= 0) return { problem: "Give a limit above $0." };
	if (value > 1_000_000)
		return { problem: "The most a limit can be is $1,000,000." };
	return spendCeilingUsd.safeParse(value).success
		? { value }
		: { problem: "Give the limit in whole cents." };
}

/** A dollar field: a "$" before the value, the number typed as text. */
export function SpendLimitInput({
	value,
	onChange,
	...props
}: {
	value: string;
	onChange: (value: string) => void;
	id: string;
	"data-testid": string;
	"aria-invalid": boolean | undefined;
	"aria-describedby": string | undefined;
}) {
	return (
		<div className="relative">
			<span
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center type-mono text-text-subtle"
			>
				$
			</span>
			<Input
				{...props}
				inputMode="decimal"
				autoComplete="off"
				placeholder="500"
				className="pl-6 type-mono tabular-nums"
				value={value}
				onChange={(e) => onChange(e.target.value)}
			/>
		</div>
	);
}

/** Why Save is held, for a limit typed against the mission's current one. */
export function spendLimitHeld(
	parsed: ReturnType<typeof parseSpendLimit>,
	mission: Pick<MissionDetail, "status" | "spendCeilingUsd">,
): string | undefined {
	const current = mission.spendCeilingUsd;
	// An empty field removes the limit: a draft may, an active mission may
	// not (it would lift the only mission-wide cap).
	if (parsed === null) {
		if (current === null) return "Give the limit.";
		return mission.status === "active"
			? "An active mission's limit can't be removed, only raised."
			: undefined;
	}
	if ("problem" in parsed) return parsed.problem;
	if (current !== null && parsed.value === current)
		return "That is the limit already.";
	if (mission.status === "active" && current !== null && parsed.value < current)
		return `An active mission's limit can only go up from ${formatUsd(current)}.`;
	return undefined;
}

/** The Spend panel's control: Set (none yet) or Change, in the one modal. */
export function SpendLimitControl({ mission }: { mission: MissionDetail }) {
	const [open, setOpen] = useState(false);
	const editable = mission.status === "draft" || mission.status === "active";
	if (!editable) return null;
	const unset = mission.spendCeilingUsd === null;
	return (
		<>
			<Button
				type="button"
				size="sm"
				variant="outline"
				data-testid="mission-spend-limit-open"
				onClick={() => setOpen(true)}
			>
				{unset ? "Set spend limit" : "Change spend limit"}
			</Button>
			<SpendLimitModal mission={mission} open={open} onOpenChange={setOpen} />
		</>
	);
}

/** Keyed on each opening, so the field starts from the limit as it is now. */
function SpendLimitModal(props: {
	mission: MissionDetail;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const generation = useOpenGeneration(props.open);
	return <SpendLimitForm key={generation} {...props} />;
}

function SpendLimitForm({
	mission,
	open,
	onOpenChange,
}: {
	mission: MissionDetail;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const set = useSetSpendCeiling(mission.id);
	const initial =
		mission.spendCeilingUsd === null ? "" : String(mission.spendCeilingUsd);
	const [text, setText] = useState(initial);
	const parsed = parseSpendLimit(text);
	const held = spendLimitHeld(parsed, mission);
	const active = mission.status === "active";
	return (
		<ActionModal
			open={open}
			onOpenChange={(next) => {
				if (!next) set.reset();
				onOpenChange(next);
			}}
			size="confirm"
			title={
				mission.spendCeilingUsd === null
					? "Set spend limit"
					: "Change spend limit"
			}
			description={
				active
					? `The most this mission may spend. ${formatUsd(mission.spentUsd)} is spent; an active mission's limit can only go up.`
					: "The most this mission may spend. The runner halts it there. Without one, only each agent's token ceiling applies."
			}
			dirty={text !== initial}
			submitLabel={parsed === null ? "Remove spend limit" : "Save spend limit"}
			onSubmit={() => {
				if (parsed !== null && "problem" in parsed) return;
				const value = parsed === null ? null : parsed.value;
				set.mutate(value, {
					onSuccess: () => {
						toast.success(
							value === null
								? "Spend limit removed."
								: `Spend limit set to ${formatUsd(value)}.`,
						);
						onOpenChange(false);
					},
				});
			}}
			pending={set.isPending}
			submitDisabledReason={held}
			error={set.error}
			data-testid="mission-spend-limit"
		>
			<ModalField
				name="spendCeilingUsd"
				label="Spend limit"
				hint={active ? "USD" : "USD. Leave it empty for no limit."}
				testid="mission-spend-limit-input"
			>
				{(field) => (
					<SpendLimitInput {...field} value={text} onChange={setText} />
				)}
			</ModalField>
		</ActionModal>
	);
}
