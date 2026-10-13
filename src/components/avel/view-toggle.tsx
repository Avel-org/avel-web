import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * A view switch (ruling 36): pressed-state buttons, one pressed, as on
 * Agents' Cards | Graph and the Board | Table pages. The caller keeps the
 * view (in the URL, as a rule); this only shows it and reports a change.
 */

export type ViewOption<V extends string> = {
	id: V;
	label: string;
	icon: LucideIcon;
};

export function ViewToggle<V extends string>({
	options,
	view,
	onChange,
	testIdPrefix,
	className,
}: {
	options: readonly ViewOption<V>[];
	view: V;
	onChange: (view: V) => void;
	/** The fieldset is `${prefix}`, each button `${prefix}-${id}`. */
	testIdPrefix: string;
	className?: string;
}) {
	return (
		<fieldset
			data-testid={testIdPrefix}
			className={cn(
				"inline-flex items-center gap-0.5 rounded-sm border border-border p-0.5",
				className,
			)}
		>
			<legend className="sr-only">View</legend>
			{options.map(({ id, label, icon: Icon }) => (
				<Button
					key={id}
					size="sm"
					variant={view === id ? "secondary" : "ghost"}
					aria-pressed={view === id}
					data-testid={`${testIdPrefix}-${id}`}
					onClick={() => onChange(id)}
				>
					<Icon aria-hidden="true" />
					{label}
				</Button>
			))}
		</fieldset>
	);
}
