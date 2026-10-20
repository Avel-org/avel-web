import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Audit D7, adopted: the filled danger button is a dialog's final confirm,
 * after the dialog has named the effect, and nowhere else. Toolbars, rows,
 * menus and page headers keep the outlined `destructive`. This holds it
 * structurally: every module that uses `destructive-confirm` must render
 * inside a dialog, which here means it imports ActionModal, the Dialog
 * primitives or AlertDialog. The Button that defines the variant is exempt.
 */

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");
const DEFINES = "src/components/ui/button.tsx";

function sources(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sources(path);
		return /\.tsx?$/.test(name) && !name.endsWith(".gen.ts") ? [path] : [];
	});
}

const rel = (path: string) => relative(ROOT, path).split(sep).join("/");

/** Whether a module uses the filled danger variant. */
function usesConfirm(text: string): boolean {
	return /["']destructive-confirm["']/.test(text);
}

/** Whether a module renders a dialog: ActionModal, Dialog or AlertDialog. */
function rendersDialog(text: string): boolean {
	return (
		/from\s+"(?:\.\/action-modal|@\/components\/avel\/action-modal)"/.test(
			text,
		) ||
		/from\s+"@\/components\/ui\/(?:dialog|alert-dialog)"/.test(text) ||
		/\bDialog as DialogPrimitive\b|\bAlertDialog as AlertDialogPrimitive\b/.test(
			text,
		)
	);
}

const files = sources(SRC)
	.map((path) => ({ path: rel(path), text: readFileSync(path, "utf8") }))
	.filter(({ path }) => path !== DEFINES);

describe("the filled danger confirm lives only in dialogs (audit D7)", () => {
	const users = files.filter(({ text }) => usesConfirm(text));

	it("is used, so the check has something to hold", () => {
		expect(users.map((u) => u.path)).toEqual(
			expect.arrayContaining([
				"src/components/avel/action-modal.tsx",
				"src/components/avel/engagement-close.tsx",
				"src/components/avel/client-status-dialog.tsx",
			]),
		);
	});

	it("appears only in modules that render a dialog", () => {
		const outside = users
			.filter(({ text }) => !rendersDialog(text))
			.map(({ path }) => path);
		expect(outside).toEqual([]);
	});

	it("fails a toolbar that uses it (the break test)", () => {
		const toolbar =
			'import { Button } from "@/components/ui/button";\n<Button variant="destructive-confirm">Halt</Button>';
		expect(usesConfirm(toolbar)).toBe(true);
		expect(rendersDialog(toolbar)).toBe(false);
	});
});
