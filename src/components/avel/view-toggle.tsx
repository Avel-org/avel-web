import type { LucideIcon } from "lucide-react";
import { Segmented } from "./segmented";

/*
 * A view switch: v3's segmented control, one option pressed, as on Agents'
 * Cards | Graph and the Board | Table pages. It is the shared Segmented
 * control, so it reads the same as every filter row. The caller keeps the view (in the URL, as a
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
		<Segmented
			data-testid={testIdPrefix}
			legend="View"
			options={options.map(({ id, label, icon }) => ({
				value: id,
				label,
				icon,
			}))}
			value={view}
			onChange={(next) => {
				if (next !== undefined) onChange(next);
			}}
			className={className}
		/>
	);
}
