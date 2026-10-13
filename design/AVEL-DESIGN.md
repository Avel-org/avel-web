# AVEL design system

Version 2026-10-05. Source of truth for the Command Center frontend. The live showcase is `AVEL System.dc.html`; this file is the written half. Where the two disagree, the showcase is wrong and this file wins.

## 1. What the interface is for

AVEL runs AI agents on real client work and refuses to ship anything it cannot prove. The interface therefore has one job: it must never look more finished, more certain, or more enforced than the system actually is. Evidence, hashes and verification results are content, not decoration. Every rule below follows from that.

Consequences:

- A button that cannot act is disabled by state, with its reason printed beside it. Never greyed by styling alone.
- Absence is stated, never faked. "Not built", "none attached", "none set", "Not yet derived." and "—" are four distinct absences and stay distinct.
- Attested is not mechanical, stale is not fresh, reconstructed is not recorded. Each pair has its own glyph and label.
- Colour never carries meaning alone. Every state has a glyph and a word.

## 2. Palette

Dark is the default. Light is applied by `.light` on the app shell. Use exactly these values; never re-derive.

### Surfaces, dark

| token | hex | role |
|---|---|---|
| bg | #1a1d23 | desktop, sidebar, wells for machine output |
| recessed | #1a1d23 | same as bg on dark |
| panel | #2a2e36 | cards, panels, tables |
| band | #30343c | panel and table header strips, one step above panel |
| field | #30343c | inputs, textarea, select, checkbox, radio |
| raised | #393e46 | hover, active row, active nav item |
| float | #4a5058 | popover, dropdown, dialog, sheet, command |
| skeleton | #333842 | loading rows |
| text | #eeeeee | |
| text-muted | #a0a8b0 | secondary text, 5.65:1 on panel |
| text-subtle | #8b939e | labels you scan but never decide on, 4.39:1 on panel |
| border | rgb(238 238 238 / 0.08) | hairline, rest |
| border-strong | rgb(238 238 238 / 0.16) | raised surfaces, inputs, chips |

Adjacent surfaces differ by roughly 3–5 L*, not by contrast ratio. Band and field were added during the build because the desktop colour inside a panel read as a hole; both sit one step above panel.

### Surfaces, light

| token | hex |
|---|---|
| bg | #eaedf0 |
| recessed | #f2f4f6 |
| panel | #ffffff |
| band | #f2f4f6 |
| field | #f7f8fa |
| raised | #ffffff + border-strong + shadow e2 |
| float | #ffffff + border-strong + shadow e3 |
| skeleton | #eeeeee |
| text | #1a1d23 |
| text-muted | #4a5058 |
| text-subtle | #6e7681 |

Light cannot go up from white, so extra steps go down and elevation above the panel is carried by border and shadow only. Do not "fix" this by making cards grey.

### Accent

One chromatic colour. Nothing else is cyan or blue.

| token | dark | light |
|---|---|---|
| accent | #0092ca | #0092ca |
| accent-text | #0092ca | #0078ab |
| accent-soft | rgb(0 146 202 / 0.12) | rgb(0 146 202 / 0.10) |
| ink on accent | #1a1d23 | #1a1d23 |

### Gate states (triples: solid, soft 12%, line 35%)

| state | dark | light | glyph |
|---|---|---|---|
| pass | #22c55e | #15803d | filled ring |
| block | #ef4444 | #b91c1c | filled ring |
| warn | #f59e0b | #a16207 | filled ring |
| pending | #a0a8b0 | #393e46 | empty ring |
| stale | #8b939e | #6e7681 | ring with a broken segment |

Pending and stale are neutral on purpose so "pending" never collides with the accent. Mechanical gates are a solid ring; attested gates are a dashed ring and name the attester.

### Diff states (what a delivery would do, not whether it may proceed)

create = pass colour · overwrite = warn colour, never block · unchanged = text-muted · preserve = text-subtle. Zero counts are a dash in subtle.

### Export status vocabulary

pending, rendering, verifying, previewing, delivering are pending-toned (in motion). previewed, pr-open are warn (waiting on a person). done is pass. failed is block.

### Interaction overlays

hover rgb(255 255 255 / 0.035) · active 0.060 · selected accent-soft · disabled opacity 0.35. Light inverts the first two to rgb(26 29 35 / …). Disabled is opacity, not a colour: a disabled danger button still reads as danger.

## 3. Type

| role | face | size/line | weight |
|---|---|---|---|
| display | Space Grotesk | 32/36 | 500, letter-spacing −0.01em |
| h1 | Space Grotesk | 24/30 | 500 |
| h2 | Space Grotesk | 18/24 | 500 |
| panel title | Space Grotesk | 14/20 | 500 |
| body | Inter | 14/20 | 400 |
| small | Inter | 13/18 | 400 |
| caption | Inter | 12/16 | 400, text-muted |
| mono | Geist Mono | 13/18 | hashes, paths, IDs, vocabulary terms |
| mono small | Geist Mono | 12/16 | compact rows |
| editorial | Fraunces italic | 16/22 | one use: the refusal line "AVEL will not ship this." |

Sentence case everywhere. No uppercase and no positive letter-spacing on any heading or label. Mono is only for machine text; never a heading or a group label. Machine output always sets tabular numerals.

## 4. Radius, elevation, spacing, motion

Radius: 4 chips, tags, inputs, focus ring · 6 buttons, rows · 10 cards, panels, tables · 14 popovers, sheets · 18 modals, app frame · full pills, badges, avatars. One radius per element, never mixed.

Elevation: e0 none · e1 `0 1px 2px rgb(0 0 0 / .40)` resting card · e2 `0 4px 14px rgb(0 0 0 / .45)` popover · e3 `0 16px 44px rgb(0 0 0 / .55)` modal, sheet. Light: .07 / .10 / .14 with rgb(26 29 35). Above the panel, elevation is border plus shadow, not lighter fills.

Z: base 0 · raised 10 · window 100–199 (reserved) · dock 200 · popover 300 · modal 400 · toast 500.

Density: comfortable 12px row padding for reading; compact 6px for scanning a 40-row gate result. Set on the container, not the row.

Motion: micro 120ms (hover, focus, toggles) · state 200ms (panel change, stamp, tab indicator) · enter 320ms (entrances, gate draw-on). Easing `cubic-bezier(0.2, 0.7, 0.3, 1)`. Nothing bouncy, no overshoot. One continuous loop at rest per page: the period in the wordmark (3s, opacity 1 → 0.85). The skeleton pulse runs only while loading. Nothing else repeats. Reduced motion: every state still reads with motion off.

Signature moments, one per family: gate ring draws on as it resolves; verdict stamp lands 1.15 → 1 in 200ms and stops (block adds a 2px displacement, no shake); hash pair fills its shared prefix left to right; proposal collapses to a receipt on approve; tab indicator slides.

## 5. Focus and active states

Focus: 2px accent outline at 2px offset, on the radius scale. On the chat composer it is drawn on the pill wrapper so it follows the pill, with the border stepped up to border-strong. No glow, blur, bloom, gradient wash or pulse anywhere.

Nav active item: raised fill plus a static 2px accent bar along the bottom edge, text at full colour. Collapsed rail keeps the bar and names the link in a tooltip.

Accent left edges are functional markers only: the selected list row and the AVEL-addition block that separates AVEL's text from imported text. Never a card style.

## 6. Shell

Sidebar-only, full-bleed, no mat and no window border. Sidebar sits on bg, separated by a border, 248px open and 56px collapsed, drawer below md.

Twelve links in three groups:
- Work: Home, Missions, Clients
- Library: Agent templates, Skills, Sources, Presets, Playbooks
- System: Activity, Repositories, Connections, Account

Sidebar anatomy: brand block (A. mark, "avel", workspace name), search with ⌘K badge, nav groups, Recent work grouped Today / Yesterday / Last week with mono status chips and a fade mask, footer with account, theme toggle and collapse.

Top bar: title in h2, then a subtitle (a count) or a definition (one plain sentence). Breadcrumb only when the parent differs from the title. Action slot has primary and secondary tiers and reserves no space when empty. Pages never print their own h1.

Movable evidence windows remain a proposal, off by default; the z band 100–199 is reserved.

## 7. Meta strings

No middle dots in meta. Header subtitles join facts with commas: "full-build, sprint 2", "14 skills, 2 revoked, from 3 sources". Facts inside a row are separate elements with a gap. Gate badge: "attested, not run". Skill type: "Capability (declarative)". The one exception is agent identity, name and territory ("Atlas · scheduling"), inside the identity chip only.

## 8. Four states, plus one

Every data region has loading, empty, error and success, enforced by one wrapper.

- Loading: content-shaped skeleton in the real widths; Missions loads six rows. Pulse stops when content lands.
- Empty: explains why it is empty and what to do. First-run empty state is onboarding.
- Error: says what happened and whether anything was written. Try again appears only when retrying could change the result.
- Not built: a fifth state, dashed border on a recessed fill. A stated absence, never a fake.

Every solid border bounds something real; a dashed border means a placeholder.

## 9. Device classes

Each route declares one: capture (works on a phone), construction (desktop only; on a phone its actions are links to desktop routes, never inline controls), approve (read and approve; a phone can approve a preview but cannot start one). Hit targets on a phone are 44px minimum.

## 10. Components and their shadcn equivalents

Primitives keep shadcn's anatomy and prop names (new-york, neutral base, lucide icons) and are restyled fully: Button, Input, Textarea, Select, Checkbox, Switch, Radio, Tabs, Badge, Tooltip, Popover, DropdownMenu, Dialog, Sheet, Command, Table, Toast, Skeleton, Separator, ScrollArea, Breadcrumb, Avatar. Button adds hold-to-confirm (320ms, for deliver and abort) and disabled-with-reason. Badge adds a neutral mono tag for values with no declared vocabulary (mission status, IDs, slugs, waves, runtime).

AVEL components built: gate glyph and row, verdict stamp, hash and hash pair, blast radius table (base SHA and read age always visible), proposal card (approve collapses to a receipt; expired keeps content at 0.6 opacity with Approve truly disabled), finding entry, device-boundary notice, mission list row, section panel, roster row (slug, runtime with its rule in words, kind, wave, three mounts, shared-path notes), library list and reader, filter chips with counts, check line and banner, Command Center chat (AI SDK useChat parts: text, reasoning, tool-invocation; status ready / submitted / streaming / error).

Proposed, not in the data model yet, never present as built: agent identity chip with sides, role card, skill card with layer and granted tools, identity viewer, module timeline M0–M9, token budget meter, coherence panel.

## 11. Rulings, 2026-10-05

1. Sentence case everywhere; mono only for machine text.
2. Composer focus is the 2px ring; underglow removed; "glow" deleted as a pattern.
3. Twelve nav links; "16" was a stale field count.
4. No middle dots in meta strings; agent identity is the exception.
5. Accent left edges are functional markers only.
6. Agents use the code's structure; brief-only components stay marked proposed.
7. Light mode: globals-patch.css exactly as applied.
8. Sidebar-only shell; evidence windows remain a proposal.
9. One loop at rest, the wordmark period; skeleton pulse only while loading.
10. Truncated copy replaced with the exact strings from the code.

### Operator rulings, 2026-10-05 (later the same day)

These supersede the sections they name.

11. A disabled button's reason shows in a tooltip, not printed beside it (supersedes section 1 and section 12). The button keeps the real `disabled` attribute. The tooltip trigger is a focusable wrapper, because a disabled button receives no pointer or focus events, and a tap opens it on touch. The reason stays linked by aria-describedby, so screen readers always get it.
12. The active nav item carries its accent on the right edge, as a 2px bar with a soft glow fading leftward. There is no full-width fill. This supersedes section 5's bottom bar and its "no glow" rule, for this element only.
13. The sidebar nests links: Library holds Catalog (Agent templates, Skills, Sources), and System holds Settings (Repositories, Connections, Account). The twelve destinations are unchanged.
14. The collapse control sits at the top of the sidebar. Search leaves the sidebar for an icon in a global header cluster (search, notifications, theme) on every page.
15. The sidebar footer shows the operator: name and role.
16. Home is chat-first: full height, with only the chat input and no panel around it.
17. The content sits on an inset, rounded canvas: 8px from the viewport's top, right and bottom edges, with an 18px radius. The canvas scrolls; the window does not. The sidebar stays on bg with no border, and the gap is the seam. Below md the canvas is edge to edge with no radius. Anything rounded inside the canvas follows the concentric rule: inner radius equals outer radius minus the padding between them. This supersedes section 6's "full-bleed, no mat".
18. Recent work leaves the sidebar until the contract can supply mission activity. The brand block shows "Command Center" until workspaces exist in the data model. Both supersede section 6's sidebar anatomy for now.
19. On the collapsed rail, the active item keeps ruling 12's right-edge mark. The collapse control sits under the mark, so the brand row grows by 40px on the rail, animated. The canvas carries a hairline border, so its edge reads against light-mode bg.
20. A disabled menu item states its reason inline in the item. Ruling 11's tooltip applies to buttons. Browser tab titles take the form "Missions · AVEL": a tab title is not a meta string, so ruling 4 does not apply to it.
21. The chat composer floats: a slow 4s, 6px up and down movement. It pauses while the field has focus and stops under reduced motion. It is the second loop at rest, beside the mark's period. This supersedes section 4's "one continuous loop".
22. Text fields show focus by their border stepping from border-strong to text-muted, with no ring and no accent (operator request). Every other focusable element keeps the 2px accent ring. This supersedes section 5, and BUILDING-AVEL-WEB.md's "in the accent color", for fields only.
23. A soft accent glow pulses under the chat composer, slowly, in step with its float (operator request). Together they are the composer's one loop at rest. Like the nav glow (ruling 12), it is an exception to ruling 2 for this element only, and it stops under reduced motion.
24. New palette (operator request: dark was too light with a too-dark sidebar, and light was too bright). This supersedes section 2's surface, text and gate values. `src/styles/app.css` holds them; `avel-tokens.css` is now historical. Every text and gate colour measures at least 4.5:1 on panel and band.
    - Dark: bg/sidebar #1b1e24, panel/canvas #202329 (2.4 L* apart; the old gap was 8.2), band and field #262a31, raised #2c3038, float #33373f, skeleton #2a2e35. Text #ececec, muted #a3abb3, subtle #8d95a0. accent-text #2ba3d6 (the old #0092ca measured 3.87:1 as text). block #f26363 (the old #ef4444 measured 3.62:1). The brand accent #0092ca is unchanged for fills.
    - Light, smooth grey: bg/sidebar #e3e5e9, panel/canvas #f2f3f5 (no longer white), band #eaecef, field #fafafb, raised #f9fafb, float #fcfcfd. Muted #454b53, subtle #5f6670, accent-text #006c99, pass #137a39, block #b01b1b, warn #8f5806 (the old subtle, accent-text, pass and warn fell below 4.5:1 on grey).
25. Dark surfaces move onto Radix slate's dark scale (operator request: the content area was still too light and the sidebar too dark). This supersedes ruling 24's dark surfaces; ruling 24's light values stand. Radix reserves steps 1-2 for app backgrounds and sidebars; the old canvas, #202329, sat at steps 3-4. The canvas is now the darkest surface and the sidebar sits 2 L* above it.
    - canvas/panel #141517, sidebar/bg #18191b, recessed #111113, band #1c1d20, field #202124, float #232428, raised #26282c, skeleton #222326.
    - Text #edeef0 is unchanged in effect. Muted #b0b4ba and subtle #8a8f98 are slate 11 and an AA-safe step below it. Every text and gate colour is at least 4.5:1 on every surface.
26. Menus (dropdown, select, command list) use a 10px radius with 4px padding and 6px rows (concentric), 32px rows (36px in the palette), and caption-style group labels. A row's highlight is its focus indicator, so menu rows draw no ring. Content popovers keep 14px. The modal scrim is lighter in light mode, and toasts follow the theme.
27. When the contract adds the export status `closed` (a PR closed without merging), its tone is stale: it is terminal, but not a gate failure. Until the contract defines it, no UI shows it. Export tones key on the contract's status union, so a status with no tone fails the build.
28. One family: Geist for display, headings and prose, Geist Mono for machine text (operator request: clean, minimalist, professional). This supersedes section 3's faces; its sizes, line heights and weights stand. Space Grotesk and Inter are removed. Fraunces is removed too: nothing rendered it, and the refusal line it was reserved for is not built. Geist sets slightly wider than Inter, so tracking tightens: display and h1 −0.02em, h2 −0.015em, panel title −0.01em, body and small −0.005em. Inter-only font features (cv11, ss01) are dropped.
29. Placeholder data, for the mission detail page only (operator request, while avel-server lacks per-mission exports, team entries, halt reasons and spend). Sections the contract can't supply yet render clearly labelled sample data instead of "not built". Every placeholder section carries a dashed "Sample data" pill, names the missing route in its tooltip, and sits behind the same layout the real data will use. Placeholder values live in one module (`mission-placeholders.ts`), are never sent anywhere, and never mix into a real field. A placeholder section switches to real data, and its placeholder is deleted, when its route lands. This supersedes section 1's "absence is stated, never faked" for that page only.
30. Stainless Steel (operator request): machined, brushed stainless, restrained and industrial; not chrome, not skeuomorphic. This supersedes ruling 25's surface values, ruling 28's faces, section 3's sizes and section 4's 6px button radius.
    - Palette: cool blue-grey steel, hue about 210-215 at very low chroma. Dark "Gunmetal": sidebar and window #121518, canvas #16191d (2 L* above the frame), recessed #0f1215, band #1b1f24, field #1d2126, raised #22272d, float #262b31; borders rgb(200 215 230 / 0.08) and 0.14; text #e8ecf0, muted #aab3bd, subtle #9da6b0. Light "Polished steel", never white: sidebar #d5dae0, canvas #e4e8ec, recessed #dce0e5, band #dde2e7, field #f1f3f6, raised #eef1f4, float #f5f7f9; borders rgb(30 40 52 / 0.10) and 0.18; text #14181d, muted #3a434d, subtle #4c5561. The accent stays #0092ca; accent text is #47afdb dark and #005b82 light. Gates keep their meaning, re-measured: dark block #f58585, pending and stale follow muted and subtle; light pass #0e622d. Every text and gate colour clears 4.5:1 on every surface, and on each surface under the sheen, hover, active and selected overlays, in both themes; `tests/steel.test.ts` computes it from app.css.
    - Metal is suggested by three things only, each a token and a utility: a faint vertical sheen, lighter at the top (`sheen`); a 1px top highlight, the light catching a chamfer (`edge-highlight`); and a near-invisible horizontal grain at 1.5-2% (`brushed`), on the sidebar and the top bar only, never behind dense text. `surface-steel` is sheen plus edge. Fields are flat and set in (`field-inset`). Engraved labels (`engraved`) carry a 1px shadow, above in dark and below in light. Edge, inset and elevation compose in any order.
    - Steel surfaces: the canvas's edge, the top bar (brushed), panel headers (SectionPanel), DataPanel, Surface's error card, the empty-state tile, popovers, menus, select lists, dialogs, sheets, the command menu, the operator card, the mission page's cards, and secondary and outline buttons. The primary button stays a solid accent.
    - Buttons are pills: rounded-full at every variant and size, icon buttons are circles, with a step more horizontal padding. Chip-like controls follow: segmented controls (a pill track with pill segments), filter chips, tabs. Rows and surfaces keep their radii: nav plates, menu items, list rows, tree items, panel header rows, inputs and cards. `tests/pill-buttons.test.ts` scans the source.
    - Type: IBM Plex Sans (variable) for display, headings and prose, IBM Plex Mono for machine text. Sizes: display 33/40, h1 25/32, h2 19/26, panel title 15/22, body 15/22, small 14/20, caption 12.5/16, mono 13.5/20. Headings track -0.01em (panel title -0.005em), body 0.
    - Navigation: rows 36px, Plex 15px at 450, muted at rest; hover is a soft steel fill; the current row sits on a machined plate (raised, sheen, top edge) with its label at full colour and 500 and its icon in accent text, and ruling 12's right-edge glow rides the plate as it slides. Group labels are engraved. Nested links hang off a ruler: a 1px line with a 4px tick at each child, a 6px accent tick at the current child; children are 32px and 14px, under the parent's label.
31. The chat composer shows no focus at all (operator request): clicking or focusing its field draws no ring, no border step and no fill change; the caret is the indicator. This applies to the chat composer only and supersedes ruling 22 there; every other text field keeps ruling 22's border step, and every other control keeps the 2px ring.
32. Ruling 29 extends to the Catalog pages, `/catalog/agents`, `/catalog/skills` and `/catalog/sources` (operator decision, 2026-10-06, while avel-server's module 4 routes do not exist). Everything in ruling 29 applies there unchanged: the dashed "Sample data" pill, the missing route in its tooltip, the real layout behind it, values deterministic per id, never sent anywhere, and each placeholder deleted when its route lands. The pill is one shared component (`sample-data.tsx`), used by both the mission and catalog pages, and each page names its missing routes in its own placeholder module. On the catalog pages a sample section is a `SampleRegion`: the mission page's dashed frame with the pill first, built from existing parts only. Server-enforced policy is never shown as real from a client copy: the per-family table of what agents may do sits behind the pill until the server serves it. Disabled operator write controls are real, with their `disabledReason`. Every other page keeps section 1's "absence is stated, never faked".
33. The Drive (operator decision, 2026-10-06; avel-server `DECISIONS-V2.md`, *Decided 2026-10-06: the Drive*). A thirteenth sidebar link, Drive `/drive`, joins Library after Playbooks. This supersedes ruling 3's count of twelve. `/drive` is the whole Drive across scopes, one store: General, then each client as a folder with its engagements nested under it. A folder rail on the left (counts per folder; a select below lg) filters the page, with a breadcrumb (Drive / Clients / Acme / Booking app). Above the files: a toolbar (search by name, kind chips for Documents, Spreadsheets, Images, Archives and Notes with their counts, sort by Newest, Name or Size, and a List | Grid toggle) and a slim drop zone. There is no storage meter: the Drive has a per-upload size cap and no Drive-wide quota, so no used-of-cap figure is shown. A Drive-wide quota, if one is ever decided, comes from avel-server with a real number. The four most recent files still held sit above the list as cards. The list (default) shows a kind tile, the name over its scope path, the uploader as an initials avatar, size and date in mono, and an eight-character SHA-256 with the full value on hover; the grid shows cards with a placeholder thumbnail for images. Folder, search, kind, sort, view and the selected file live in the URL. A tombstone (bytes destroyed, row kept) is dimmed, its name struck through, with a "Bytes destroyed" badge, no size and no download. Selecting a file opens a panel: beside the list at 2xl, where it takes the folder rail's place so the list keeps its width, and a right sheet below 2xl. It shows a preview (the first lines of md and json in the shared code view; a kind tile otherwise, and always for a tombstone), the name and scope path, Download and Delete, then three tabs: Details (type and mime, size, SHA-256 with Copy, uploader and date, whether the bytes are held), Agent access (firm agents read across scopes; a mission agent reads a file only when its dispatch brief lists it; on client and engagement files, the one-way door: never readable by another client's agents; then Promote to knowledge skill with its draft, review, approve, pinned-by-hash path) and History (uploaded, attached, promoted, deleted). A client's panel in `/clients` has two tabs beside Overview built from the same pieces: Notes (the client's own notes field, then note documents as cards with title, author, date and opening lines) and Files (the same toolbar, drop zone, list or grid and panel, as a sheet, filtered to that client, engagement files tagged with their engagement). File kinds use one tone table (`KIND` in `drive-files.tsx`): a steel ramp of existing tokens with a distinct icon per kind, because the gate and diff colours carry other meanings; `--color-kind-*` tokens are proposed. Upload, Download, Delete and Promote are real controls, disabled with their reason until the Drive's routes exist (built after the first mission). Ruling 29's sample treatment applies to `/drive` and to both tabs unchanged: the dashed pill, the waited-for route in its tooltip, deterministic values per scope id, never sent anywhere, deleted when the routes land. Samples live in `drive-placeholders.ts`. The tabs keep every panel in the page and hide the inactive ones, so a client's Overview is unchanged.
34. Agents and Skills are redesigned (operator request, 2026-10-06), and supersede ruling 32's list-and-detail layout for those two pages. Ruling 32's sample rules still apply. Agent templates is a technical console. A process table (`AgentProcessTable`, `AgentFilterRow` with side tabs and counts, `AgentTableFooter`, `AgentTile`) has mono machine values, and one Sample data pill on the table, with a dashed underline and a tooltip on each sample column. A Table and Graph toggle switches to the artifact graph (`AgentGraph`, inline SVG). Producers point to consumers by wave, A to D. Wave E and the firm agents each sit apart, because firm agents never join a mission's waves. Clicking an agent slides a panel in from the right at every width (`AgentPanelSheet`, 32rem, full width on phones). The panel has metric cards, a rule-based status box, Identity, Manifest and Versions, and focus returns to what opened it. Skills follows the operator's "Skill Center" reference. A sidebar groups skills by source, Yours first (`SkillRegistryRow`, the review banner). The inspector holds the facts, role switches grouped by family (`RoleToggleCard`), Carried by, and SKILL.md with AVEL's additions kept apart. Discover (`RegistryEntryRow`) and New skill (`NewSkillForm`) complete the page. Skills attach to roles, not agents. An update arrives as a draft to review, never by "update all". Imports arrive as drafts. Two shared pieces join the system: `CodeView`, read-only code with line numbers and optional line tones, and Switch's `disabledReason`, which behaves as Button's does. Tile tones for agent sides and file kinds borrow existing tones until dedicated tokens are decided. Each borrowing is one mapping table (`SIDE_TONE`, `KIND`), so swapping it is one line.
35. Where things open, and how changing them feels (operator decision, 2026-10-10, from avel-server's redesign proposal). The principle is the operator's: "an intuitive and fun experience making these configurations. This is a solo developer focused application." It means keyboard first, a confirmation only where a mistake can't be undone cheaply, and a save or apply that visibly lands. All of it stays within section 4's tokens and its motion rules: nothing bouncy, no overshoot, and every state still reads with motion off. Each object opens in one place only, chosen by what the operator is doing. Browsing beside a list is a slider (`Sheet`, from the right): the Drive file panel, the Clients panel, and the agent and skill inspectors, so ruling 34 stands. Changing something is a modal. Real work is a page: the plan editor is `/missions/:id/plan`. The forms move from sheets to modals: client, engagement, preset, connection, source, skill create and roster add. Preset detail becomes a centered modal, a summary card and then `Tabs`, opened from its list and named in the URL (`?preset=<id>` on `/presets`), so an open preset is still a link. Editing a playbook is real work, so a playbook opens on its page, `/playbooks/:missionType`, the builder (ruling 36), never in a modal. `/missions/:id/playbook` is a page too, for a different object: the mission's resolved process, its template and its coherence. This supersedes ruling 32's list-and-detail layout for Presets and Sources, and every form sheet. One modal shell (`ActionModal`, on `Dialog`) comes in three sizes with one structure. Confirm is small. Form is medium, for about eight fields or fewer; more than that is a page or a Stepper. Stepper is large, with numbered steps and Back. Below md a modal of any size fills the screen. The header is a verb and its object ("Apply preset", "Add engagement"). Below the fields, a `WhatChanges` strip lists what this request changes, computed client-side from the form against the loaded object, in mono for machine values. It describes the request only. What the server will decide (gates, coherence, policy) is never predicted from a client copy, unless the verdict comes from the contract's own shared function, as coherence does. The primary button says what it does, with the count where there is one ("Apply 6 agents"), never "Submit" or "OK". ⌘Enter submits from anywhere in the modal. Esc closes at once when nothing has changed, and asks first when something has. A 422 keeps the modal open with what was typed: each entry of `details.issues` sits on its field by path, and anything that maps to no field goes in a row above the buttons. The copy comes from the error map, keyed by code. Feedback lands without ceremony. On success the modal closes over `--duration-state`, the changed row takes the selected fill for one `--duration-enter` and settles, and a toast names what happened. That is a state change, not a signature moment: section 4's list is unchanged. Undo is offered only where the contract already has the inverse request (an active toggle, attach and detach, a status flip). There the toast offers Undo and the write asks no confirmation. Every other write confirms, naming the object and the effect. Delivering and aborting keep `holdToConfirm`. Long lists open in place: `InlineExpand` ("Show more", with the hidden count, on a grid-row animation like the details panel's sections, inert while closed) serves roster entries, a playbook's gates, a preset's agents and a plan's modules. `HoverCard` (on `Popover`, opened by hover or by focus, never holding anything a keyboard can't reach) previews agent template names, skill tags and Activity actors. Its trigger stays a link to the full object. Radix's own hover card is not used, because it does not open from the keyboard. The plan's readiness is `PlanReadiness`, one segmented bar with a segment per requirement in brief order. A solid segment is a requirement in exactly one module with no issue against it. A hatched segment is placed but has an issue against it. An empty segment is unplaced. An issue is against a requirement when its path names that requirement (`requirements[i]`), a criterion that cites it (`acceptanceCriteria[j]`), or a module that holds it (`modules[k]`, which marks every requirement in that module). Positions resolve through the brief, as `groupBrief` does. The bar is derived only from the brief and the plan check's `issues` paths, with no percentage or score of its own. Issues against no requirement go in one plan-wide row beneath the bar. The hatch is a utility in `app.css` built from existing gate tokens, not a new colour. Four shared pieces join the system: `ActionModal`, `WhatChanges`, `InlineExpand` and `HoverCard`, with `PlanReadiness` for the plan.
36. Configuration is a working surface, not a table (operator direction, 2026-10-10: "presets, playbooks need to be interactive, not just display data. Add another toggle view if needed for display data."). It amends ruling 35 where they meet: a playbook opens on its page, never in a modal. A library page whose rows are things the operator shapes (Presets, Playbooks) shows a Board by default and keeps the table as its second view, behind a Board | Table toggle in the top bar (two pressed-state buttons, as Agents' Table | Graph). The view sits in the URL (`?view=table`; Board is no parameter), so it survives a reload and is a link. A board card shows the object's shape before it is opened: a playbook's card has its name and version, its mission type in mono, a strip of the five waves (the ones it runs filled, the rest dashed), its gate count by policy and its deliverable. The card is a link to the object's page. A playbook's page, `/playbooks/:missionType`, is a builder (`PlaybookBuilder`). The top bar holds the crumb, the type as title and the stored version as a pill. Tabs below are Builder, Runs and Versions; the last two are not built until their routes exist. The canvas is one vertical rail (`PipelineCanvas`, inline SVG drawn as `AgentGraph` is, no library): every wave A to E in order, the ones the playbook runs as live cards and the rest as dimmed, dashed "skipped" stubs; then its gates in stored order as pills, each with its policy as a glyph (mandatory, a filled square, a hard stop; warn, an open chevron, a pass-through); then the deliverable as the terminal node. The contract ties no gate to a wave, so gates follow the waves rather than sitting between them. Selecting a node shows its own properties in the panel on the right (Properties | Versions); with nothing selected the panel shows the whole playbook. The panel's controls are live and edit a draft held in the page: the canvas draws the draft, and an "Unpublished changes" banner above the canvas lists them as a `WhatChanges` strip, with Revert and Publish. Publish is the only write, and it is disabled with its reason until avel-server serves the playbook write. Below the panel, a Pre-flight checks block shows coherence: on a mission's page (`/missions/:id/playbook`, which embeds the builder) the contract's `computeCoherence` for that mission, on the type's page "Pre-flight runs per mission" and a link to that type's missions. The rail is one vertical toolbar for the keyboard: one node takes Tab, arrows move along it (Home and End to its ends), Enter opens the node's properties, Esc clears the selection, and the canvas says so in a caption above it. The Activity page becomes an audit log with a decision record: a table of Time (mono), Actor (an icon by kind, then the name), Action (a sentence from the activity copy), Object (a link to the entity) and Result (a badge: Applied, Held, Stopped or Reverted). Selecting a row opens a "Decision record" panel below the table with five parts: What it did; What it looked at (the entry's payload, per action, with the raw JSON in `CodeView` behind a toggle); What rule applied (not built until avel-server logs refusals); How confident (n/a unless the entry carries it); and How to reverse it (the inverse request, per ruling 35, or "No inverse"). Every row reads Applied while refusals are not logged; the badge's other values wait for that. A primary button names its keyboard shortcut beside its label ("Approve ↵", "Add client ⌘↵", "Ctrl ↵" off Apple platforms, from the shared shortcut label), in mono at reduced opacity, from md up only. A primary button's shortcut hint is rendered once by the shared button, never by the caller.
37. The machined plate, and how it moves (operator request, 2026-10-10: "our panels need to inherit the stainless steel niche; they look bland; bolden the outsides"). Before this, a panel was an 8% hairline around a body the same colour as the canvas, so only its header read as steel. A panel is now a slab: `plate`, one utility that sets five things together so they never drift apart: an edge one step stronger than the hairline (`border-plate`), a bright 1px rim inside the top edge where the chamfer catches light (`plate-rim`), a 1px shade inside the bottom edge (`plate-shade`), a dark 1px ledge falling under the slab (`plate-ledge`), and the body one step above the canvas (`app-plate`, dark #181c21, light #e9ecf0) under its own sheen (`plate-sheen`), resting at e1. `plate-float` is the same slab lifted to e3 for sheets, dialogs and modals. `plate-interactive` is for a card that opens: on hover and on `data-selected="true"` it rises 1px to e2 and its edge steps to border-strong, over the micro duration. A plate's header is its band, with a machined groove under it (`groove-b`: the edge line, then the rim catching light on the body below) and an engraved title, the one place prose carries the engrave shadow. Nothing else suggests metal: no screws, no bevelled corners, no gradient fills. SectionPanel, DataPanel, Surface's error card, the Sheet, the Dialog and ActionModal use it; a card with `surface-steel … border-border bg-card` is migrated by that one class swap, and never carries a `shadow-e*` beside `plate`, which paints its own. Spacing: a panel header is 48px tall at lg (px-5 py-3), a body pads 20px at lg and 16px below, panels sit on a 24px vertical rhythm, and the canvas gutters are 32px at xl. Motion, within section 4: a page's top-level panels settle in one after another (`stagger-in`: each rises 4px over the enter duration, 30ms apart, capped at the sixth); the playbook family's signature moment is the pipeline drawing on (`animate-draw-on`, with nodes landing 30ms apart through `animate-node-in`); a version badge ticks up when a draft goes dirty (`animate-tick-up`); the dirty banner slides down from under the top bar (`animate-slide-down`); and a selected SVG node steps its fill and stroke rather than its shadow. Reduced motion collapses each to an appearance, and every one of these states reads with motion off.

38. The entity banner, and an agent's page (operator decision, 2026-10-12, from the operator's reference "Atlas"). An entity with a page of its own heads it with a banner (`EntityBanner`): a back link to its list, its tile, its name large, its state (`BannerStatus`: a dot and a word, the dot lit only while live), one line of facts, its numbers (`BannerStat`), its actions, and the tabs that split the page, each with a count only where a route supplies one. The banner is the one deep band on the canvas, and it stays deep in both themes: `--color-banner` with its own line, raised, text, muted and live tokens, so nothing inside it follows `.light`. Theme tokens are never used inside it; a shared piece placed on it takes the banner's colours by className (the Sample data pill does). The top bar keeps the page's h1 and crumbs; the banner's large name is hidden from screen readers so the name is announced once. The first such page is an agent's, `/catalog/agents/:slug`, opened from the agent panel's "Open agent page". Its tabs are Overview (identity and manifest, live), Tools and access, Performance, Versions (the catalog's samples, ruling 32), Activity (not built, module 6) and Memory (not built, module 12). The banner's numbers are ruling 32's samples behind their pill; Ask and Pause are real buttons disabled with their reasons. Tools and access is a table the operator acts on, not a display (ruling 36): one row per thing the agent may touch, from avel-server's `accessFor` and never computed here (repository, each tool grant, delivery), with System, Access (a chip per mode: No access, Read, Write holds, Send after approval; a narrowed row also says what it was limited from), Scope, Last used (not tracked until module 8) and a switch. Without a mission it shows the template's own access, read-only; choosing one of the missions the agent is on shows that entry's access, and on a draft mission a tool row can be switched off, or a held write narrowed to read, writing the entry's overrides. Overrides only narrow. Limits that no longer match a tool are stated with a Clear, never dropped silently. The panel carries "Recorded, not enforced" until rooms land (module 7). The right rail holds Credentials (module 6), What it cannot see (module 7) and Access requests (module 8), each not built and naming its module.
39. The sidebar's names (operator decision, 2026-10-12: "Don't rebuild just rename"). The sidebar keeps its shape, its nesting (ruling 13) and every address; only names change. Canon's link is Home, since it is where the owner talks to Canon. The Catalog parent is Agents, and its first child, Agent templates, is All agents. Presets is Teams; the page still calls each saved squad a preset. The System group is Control. Approvals, Incidents, Insights, Permissions and Help are not added: each appears once its module gives it real data.
40. Sources is not a page (operator decision, 2026-10-12: "Remove Sources as a module"). `/catalog/sources`, its shelf, table, detail, form and remove are deleted, and the sidebar has twelve links. A skill's source lives inside Skills: the skill sidebar groups by source, the inspector names it, and Discover browses the outside sources' skills. avel-server keeps the skill source table and its routes; only the page goes. Where rulings 32 and 35 name `/catalog/sources` or the source form, they no longer apply.
41. The banner is lit, and follows the theme (operator direction, 2026-10-12: "the banner isn't styled", "light mode the banner shows dark"). This amends ruling 38: the banner is no longer dark in both themes. Its tokens are deep on dark and light on `.light`. Its face is `banner-surface`: the band colour, an accent glow behind the tile, a fainter one at the bottom right, a sheen and a top highlight, with a fine grid on its own layer (`banner-grid`) that fades out before the tabs. The tile is 64px with an accent glow; each number is `type-h1` in a cell divided by a hairline; the tabs sit on a ruled bottom edge across the full width, the active one underlined in accent. One list shows one count: the agent table's "Showing n of total" against the server's total, and the list footer below it offers only Load more.
42. One vocabulary across the app (operator direction, 2026-10-12: "wording needs to match our updates whole project"). What people read says agent, never agent template; team, never preset; and All agents or Skills, never the catalog. Template means only an AVEL project template (a mission's template repository), so the word is free for it. This amends ruling 39's note that the Teams page still says preset. Only copy changes: routes, test ids, query keys, activity action names and the contract's field names (`agentTemplateId`, `defaultPresetId`) keep their names.
43. An agent's page, repacked (operator direction, 2026-10-12). Four tabs, related things together: Overview (Identity and Recent activity on the left, Manifest on the right, each panel its own height), Tools and access, Performance (the measures, with Versions beside them, since the measures compare versions) and Memory. Recent activity is live: the log's entries for each of the agent's roster entries, merged newest first, each linking to its decision record; the agent's own work joins it with dispatch (module 6). The banner's numbers are live (missions, running now, tools, roles), so the banner carries no sample pill and no token estimate. Tools and access lays out as the operator's reference: the tools table, and beside it from 1440px (in a row of three under it below that, so the table never scrolls) three panels read from the same access: Credentials (one row per system the agent may touch, each "No token yet" until module 6), What it cannot see (the tools turned off for it, then rooms in module 7) and Access requests (none recorded until module 8). The All agents table drops its version, hash and token estimate columns until their routes land. A team's cut reads By feature (vertical) or By layer (horizontal).
44. All agents is a board of agent cards (operator direction, 2026-10-12: "remove the table and add cards components for each ai agent … each card is individually built by sections of information related to the agent"). This replaces ruling 34's process table and ruling 41's table count. The table, its paging and its sample column headers are deleted. The page toggles Cards | Graph, with cards as the default and the view in the URL (`?view=graph`). Each agent is one card (`AgentCard`) on a notched plate (`plate-notched`): ruling 37's plate with its top-right corner cut at 45 degrees and a small matching cut at the bottom left. Each cut redraws its own edge in the plate's edge token, and `plate-notched-lift` casts the slab's ledge and e1 so the shadow follows the cut. This amends ruling 37's "no bevelled corners" for agent cards only. A card is built from sections, each under a hairline with an engraved label and, where it has one, a count in mono. The identity band comes first: the side's tile, the name, the slug in mono, the kind as "Shared" (horizontal) or "Feature", and the version, with no hash and no token estimate. Then come:
   - the description, as the card's main text in body type, at foreground weight 450, three lines at most with the whole text on hover;
   - the roles, as chips in catalog order;
   - where it works: the five waves, the ones it runs filled and the rest dashed, or "Between missions" for a firm agent;
   - the territory and side, in a Sample data region (ruling 32), the side with its own dashed underline and reason;
   - the writable paths in mono, three at most, then a count;
   - Open.

   The description is the agent's written `description` (avel-server 0e9c3db). When none is written, it is the first prose paragraph of its identity. When the identity has none, it is one sentence from its roles, drawn from the client copy of ROLES.md and captioned "From its roles". The whole card is one link to the agent's page, stretched over the plate, so the Sample data pill stays a button of its own. The card rises as a plate does, on hover and on keyboard focus. The filter row (side tabs with counts, search, wave and kind) sits above the cards. Below them are one "Showing n of total" against the server's total and, when there is more, Load more. While the list loads, the skeleton has the cards' shape. The cards fill as many columns as fit, never narrower than 17.5rem, and the canvas never scrolls sideways.
45. Clients is a board, and a client has its own page (operator direction, 2026-10-12: "more creative than just list and detail"). This supersedes the Clients list and detail of section 12 and ruling 35's Clients panel.

   The board:
   - `/clients` shows a Board by default and the table as its second view, behind a Board | Table toggle (`?view=table`), as ruling 36 sets for Teams and Playbooks.
   - The board has two sections, Active then Closed, each under a ruled heading with its count. Each section is a grid of plate cards that open the client.
   - A card shows the client's tile (initials on the accent while active, recessed once closed), its name, contact, status and a menu (edit, new engagement, close or reopen). Below that come a meter of its engagements, one segment per engagement with active first, read from the row's own counts; its three latest engagements, active first, then "and n more"; and when it last changed.
   - The Active section ends with a dashed New client card.
   - Search stays in `?q`. An All, Active or Closed filter sits in `?status`. It narrows only the clients loaded, because `clients.list` has no status filter, and says so when more remain.

   The client page:
   - A client opens on its page, `/clients/:id`, headed by the entity banner (rulings 38 and 41) with a building tile.
   - The banner holds the client's state, one line of facts (client since, contact, updated), its live counts (engagements, active, closed), and New engagement, Edit and Close or Reopen as real buttons.
   - Its tabs, in `?tab`, are:
     - Overview: the engagements as an Active and a Closed lane of cards, the client's details, and Missions, not built until `missions.list` takes a client filter.
     - Engagements: the list, with Active only in `?active`.
     - Drive: ruling 33's samples.
     - Activity: the log's latest entries for the client and each engagement, merged newest first, each linking to its record.
   - Only Engagements carries a count.
   - The old `/clients?client=<id>` redirects to the page.
46. An agent's page, polished (operator approval, 2026-10-12):
   - One heading per panel: a part placed in a titled panel prints no title of its own.
   - An identity that is only headings says plainly that it is still a stub, and sits in a box as wide as its text.
   - Allowed actions are a term and description list per family, never a table in a narrow column.
   - The manifest gives the kind in words beside the machine value (`horizontal # Shared`, `feature # Feature`).
   - A tab shows a count only where a live read supplies one: Tools and access counts the rows of the access it shows.
   - The status pill is a state word (Working, Idle, Not on a mission), and the counts belong to the banner's numbers.
   - A number links where its target exists: missions to Missions (no agent filter is invented), tools to its tab.
   - The tile shows an icon for the agent's side (author, tester, judge, fixture, firm or mixed), not initials.
   - The facts line carries the waves ("wave A", "waves A and C"), or "between missions" for a firm agent.
   - Mission choices read as words ("template-booking, sprint 1 (draft)"), with the short id beside them in mono.
   - A row no switch changes shows a lock you can tab to, with its reason in a tooltip and for screen readers.
   - Recent activity is grouped by mission, each group headed by a link to the mission.
   - Long measures fold behind InlineExpand.
   - Once the banner scrolls away, a pinned banner (`PinnedBanner`: tile, name, tabs as plain buttons) stays under the top bar. It is sticky at zero height, inert while hidden, and raises the canvas's scroll padding while it shows.
   - Keys 1 to 4 open the tabs and Escape returns to All agents, never in a field or while a dialog, menu or list is open. The tabs announce the keys with aria-keyshortcuts.
47. Templates is a page (operator report, 2026-10-12: "I'm not seeing my project template page"). A template is an AVEL project template (ruling 42): a repository a mission is built from, read by avel-server from its `.avel/template.json` and default branch (`templates.list`, `templates.get`). Templates (`/templates`) joins Library after Playbooks, so the sidebar has thirteen links; this supersedes ruling 40's count.

   The board:
   - Per ruling 36 the page is a Board of cards by default, with a Board | Table toggle (`?view=table`).
   - A card shows the template's name, its slug in mono, its scope and starting state, its latest commit as eight mono characters with the full sha on hover, and its mission count. It also shows the playbook keyed by its slug (a playbook's mission type is the template's slug) and that playbook's default team.
   - The card's name is its link, stretched over the card, so the playbook and team links never nest inside it.
   - A repository avel-server could not read says so in a sentence, and its unknown fields are never guessed.
   - A card never says "No playbook" before the playbooks are read.

   The template page:
   - `/templates/:slug` heads the page with the entity banner (ruling 38).
   - The banner has the template icon as its tile, Readable or Not readable as its state, and scope, starting state and slug as its facts. Its numbers are the missions and the playbook's version and gate count, and its actions are Open playbook and Open team.
   - Its tabs are:
     - Overview: the manifest and the full commit, then what is built from it.
     - Playbook: the playbook's shape and a link to its builder, or how to create one.
     - Missions: the server's count and a search of Missions by the slug. The filtered list is not built until `missions.list` filters by `templateRef`.

   The plan editor:
   - The plan editor's template is chosen from `templates.list`, never typed.
   - Choosing one pins its latest commit, since templateRef and templateVersion are set together, and the commit stays editable for an older one.
   - If the list cannot be read, the field falls back to typing the name.

## 12. Rules for every screen

- A screen starts from a block: shell + top bar, then three-pane workspace, pre-flight stack, queue, registry list or overview.
- Loading, empty, error and success are mandatory on every data region; not built where the endpoint does not exist.
- Disabled by state, with the reason visible. Never by styling alone.
- Hashes and evidence are content: full value on demand, copy copies the full value, base SHA and read age never scroll away.
- Keyboard first: focus order, the 2px ring, ⌘K command palette.
- A screen never invents a component. Anything missing is added to this system first.
