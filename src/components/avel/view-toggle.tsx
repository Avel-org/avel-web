import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tabsListVariants } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/*
 * A view switch: v3's segmented control, one option pressed, as on Agents'
 * Cards | Graph and the Board | Table pages. The track is the tabs' segmented
 * list and each option the shared segment Button, so it reads the same as
 * every other segmented row. The caller keeps the view (in the URL, as a
 * rule); this only shows it and reports a change.
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
			className={cn(tabsListVariants({ variant: "default" }), className)}
		>
			<legend className="sr-only">View</legend>
			{options.map(({ id, label, icon: Icon }) => (
				<Button
					key={id}
					type="button"
					variant="segment"
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
