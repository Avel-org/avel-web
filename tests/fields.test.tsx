import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { tagOf } from "./render-page";

const fields = {
	input: tagOf(renderToString(<Input data-testid="f" />), "f"),
	textarea: tagOf(renderToString(<Textarea data-testid="f" />), "f"),
	select: tagOf(
		renderToString(
			<Select>
				<SelectTrigger data-testid="f">
					<SelectValue placeholder="Pick one" />
				</SelectTrigger>
			</Select>,
		),
		"f",
	),
};

// v3 .field with UX 2: a strong hairline at rest; focused, a solid 1px ring
// in the focus colour and a soft halo. Both live in app.css's field-surface,
// so every field shows focus the same way.
describe("text fields are v3 fields", () => {
	for (const [name, tag] of Object.entries(fields)) {
		it(`${name}: is the field surface, at the control radius`, () => {
			expect(tag).toMatch(/\bfield-surface\b/);
			expect(tag).toMatch(/\brounded-control\b/);
		});

		it(`${name}: draws no ring, outline or glow of its own`, () => {
			expect(tag).not.toMatch(
				/focus-visible:ring|focus-visible:outline-(?!none)|focus-visible:border-|shadow-\[|glow/,
			);
		});

		it(`${name}: goes flat and quiet when disabled (v3 UX 6)`, () => {
			expect(tag).toContain(
				"disabled:cursor-not-allowed disabled:bg-app-raised disabled:text-text-subtle",
			);
		});
	}

	it("select: suppresses the global ring, which app.css leaves on buttons", () => {
		expect(fields.select).toContain("focus-visible:outline-none");
	});
});

const css = readFileSync(
	new URL("../src/styles/app.css", import.meta.url),
	"utf8",
);
const surface = css.slice(
	css.indexOf("@utility field-surface {"),
	css.indexOf("@layer base"),
);

// A white box with a grey edge read as the browser's default field. At rest
// a field is filled a step below the panel, with a quiet edge and inset
// shade; hovered its edge firms; focused it lifts to the panel and rings.
describe("the field surface", () => {
	it("rests filled, with a quiet edge and a hairline of inset shade", () => {
		expect(surface).toContain("background-color: var(--color-field-fill);");
		expect(surface).toContain("border: 1px solid var(--color-field-edge);");
		expect(surface).toContain("box-shadow: var(--shadow-field);");
	});

	it("firms its edge on hover, but not while focused or disabled", () => {
		expect(surface).toMatch(
			/&:hover:not\(:focus-within\):not\(:disabled\)[^{]*\{\s*border-color: var\(--color-field-edge-hover\);/,
		);
	});

	it("lifts when focused, under the field's own ring and halo", () => {
		expect(surface).toMatch(
			/&:focus-within \{\s*background-color: var\(--color-field-fill-focus\);\s*border-color: var\(--color-field-focus\);\s*box-shadow:\s*0 0 0 1px var\(--color-field-focus\),\s*0 0 0 4px var\(--color-field-halo\);/,
		);
	});

	it("defines the fill, edges and shade in both themes", () => {
		const start = css.indexOf(".dark {");
		const dark = css.slice(start, css.indexOf("\n}", start));
		const light = css.slice(0, start);
		for (const token of [
			"--color-field-fill",
			"--color-field-edge",
			"--color-field-edge-hover",
			"--color-field-fill-focus",
			"--color-field-focus",
			"--color-field-halo",
			"--shadow-field",
		]) {
			expect(light, token).toContain(`${token}: `);
			expect(dark, `.dark ${token}`).toContain(`${token}: `);
		}
	});
});
