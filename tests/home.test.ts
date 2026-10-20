import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatComposer } from "../src/components/avel/chat-composer";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { Route } from "../src/routes/index";
import { linkFor } from "../src/shell/nav";
import {
	countText,
	renderPage,
	tagOf,
	tagWithId,
	textOfId,
} from "./render-page";

const SEND_REASON = "Chat is not built yet. avel-server has no chat endpoint.";

/** Text as React's server output escapes it, ready to drop into a RegExp. */
const escapedText = (text: string) =>
	text
		.replaceAll("&", "&amp;")
		.replaceAll("'", "&#x27;")
		.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("Home", () => {
	it("is a capture route, so it works on a phone", () => {
		expect(Route.options.staticData?.device).toBe("capture");
	});

	it("shows its title and definition from the sidebar, visibly", async () => {
		// Read from nav.ts, never hard-coded: the label is the sidebar's to set.
		const { label, purpose } = linkFor("/");
		const html = await renderPage("/");
		expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
		expect(tagOf(html, "topbar-title")).not.toMatch(/\bsr-only\b/);
		expect(html).toMatch(new RegExp(`<h1[^>]*>${label}</h1>`));
		expect(html).toMatch(
			new RegExp(
				`data-testid="topbar-definition"[^>]*>${escapedText(purpose)}<`,
			),
		);
	});

	it("has no resting border under the top bar", async () => {
		expect(tagOf(await renderPage("/"), "topbar")).toMatch(
			/\bborder-transparent\b/,
		);
	});

	it("fills the content area: the body and the chat grow to full height", async () => {
		const html = await renderPage("/");
		expect(tagOf(html, "page")).toMatch(/\bflex-1\b/);
		expect(tagOf(html, "page-body")).toMatch(
			/\bflex-1\b[^"]*\bflex-col\b|\bflex-col\b[^"]*\bflex-1\b/,
		);
		expect(tagOf(html, "page-body")).not.toMatch(/\bp[xy]-\d/);
		expect(tagOf(html, "home-chat")).toMatch(/\bflex-1\b/);
		expect(tagOf(html, "home-chat-thread")).toMatch(/\bflex-1\b/);
	});

	it("puts nothing around the chat: no panel, no not-built box, no queue", async () => {
		const html = await renderPage("/");
		const body = html.slice(html.indexOf('data-testid="page-body"'));
		expect(body).not.toContain("section-panel");
		expect(body).not.toContain("surface-not-built");
		expect(body).not.toContain("home-needs-you");
		expect(tagOf(html, "home-chat")).not.toMatch(
			/\bborder\b|\bbg-app-panel\b|\bshadow-e/,
		);
	});

	it("opens with Canon's one calm, centred line, and says chat is not built as a Reason", async () => {
		const html = await renderPage("/");
		expect(html).toMatch(
			/data-testid="home-chat-prompt"[^>]*>What should we work on\?</,
		);
		const block = html.slice(
			html.lastIndexOf("<div", html.indexOf('data-testid="home-chat-prompt"')),
		);
		expect(block).toMatch(/^<div class="[^"]*\btext-center\b/);
		expect(tagOf(html, "home-chat-note")).toContain('data-slot="reason"');
		expect(html).toMatch(
			/data-testid="home-chat-note"[^>]*>(?:<svg[\s\S]*?<\/svg>)?Canon can&#x27;t answer yet: chat is not built\.</,
		);
	});

	it("offers places to go while chat is not built, each a real route", async () => {
		const html = await renderPage("/");
		const href = (id: string) =>
			tagOf(html, `home-chat-suggestion-${id}`).match(/href="([^"]+)"/)?.[1];
		expect(href("needs-you")).toBe("/missions?status=needs-you");
		expect(href("running")).toBe("/missions?status=active");
		expect(href("client")).toBe("/clients");
		// Under the welcome, above the composer.
		const chips = html.indexOf('data-testid="home-chat-suggestions"');
		expect(chips).toBeGreaterThan(html.indexOf('data-testid="home-chat-note"'));
		expect(chips).toBeLessThan(html.indexOf('data-testid="home-chat-dock"'));
	});

	it("pins the composer below the thread, on the canvas surface", async () => {
		const html = await renderPage("/");
		const thread = html.indexOf('data-testid="home-chat-thread"');
		const dock = html.indexOf('data-testid="home-chat-dock"');
		const composer = html.indexOf('data-testid="chat-composer"');
		expect(dock).toBeGreaterThan(thread);
		expect(composer).toBeGreaterThan(dock);
		const classes = tagOf(html, "home-chat-dock");
		expect(classes).toMatch(/\bsticky\b/);
		expect(classes).toMatch(/\bbottom-0\b/);
		expect(classes).toMatch(/\bbg-card\b/);
	});

	it("sets the prompt at the optical centre: two parts above, three below", async () => {
		const html = await renderPage("/");
		const start = html.indexOf('data-testid="home-chat-thread"');
		const thread = html.slice(
			start,
			html.indexOf('data-testid="home-chat-dock"'),
		);
		// The prompt and its note share one group; the spacers bracket the
		// group, so the prompt leads it and the flex-3 spacer follows it.
		expect(thread).toMatch(
			/<div aria-hidden="true" class="flex-2"><\/div><div[^>]*><p[^>]*data-testid="home-chat-prompt"[^>]*>[^<]*<\/p>[\s\S]*<\/nav><\/div><div aria-hidden="true" class="flex-3"><\/div>/,
		);
	});

	it("puts the cluster on the canvas gutter, not a content edge", async () => {
		const html = await renderPage("/");
		const row = tagOf(html, "topbar-row");
		expect(row).toMatch(/\bw-full\b/);
		expect(row).toMatch(/\bpx-4 md:px-6 lg:px-8\b/);
		expect(row).not.toMatch(/max-w-/);
	});

	it("centres the thread at --chat-max and the wider composer at 52rem", async () => {
		const html = await renderPage("/");
		const thread = tagOf(html, "home-chat-thread");
		const composer = tagOf(html, "home-chat-composer-column");
		for (const tag of [thread, composer]) {
			expect(tag).toMatch(/\bmx-auto\b/);
			expect(tag).toMatch(/\bpx-4 md:px-6 lg:px-8\b/);
		}
		expect(thread).toMatch(/\bmax-w-\(--chat-max\)/);
		expect(composer).toContain("max-w-[52rem]");
		expect(composer).not.toContain("max-w-(--chat-max)");
		// The composer column sits inside the pinned dock.
		const dock = html.indexOf('data-testid="home-chat-dock"');
		expect(
			html.indexOf('data-testid="home-chat-composer-column"'),
		).toBeGreaterThan(dock);
	});

	it("sets the prompt line in the type scale", async () => {
		expect(tagOf(await renderPage("/"), "home-chat-prompt")).toMatch(
			/\btype-display\b/,
		);
	});

	it("disables Send with its reason linked, and prints the reason nowhere visible", async () => {
		const html = await renderPage("/");
		const send = tagOf(html, "chat-composer-send");
		expect(send).toMatch(/\sdisabled=""/);
		const id = send.match(/aria-describedby="([^"]+)"/)?.[1] ?? "";
		expect(textOfId(html, id)).toBe(SEND_REASON);
		expect(tagWithId(html, id)).toMatch(/class="sr-only"/);
		expect(countText(html, SEND_REASON)).toBe(1);
	});
});

describe("the chat composer", () => {
	const html = renderToString(
		createElement(
			TooltipProvider,
			null,
			createElement(ChatComposer, { sendDisabledReason: SEND_REASON }),
		),
	);

	it("takes text: the input is real, not disabled", () => {
		const input = tagOf(html, "chat-composer-input");
		expect(input).toMatch(/^<textarea/);
		expect(input).not.toMatch(/\sdisabled=""/);
	});

	it("labels the input", () => {
		const id = tagOf(html, "chat-composer-input").match(/\sid="([^"]+)"/)?.[1];
		expect(html).toContain(`for="${id}"`);
	});

	it("draws nothing when the field is focused: the caret is the indicator", () => {
		// Ruling 31: no ring, no border step, no fill change, on the pill or
		// the field. The pill has no focus styles of its own at all.
		const pill = tagOf(html, "chat-composer-pill");
		expect(pill).not.toMatch(/focus|has-\[/);
		const input = tagOf(html, "chat-composer-input");
		// The box is the field: the textarea carries no field-surface, so no
		// edge, ring or halo, and no focus styles of its own.
		expect(input).not.toMatch(/\bfield-surface\b/);
		expect(input).not.toMatch(/\bborder\b|\bring-|shadow-|focus/);
		expect(input).toMatch(/\bbg-transparent\b/);
	});

	it("is a v3 card on the field surface, at body size, with room around its contents", () => {
		const pill = tagOf(html, "chat-composer-pill");
		for (const cls of [
			"rounded-dialog",
			"border",
			"border-border",
			"bg-app-field",
			"shadow-card",
			"p-3",
		]) {
			expect(pill).toMatch(new RegExp(`(?:"|\\s)${cls}(?:"|\\s)`));
		}
		const input = tagOf(html, "chat-composer-input");
		// The primitive's type-body is the size; no ad hoc size fights it.
		expect(input).toMatch(/\btype-body\b/);
		expect(input).not.toMatch(/text-\[|\btext-(base|sm)\b/);
	});

	it("floats the box and its glow together, never the field, still while typing", () => {
		const float = tagOf(html, "chat-composer-float");
		expect(float).toMatch(/\banimate-float\b/);
		expect(float).toContain("focus-within:[animation-play-state:paused]");
		expect(float).toContain("motion-reduce:animate-none");
		// One wrapper moves both, so the glow can never drift from the box.
		const inside = html.slice(
			html.indexOf('data-testid="chat-composer-float"'),
		);
		expect(inside.indexOf('data-testid="chat-composer-glow"')).toBeGreaterThan(
			0,
		);
		expect(inside.indexOf('data-testid="chat-composer-pill"')).toBeGreaterThan(
			0,
		);
		expect(tagOf(html, "chat-composer-input")).not.toMatch(/animate-/);
	});

	it("pulses a blurred baby blue glow behind and below the box, out of reach", () => {
		const glow = tagOf(html, "chat-composer-glow");
		expect(glow).toContain('aria-hidden="true"');
		for (const cls of ["pointer-events-none", "absolute", "-z-10"])
			expect(glow).toContain(cls);
		expect(tagOf(html, "chat-composer-float")).toMatch(/\bisolate\b/);
		const pulse = tagOf(html, "chat-composer-glow-pulse");
		for (const cls of ["animate-glow", "bg-accent", "blur-2xl", "rounded-full"])
			expect(pulse).toContain(cls);
		expect(pulse).toContain(
			"group-focus-within/float:[animation-play-state:paused]",
		);
		expect(pulse).toContain("motion-reduce:animate-none");
	});

	it("sets the glow stronger in light, the default, and soft and static under reduced motion", () => {
		const glow = tagOf(html, "chat-composer-glow");
		expect(glow).toMatch(/\sopacity-80\s/);
		expect(glow).toContain("motion-reduce:opacity-50");
		expect(glow).toContain("in-[.dark]:opacity-55");
		expect(glow).toContain("in-[.dark]:motion-reduce:opacity-35");
	});

	it("draws the float and the glow from app.css: a 4s float, the pulse half a period ahead", () => {
		const css = readFileSync(
			new URL("../src/styles/app.css", import.meta.url),
			"utf8",
		);
		expect(css).toMatch(
			/@utility animate-float \{\s*animation: avelFloat 4s ease-in-out infinite;/,
		);
		expect(css).toMatch(
			/@utility animate-glow \{\s*animation: avelGlow 4s ease-in-out -2s infinite;/,
		);
		expect(css).toMatch(/50% \{\s*transform: translateY\(-6px\);/);
	});

	it("is one box: the field above, the tool row below", () => {
		const pill = tagOf(html, "chat-composer-pill");
		expect(pill).toMatch(/\bflex-col\b/);
		const input = html.indexOf('data-testid="chat-composer-input"');
		const row = html.indexOf('data-testid="chat-composer-tool-row"');
		const pillEnd = html.indexOf('data-testid="chat-composer-send"');
		expect(input).toBeGreaterThan(
			html.indexOf('data-testid="chat-composer-pill"'),
		);
		expect(row).toBeGreaterThan(input);
		expect(pillEnd).toBeGreaterThan(row);
	});

	it("puts the tools on the left and Send on the right of the tool row", () => {
		expect(tagOf(html, "chat-composer-tool-row")).toMatch(
			/\bjustify-between\b/,
		);
		const tools = html.indexOf('data-testid="chat-composer-tools"');
		const send = html.indexOf('data-testid="chat-composer-send"');
		expect(tools).toBeGreaterThan(-1);
		expect(send).toBeGreaterThan(tools);
		expect(tagOf(html, "chat-composer-tools")).toMatch(
			/role="toolbar"[^>]*aria-label="Tools"|aria-label="Tools"[^>]*role="toolbar"/,
		);
	});

	/** The toolbar's markup, up to the start of Send's own <button> tag. */
	const toolbarOf = (markup: string) =>
		markup.slice(
			markup.indexOf('data-testid="chat-composer-tools"'),
			markup.lastIndexOf(
				"<button",
				markup.indexOf('data-testid="chat-composer-send"'),
			),
		);

	it("holds exactly the chosen tools, in order: attach, model, web search", () => {
		const toolbar = toolbarOf(html);
		expect(toolbar.match(/<button/g)).toHaveLength(3);
		const ids = [
			...toolbar.matchAll(/data-testid="(chat-composer-tool-[a-z]+)"/g),
		].map((m) => m[1]);
		expect(ids).toEqual([
			"chat-composer-tool-attach",
			"chat-composer-tool-model",
			"chat-composer-tool-search",
		]);
		expect(toolbar).not.toContain("add-context");
	});

	for (const [id, reason] of [
		["chat-composer-tool-attach", "File upload is not built yet."],
		["chat-composer-tool-model", "Model choice is not built yet."],
		["chat-composer-tool-search", "Web search is not built yet."],
	] as const) {
		it(`${id}: disabled by state, its reason linked and only in the tooltip`, () => {
			const tool = tagOf(html, id);
			expect(tool).toMatch(/\sdisabled=""/);
			expect(tool).toContain('data-variant="ghost"');
			const describedBy = tool.match(/aria-describedby="([^"]+)"/)?.[1] ?? "";
			expect(textOfId(html, describedBy)).toBe(reason);
			expect(tagWithId(html, describedBy)).toMatch(/class="sr-only"/);
			expect(countText(html, reason)).toBe(1);
		});
	}

	it("sizes every tool at 28px, the small control", () => {
		expect(tagOf(html, "chat-composer-tool-attach")).toContain(
			'data-size="icon-sm"',
		);
		expect(tagOf(html, "chat-composer-tool-search")).toContain(
			'data-size="icon-sm"',
		);
		expect(tagOf(html, "chat-composer-tool-model")).toContain('data-size="sm"');
	});

	it("names each tool: icons by aria-label, the model by its word", () => {
		expect(tagOf(html, "chat-composer-tool-attach")).toContain(
			'aria-label="Attach file"',
		);
		expect(tagOf(html, "chat-composer-tool-search")).toContain(
			'aria-label="Web search"',
		);
		expect(html).toMatch(
			/data-testid="chat-composer-tool-model"[^>]*>Model<svg[^>]*lucide-chevron-down/,
		);
	});

	it("makes web search a toggle, unpressed", () => {
		expect(tagOf(html, "chat-composer-tool-search")).toContain(
			'aria-pressed="false"',
		);
		expect(tagOf(html, "chat-composer-tool-attach")).not.toContain(
			"aria-pressed",
		);
	});

	it("names no model: no list exists, so none is shown", () => {
		const toolbar = toolbarOf(html);
		expect(toolbar).not.toMatch(
			/claude|opus|sonnet|haiku|fable|gpt|gemini|llama|mistral|o\d-|\b\d+(?:\.\d+)?b\b/i,
		);
		expect(tagOf(html, "chat-composer-tool-model")).not.toMatch(
			/aria-haspopup|role="combobox"/,
		);
	});

	it("renders given tools in the slot, in place of the placeholder", () => {
		const withTools = renderToString(
			createElement(
				TooltipProvider,
				null,
				createElement(ChatComposer, {
					sendDisabledReason: SEND_REASON,
					tools: createElement(
						"button",
						{ type: "button", "data-testid": "tool-x" },
						"X",
					),
				}),
			),
		);
		const start = withTools.indexOf('data-testid="chat-composer-tools"');
		expect(withTools.indexOf('data-testid="tool-x"')).toBeGreaterThan(start);
		for (const tool of ["attach", "model", "search"]) {
			expect(withTools).not.toContain(`chat-composer-tool-${tool}`);
		}
	});
});
