import { Search, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { Kbd } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/*
 * One search box (v3 .field): the field surface with its focus ring, a 14px
 * search icon, a placeholder, a clear button once something is typed, and an
 * optional key hint ("/" focuses it from anywhere outside a field). 32px tall
 * at the control radius. The label is for screen readers; the placeholder
 * says what it searches.
 */
export function SearchField({
	value,
	onChange,
	label,
	placeholder,
	shortcut,
	className,
	"data-testid": testId,
}: {
	value: string;
	onChange: (value: string) => void;
	/** What it searches, for screen readers: "Search teams". */
	label: string;
	placeholder: string;
	/** A key that focuses it from outside any field, shown as a hint. */
	shortcut?: "/";
	className?: string;
	"data-testid": string;
}) {
	const id = useId();
	const input = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!shortcut) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== shortcut || event.metaKey || event.ctrlKey) return;
			const target = event.target as HTMLElement | null;
			if (
				target?.isContentEditable ||
				target?.closest("input, textarea, select, [role=combobox]")
			)
				return;
			event.preventDefault();
			input.current?.focus();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [shortcut]);

	return (
		<div
			data-testid={testId}
			className={cn(
				"field-surface flex h-control-md items-center gap-2 rounded-control px-2.5 transition-[border-color,box-shadow] duration-(--duration-micro) ease-avel",
				className,
			)}
		>
			<Search
				aria-hidden="true"
				className="size-3.5 shrink-0 text-text-subtle"
			/>
			<label htmlFor={id} className="sr-only">
				{label}
			</label>
			<input
				ref={input}
				id={id}
				type="search"
				value={value}
				autoComplete="off"
				spellCheck={false}
				placeholder={placeholder}
				aria-keyshortcuts={shortcut}
				onChange={(event) => onChange(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Escape" && value !== "") {
						event.preventDefault();
						onChange("");
					}
				}}
				data-testid={`${testId}-input`}
				className="min-w-0 flex-1 bg-transparent type-body text-text outline-none placeholder:text-text-subtle [&::-webkit-search-cancel-button]:hidden"
			/>
			{value !== "" ? (
				<button
					type="button"
					aria-label="Clear search"
					data-testid={`${testId}-clear`}
					onClick={() => {
						onChange("");
						input.current?.focus();
					}}
					className="-mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-xs text-text-subtle transition-colors duration-(--duration-micro) ease-avel hover:bg-app-raised hover:text-text"
				>
					<X aria-hidden="true" className="size-3.5" />
				</button>
			) : shortcut ? (
				<Kbd aria-hidden="true" data-testid={`${testId}-kbd`}>
					{shortcut}
				</Kbd>
			) : null}
		</div>
	);
}
