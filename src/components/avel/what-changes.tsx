import { Minus, MoveRight, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * What a request changes, shown above an ActionModal's buttons (ruling 35).
 * Computed client-side from the form against the loaded object, so it
 * describes the request only: what the server will decide is never
 * predicted here.
 */

export type Change = {
	label: string;
	kind: "add" | "remove" | "change";
	from?: ReactNode;
	to?: ReactNode;
	/** Machine values (ids, slugs, counts) set in mono. */
	mono?: boolean;
};

/** A comparable value: text and numbers by value, arrays by their items. */
type Plain = string | number | boolean | null | undefined | readonly Plain[];

const blank = (value: Plain) =>
	value === null ||
	value === undefined ||
	value === "" ||
	(Array.isArray(value) && value.length === 0);

const same = (a: Plain, b: Plain): boolean =>
	Array.isArray(a) && Array.isArray(b)
		? a.length === b.length && a.every((item, i) => same(item, b[i]))
		: a === b || (blank(a) && blank(b));

const shown = (value: Plain): string =>
	Array.isArray(value) ? value.join(", ") : String(value);

/**
 * One change per field that differs, in the fields' order: "add" when it was
 * blank, "remove" when it becomes blank, "change" otherwise. Blank is null,
 * undefined, "" or an empty list, so clearing an optional field and leaving
 * it empty read the same.
 */
export function fieldChanges<T>(
	before: T | undefined,
	after: T,
	fields: readonly { key: keyof T & string; label: string; mono?: boolean }[],
): Change[] {
	const changes: Change[] = [];
	for (const { key, label, mono } of fields) {
		const from = (before?.[key] ?? undefined) as Plain;
		const to = after[key] as Plain;
		if (same(from, to)) continue;
		if (blank(from)) changes.push({ label, kind: "add", to: shown(to), mono });
		else if (blank(to))
			changes.push({ label, kind: "remove", from: shown(from), mono });
		else
			changes.push({
				label,
				kind: "change",
				from: shown(from),
				to: shown(to),
				mono,
			});
	}
	return changes;
}

const KIND_ICON = { add: Plus, remove: Minus, change: MoveRight } as const;
const KIND_WORD = {
	add: "Adds",
	remove: "Removes",
	change: "Changes",
} as const;

export function WhatChanges({
	changes,
	empty = "Nothing changes yet.",
	"data-testid": testId,
}: {
	changes: readonly Change[];
	empty?: string;
	"data-testid": string;
}) {
	return (
		<section
			aria-label="What changes"
			data-testid={testId}
			data-count={changes.length}
			className="flex flex-col gap-1 rounded-sm border border-border bg-app-band px-3 py-2"
		>
			<h3 className="type-caption text-text-subtle">What changes</h3>
			{changes.length === 0 ? (
				<p className="type-small text-text-subtle">{empty}</p>
			) : (
				<ul className="flex flex-col gap-1">
					{changes.map((change) => {
						const Icon = KIND_ICON[change.kind];
						const value = cn(
							"min-w-0 break-words",
							change.mono ? "type-mono-small" : "type-small",
						);
						return (
							<li
								key={change.label}
								data-kind={change.kind}
								className="flex items-baseline gap-2 type-small text-foreground"
							>
								<Icon
									aria-hidden="true"
									className={cn(
										"size-3.5 shrink-0 translate-y-0.5",
										change.kind === "remove"
											? "text-gate-block"
											: change.kind === "add"
												? "text-gate-pass"
												: "text-text-subtle",
									)}
								/>
								<span className="sr-only">{KIND_WORD[change.kind]} </span>
								<span className="shrink-0 text-text-muted">{change.label}</span>
								{change.from !== undefined ? (
									<span
										className={cn(
											value,
											change.kind === "change" &&
												"text-text-subtle line-through",
										)}
									>
										{change.from}
									</span>
								) : null}
								{change.kind === "change" ? (
									<span aria-hidden="true" className="text-text-subtle">
										→
									</span>
								) : null}
								{change.kind === "change" ? (
									<span className="sr-only"> to </span>
								) : null}
								{change.to !== undefined ? (
									<span className={value}>{change.to}</span>
								) : null}
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
