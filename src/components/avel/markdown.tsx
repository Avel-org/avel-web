import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * A small Markdown reader for text the app did not write (Canon's messages,
 * a memory). It builds React elements only, never HTML from the text, so
 * nothing in a message can run or inject markup. The subset is what a brief
 * uses: headings, paragraphs, lists, quotes, fenced code, and inline bold,
 * italic, code and links (http and https only, opened in a new tab).
 */

type Block =
	| { kind: "heading"; level: 1 | 2 | 3; text: string }
	| { kind: "paragraph"; text: string }
	| { kind: "list"; ordered: boolean; items: string[] }
	| { kind: "quote"; text: string }
	| { kind: "code"; text: string };

/** The text's blocks, in order. Exported for its test. */
export function parseBlocks(source: string): (Block & { key: string })[] {
	// Every line break the text may carry is a "\n" here: a lone \r, or
	// U+2028 or U+2029, is a break `.` won't match, which once stopped the
	// heading test from matching while the paragraph test refused the line.
	const lines = source.replace(/\r\n?|\u2028|\u2029/g, "\n").split("\n");
	const found: Block[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i] ?? "";
		if (line.trim() === "") {
			i++;
			continue;
		}
		if (line.startsWith("```")) {
			const body: string[] = [];
			i++;
			while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
				body.push(lines[i] ?? "");
				i++;
			}
			i++; // the closing fence, if any
			found.push({ kind: "code", text: body.join("\n") });
			continue;
		}
		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		if (heading) {
			const level = Math.min(heading[1]?.length ?? 1, 3) as 1 | 2 | 3;
			found.push({ kind: "heading", level, text: heading[2] ?? "" });
			i++;
			continue;
		}
		if (/^>\s?/.test(line)) {
			const body: string[] = [];
			while (i < lines.length && /^>\s?/.test(lines[i] ?? "")) {
				body.push((lines[i] ?? "").replace(/^>\s?/, ""));
				i++;
			}
			found.push({ kind: "quote", text: body.join(" ") });
			continue;
		}
		const bullet = /^\s*[-*+]\s+/;
		const numbered = /^\s*\d+[.)]\s+/;
		if (bullet.test(line) || numbered.test(line)) {
			const ordered = numbered.test(line);
			const marker = ordered ? numbered : bullet;
			const items: string[] = [];
			while (i < lines.length && marker.test(lines[i] ?? "")) {
				items.push((lines[i] ?? "").replace(marker, ""));
				i++;
			}
			found.push({ kind: "list", ordered, items });
			continue;
		}
		const body: string[] = [];
		while (
			i < lines.length &&
			(lines[i] ?? "").trim() !== "" &&
			!/^(#{1,6}\s|>|```|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i] ?? "")
		) {
			body.push(lines[i] ?? "");
			i++;
		}
		// Progress, always: a line no branch above took and the paragraph
		// test refused is a paragraph of its own, so the loop never stalls.
		if (body.length === 0) {
			body.push(lines[i] ?? "");
			i++;
		}
		found.push({ kind: "paragraph", text: body.join(" ") });
	}
	// A block's place in the text: stable for one text, which never reorders.
	return found.map((block, n) => ({ ...block, key: `${block.kind}-${n}` }));
}

// `code`, **bold**, *italic* or _italic_, [text](url): the first wins.
const INLINE =
	/(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))/;

/** One line's inline marks, as elements. */
export function inline(text: string): ReactNode[] {
	const out: ReactNode[] = [];
	let rest = text;
	let n = 0;
	while (rest.length > 0) {
		const m = INLINE.exec(rest);
		if (!m || m.index === undefined) {
			out.push(rest);
			break;
		}
		if (m.index > 0) out.push(rest.slice(0, m.index));
		const token = m[0];
		const key = n++;
		if (m[1]) {
			out.push(
				<code
					key={key}
					className="rounded-xs bg-app-raised px-1 type-mono text-text"
				>
					{token.slice(1, -1)}
				</code>,
			);
		} else if (m[2]) {
			out.push(
				<strong key={key} className="font-semibold text-text">
					{inline(token.slice(2, -2))}
				</strong>,
			);
		} else if (m[3]) {
			out.push(<em key={key}>{inline(token.slice(1, -1))}</em>);
		} else {
			const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
			const label = link?.[1] ?? token;
			const href = link?.[2] ?? "";
			out.push(
				/^https?:\/\//.test(href) ? (
					<a
						key={key}
						href={href}
						target="_blank"
						rel="noopener noreferrer"
						className="text-accent-text underline underline-offset-2"
					>
						{label}
					</a>
				) : (
					// Not a web link: its words, never a target.
					<Fragment key={key}>{label}</Fragment>
				),
			);
		}
		rest = rest.slice(m.index + token.length);
	}
	return out;
}

export function Markdown({
	text,
	className,
	"data-testid": testId,
}: {
	text: string;
	className?: string;
	"data-testid"?: string;
}) {
	return (
		<div
			data-testid={testId}
			// A long word or URL breaks rather than widening its column.
			className={cn(
				"flex min-w-0 flex-col gap-2 type-small break-words text-text",
				className,
			)}
		>
			{parseBlocks(text).map((block) => {
				switch (block.kind) {
					case "heading": {
						const Tag = (["h3", "h4", "h5"] as const)[block.level - 1] ?? "h5";
						return (
							<Tag
								key={block.key}
								className="type-small font-semibold text-text"
							>
								{inline(block.text)}
							</Tag>
						);
					}
					case "list": {
						const List = block.ordered ? "ol" : "ul";
						return (
							<List
								key={block.key}
								className={cn(
									"flex flex-col gap-0.5 pl-5",
									block.ordered ? "list-decimal" : "list-disc",
								)}
							>
								{block.items.map((item, j) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: items have no id; their order is the text's
									<li key={j}>{inline(item)}</li>
								))}
							</List>
						);
					}
					case "quote":
						return (
							<blockquote
								key={block.key}
								className="border-l-2 border-border-strong pl-3 text-text-muted"
							>
								{inline(block.text)}
							</blockquote>
						);
					case "code":
						return (
							<pre
								key={block.key}
								className="app-scroll overflow-x-auto rounded-control bg-app-well px-3 py-2 type-mono text-text"
							>
								<code>{block.text}</code>
							</pre>
						);
					default:
						return <p key={block.key}>{inline(block.text)}</p>;
				}
			})}
		</div>
	);
}
