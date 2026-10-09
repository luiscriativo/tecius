# Tecius — User Guide

> A complete reference for all features and file formats.

---

## Table of Contents

1. [Core Concepts](#1-core-concepts)
2. [Vault](#2-vault)
3. [Timelines](#3-timelines)
4. [Events](#4-events)
5. [Chronicles](#5-chronicles)
6. [Sub-timelines](#6-sub-timelines)
7. [Timeline Views](#7-timeline-views)
8. [Categories & Importance](#8-categories--importance)
9. [Assets](#9-assets)
10. [Trash](#10-trash)
11. [Export](#11-export)
12. [Search](#12-search)
13. [Settings](#13-settings)
14. [Keyboard Shortcuts](#14-keyboard-shortcuts)
15. [Frontmatter Reference](#15-frontmatter-reference)

---

## 1. Core Concepts

Tecius is built around four simple ideas:

| Concept | What it is |
|---|---|
| **Vault** | A regular folder on your disk — the root of all your data |
| **Timeline** | A subfolder containing events, identified by a `_timeline.md` file |
| **Event** | A single `.md` file with a `date` in its front matter |
| **Chronicle** | A `.md` file that declares multiple events in its front matter |

Everything is plain text. You can open, edit, version-control, or back up your vault with any tool.

---

## 2. Vault

### Opening a vault

On first launch, Tecius asks you to choose a folder. Any folder on your computer can be a vault — including an existing folder with `.md` files.

### Vault metadata

Tecius looks for a `_vault.md` file at the root of the vault to read the vault title. If the file does not exist, the folder name is used instead.

```markdown
---
title: My Research Vault
---
```

You can rename the vault at any time using the **Rename** button next to the vault title on the Home page.

### Vault structure example

```
my-vault/
├── _vault.md
├── Amazon History/
│   ├── _timeline.md
│   └── ...
└── Personal/
    ├── _timeline.md
    └── ...
```

---

## 3. Timelines

A timeline is any subfolder that contains a `_timeline.md` file.

### Creating a timeline

1. Create a new folder inside the vault (or inside another timeline for nesting)
2. Add a `_timeline.md` file with the following front matter:

```markdown
---
type: timeline
title: "Amazon History"
description: "The history of the Amazon region, from indigenous civilizations to the modern state"
icon: "map"
sort: chronological
tags: [amazon, brazil, history, manaus]
---

Optional long description rendered below the timeline header.
```

### `_timeline.md` fields

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"timeline"` | No | Identifies the file type |
| `title` | string | **Yes** | Display name of the timeline |
| `description` | string | No | Short subtitle shown in the header |
| `icon` | string | No | Icon name (Lucide icon key) or emoji |
| `sort` | `"chronological"` \| `"reverse"` \| `"manual"` | No | Default event ordering (default: `chronological`) |
| `tags` | string[] | No | Tags for filtering |

---

## 4. Events

An event is any `.md` file inside a timeline folder that has `type: event` (or any front matter with a `date` field).

### Basic event

```markdown
---
type: event
title: "Inauguration of the Teatro Amazonas"
date: 1896-12-31
category: Culture
importance: 5
tags: [teatro-amazonas, opera-house, rubber-boom, manaus]
---

On December 31, 1896, the Teatro Amazonas — the Amazon Opera House —
was inaugurated in Manaus, standing as the most audacious symbol of
the rubber boom era. Built over seventeen years, it remains one of
the most remarkable buildings in South America.
```

### Event fields

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"event"` | No | Identifies the file type |
| `title` | string | **Yes** | Event title shown in the timeline |
| `date` | string | **Yes** | Date in `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` format |
| `time` | string | No | Time in `HH:MM` format (e.g. `"14:30"`) |
| `date-end` | string | No | End date for events with duration |
| `date-precision` | `"year"` \| `"month"` \| `"day"` \| `"hour"` | No | Override auto-detected precision |
| `circa` | boolean | No | Mark the date as approximate (`~`) |
| `category` | string | No | See [Categories](#8-categories--importance) |
| `importance` | 1–5 | No | Visual weight on the canvas (default: 3) |
| `tags` | string[] | No | Free-form tags |
| `cover-image` | string | No | Relative path to an image shown at the top of the event page |
| `has-subtimeline` | boolean | No | Reserved — sub-timelines are detected automatically (see [Sub-timelines](#6-sub-timelines)) |
| `subtimeline-path` | string | No | Reserved — see above |
| `links` | array | No | Internal links to other events, shown at the bottom of the event page (click to open) |
| `references` | array | No | External reference URLs, shown at the bottom of the event page (open in the browser) |

An event without a `date`, or with a date Tecius cannot read, is not placed on the axis (it would distort the scale). It appears in a **No date** group at the end of the list, and a notice above the timeline and the map names it so you can open it and fix the date.

### Date formats

Tecius does **not** use JavaScript's `Date` object internally, so historical dates before 1970 and imprecise dates work correctly.

| Format | Example | Precision auto-detected |
|---|---|---|
| Year only | `1789` | year |
| Year + month | `1789-07` | month |
| Full date | `1789-07-14` | day |
| Full date + time | `1789-07-14` + `time: "10:30"` | hour |
| Before Christ | `-500`, `-44-03-15`, `500 a.C.`, `44 BC` | year / day |
| Thousands of years ago | `12 ka` | year |
| Millions / billions of years ago | `66 Ma`, `1.2 Ga` | year |

Use `circa: true` to display the date with a `~` prefix indicating approximation.

### Location

Events (and each part of a multi-part event) can record where they happened. Coordinates are always **present-day** positions; the map can reconstruct their position in geological eras (see the Map view).

```yaml
location:
  name: "Porto Seguro, Bahia, Brasil"
  lat: -16.43
  lng: -39.08
  precision: city        # point | city | region | country | approx
  area: BR-BA            # optional — country (ISO3, e.g. BRA) or state (ISO 3166-2) to highlight
  radius_km: 25          # optional
```

In a multi-part event, a part without its own `location` inherits the event's. Use the **Map** view (third button next to the timeline/list toggle) to watch your events on a world map through time:

- **Time ruler** — drag the ruler at the bottom (or use ← / → and Home / End) to move through time. The ruler is compressed: long empty stretches (e.g. from Pangaea to 1500) take little space and are marked with `//`, while close dates stay apart. Releasing near a date snaps to it.
- **Window** — the cursor selects a calendar period (*Automatic*, Day, Month, Year, Decade, Century, Millennium). Every event overlapping it is highlighted, so two events in the same month appear together. *Automatic* uses month for dated events and year otherwise. Events with `date-end` stay visible for their whole duration.
- **Play** (▶ or the space bar on the ruler) walks through the dates one by one at the chosen speed; in deep time it waits for the era's map to be ready.
- **Present** (the screen button next to Play) turns the map into a guided narrative: full screen, with a side panel showing the date, title, place and text of the events of each moment, advancing slowly through every dated event (also the ones without a location). Space pauses, ← → move, Esc exits.
- The map remembers where you left the ruler (when switching views or opening an event). If you select another event in the timeline or list, the map opens on that event's date, with it highlighted. Going the other way, switching from the map to the horizontal timeline zooms and scrolls the timeline to the moment the ruler was on (in timelines that span deep time, the linear timeline can only zoom so far); switching to the list opens the right group, scrolls to the first event of that moment and briefly highlights it.
- **Borders** — in human history (from 123,000 BC to 2010), the map shows the political borders in force at the cursor's moment, taken from the latest available snapshot (e.g. in 1510, the 1500 map), with territory names (in Portuguese when the app is in Portuguese) and a cross-fade between eras. Dashed borders are approximate. Data: [historical-basemaps](https://github.com/aourednik/historical-basemaps) (GPL-3.0); borders are simplified for a world-scale map and should be checked against other sources for academic use.
- **Trail** shows past events faded (fainter the further back); **Follow** smoothly frames the events of the moment; **All** turns the time filter off.
- **Many events in one place** — points closer than a few pixels merge into a numbered circle. Clicking a group opens a side list (like a cluster on the timeline) in chronological order, with a filter by title, date or place; it scrolls smoothly even with thousands of items — e.g. every event marked only as a country (Esc closes it). Zoom in to separate points that are close but not in the same place. Events with an area (`area` or a radius) that share the same country, state or circle are drawn as one shape, shaded darker the more events it holds.
- **Deep time** — with *Paleogeographic maps* enabled in Settings, moving the cursor into deep time swaps the map (with a cross-fade) for the coastlines of that era and shows reconstructed event positions, plus a badge with the age, geological period and supercontinent (e.g. *~300 Ma · Carboniferous · Pangaea*). The eras of your events are prepared in the background (GPlates; the first time can take a few minutes per era, then it is cached and works offline). Between two eras the map shows the closest one already prepared. Ages under 1 Ma use the present-day map; beyond 1000 Ma (the plate model's range) positions are present-day.

### Linking events in the text — `[[ ]]`

Type `[[` anywhere in an event's text (or in a section of a chronicle) and a list of the events of the whole vault opens, filtered as you type, with their date and timeline. `↑` `↓` choose, `Enter` (or `Tab`) inserts the link, `Esc` closes.

```markdown
The treaty explains why [[Cabral reaches Brazil]] claims the new land.
Dias opened the route later used by [[Vasco da Gama reaches Calicut|Vasco da Gama]].
```

- The link points to the event **by its title** (capitals and accents don't matter). `[[Title|text]]` shows a different text.
- When two events share a title, the link includes the timeline: `[[Brazil/Foundation]]` — the list writes it for you.
- If no event has that title, the last option of the list is **Create "…"**: a new event without a date is created in the current timeline (it shows up under **No date** until you fill it in).
- When reading, a link shows the date of the event and opens it on click — even in another timeline. A link to an event that doesn't exist is dashed; clicking it creates the event.
- Rest the mouse on a link to see a card with the date, place, timeline and the beginning of the event's text.
- At the end of every event, **Mentioned in** lists the events that link to it, with the sentence around each mention (in a chronicle, the right section). It also appears in the side panel of the timeline.
- Renaming an event (or a chronicle section) and going back to reading offers to **update the links** that still use the old name.
- **Relations on the map:** **See relations on the map** (at the end of an event, or **Relations** in the map's popup) shows only that event and the ones linked to it, from any date and timeline. The events it cites form a **route in date order** (solid line) — a biography that cites loose events becomes a journey; events that cite it are joined to it by dotted lines. **Back to time** returns to the normal map.
- **Relations on the timeline:** with an event selected, arcs join it to the events it cites (above the line) and to those that cite it (below, dotted), when they are in the same view.
- In PDF and HTML exports, links become plain text.

### Threads (Fio) — a story told by stops

A **thread** is an ordinary event that tells a story through other events of the vault: a person's life, a voyage, the chain of a discovery. At the end of an event, **Turn into a thread**: the events it links with `[[ ]]` become its **stops**.

- **Stops vs mentions.** Every link written in a thread becomes a stop automatically (when you finish editing). Links that are only context can be turned into a **mention** in the thread panel (*just a mention*); the text doesn't change. A mention can be put back with *add to thread*.
- **Order by date**, always: write the text in any order. Stops can come from any timeline, and **add stop** adds an event without citing it in the text. The panel warns about stops with no place (they don't appear on the map), no date, not cited in the text, or not found.
- **See on map:** the time ruler has only the dates of the stops, and the route is drawn up to the moment of the cursor — press Play to follow the story stop by stop, with the trail of the previous ones. **Leave thread** returns to the normal map.
- **In threads:** every event shows the threads it is part of. A fact exists once and many stories can go through it.
- In the file, the stops are a list in the header (renaming an event updates it too):

```yaml
fio:
  - "Belmonte"
  - "Cabral chega ao Brasil"
```

### Internal links (header)

```yaml
links:
  - path: ./napoleon-birth.md
    label: Napoleon's Birth
  - path: ../other-timeline/event.md
    label: Related Event
```

### External references

```yaml
references:
  - url: https://en.wikipedia.org/wiki/French_Revolution
    label: Wikipedia
  - url: https://www.britannica.com/
    label: Britannica
```

---

## 5. Chronicles

A chronicle is a single `.md` file that generates **multiple events** on the timeline. You can write it by hand, or create it in the editor with **Add section** (an event with two or more sections is saved as a chronicle). It is useful when you want to group related milestones in one document — a biography, a project log, a series of discoveries.

### Chronicle file

```markdown
---
type: chronicle
title: "The Amazon Rubber Boom"
category: Economy
tags: [rubber, boom, economy, amazon, belle-epoque]
events:
  - date: 1839-06-15
    label: Goodyear patents vulcanization — global rubber demand begins
    importance: 4
    anchor: vulcanization
  - date: 1876-06-01
    label: Wickham smuggles rubber seeds to Kew Gardens, London
    importance: 5
    anchor: wickham
  - date: 1896-12-31
    label: Teatro Amazonas inaugurated — peak of rubber wealth
    importance: 5
    anchor: teatro
  - date: 1912-06-01
    label: Boom collapses — Asian plantations undercut Amazon prices
    importance: 5
    anchor: collapse
---

The **Amazon Rubber Boom** (1850–1912) was one of the most dramatic
economic episodes in South American history, transforming Manaus into
one of the wealthiest cities in the Western Hemisphere.

## Origins

^vulcanization

In 1839, Charles Goodyear discovered vulcanization, making rubber
commercially essential and driving demand for the Amazonian *Hevea
brasiliensis* tree. ^wickham

## The Wickham Seeds

In 1876, Henry Wickham transported 70,000 rubber seeds from the Amazon
to Kew Gardens, seeding British plantations in Southeast Asia that
would eventually destroy the Amazon monopoly.

^teatro

## Peak of Wealth

The Teatro Amazonas, inaugurated on December 31, 1896, was the
physical embodiment of rubber wealth — an opera house in the jungle,
built from materials imported from four continents.

^collapse

## The Collapse

By 1912, Asian plantation rubber had captured the global market.
Prices collapsed, the Teatro Amazonas closed, and Manaus entered
decades of decline.
```

> When Tecius saves a chronicle it writes the entries under `entries:` with a `title:` for each one. The `events:` list with `label:` shown above is still accepted when reading.

### How anchors work

Each entry in `events` can have an `anchor` key. The corresponding paragraph in the body should end with `^anchor-name`. When the user opens a chronicle event in the panel, Tecius scrolls to and highlights the matching paragraph.

### Chronicle entry fields

| Field | Type | Required | Description |
|---|---|---|---|
| `date` | string | **Yes** | Date of this specific entry |
| `label` | string | **Yes** | Short title shown on the timeline dot |
| `importance` | 1–5 | No | Visual weight of this entry |
| `category` | string | No | Category of this entry |
| `tags` | string[] | No | Tags for this entry |
| `anchor` | string | No | ID linking this entry to a paragraph in the body |

---

## 6. Sub-timelines

Any timeline folder can contain subfolders that are themselves timelines. Sub-timelines allow you to drill down into a topic without cluttering the parent.

### Navigation

When a timeline has sub-timelines, they appear as buttons in a bar below the timeline header (in every view), with their event count — click one to open it. If an event's file has the same name as a sub-timeline folder (e.g. `monuments.md` next to `monuments/`), the event page also shows a **View sub-timeline** button. The breadcrumb bar at the top of the view shows your current depth and lets you jump back to any ancestor level.

### Creating a sub-timeline

Simply create a subfolder inside a timeline folder and add a `_timeline.md` to it — exactly the same as a top-level timeline.

```
Amazon History/
├── _timeline.md
├── 1541-02-12_orellana-expedition.md
└── Monuments & Architecture/    ← sub-timeline
    ├── _timeline.md
    ├── 1882-10-15_mercado-adolpho-lisboa.md
    └── 1896-12-31_teatro-amazonas-architecture.md
```

---

## 7. Timeline Views

### Canvas view

The canvas renders events on a horizontal temporal axis. Features:

- **Zoom** — Ctrl+scroll or the `−` / `+` buttons in the footer
- **Reset zoom** — click the zoom percentage indicator
- **Pan** — click and drag, or use the scrollbar
- **Event dots** — size reflects the importance value; click to open the event page
- **Cluster dots** — when multiple events overlap at the current zoom level, they merge into a cluster dot; click to expand
- **Scale** — **Linear** (proportional to time) or **Compressed** (switch in the footer). The compressed scale gives each gap between dates with events a length based on the logarithm of its duration, like the map ruler: a timeline that goes from Pangaea to 1960 fits the screen, very long gaps are marked with `//`, and you can still zoom down to days. By default the scale is chosen automatically (compressed when the timeline spans more than 5,000 years); your choice is remembered.
- **Compare with…** — overlay another timeline (or a sub-timeline) on the same axis, in a second lane, to compare periods. Clicking one of its events opens it inside its own timeline (and the comparison flips to the timeline you came from).

### List view

Displays events in a compact vertical list grouped by year. Features:

- Right-click on an event for context menu (rename, delete)
- Filter by category using the filter bar
- Sort by chronological or reverse order

### Switching views

Use the view toggle buttons in the timeline header (top-right area).

---

## 8. Categories & Importance

### Categories

Events can be assigned one of the following categories:

| Key | Display |
|---|---|
| `Politica` | Politics |
| `Arte` | Art |
| `Ciencia` | Science |
| `Cultura` | Culture |
| `Musica` | Music |
| `Cinema` | Cinema |
| `Literatura` | Literature |
| `Esporte` | Sport |
| `Pessoal` | Personal |
| `Outro` | Other |

### Importance

Importance ranges from `1` (minimal visual weight) to `5` (maximum). It affects:

- **Dot size** on the canvas
- **Visual emphasis** in list view
- Useful for distinguishing pivotal events from minor ones

---

## 9. Assets

Images live in an `_assets/` folder next to the events that use them, and are referenced with relative paths:

```yaml
cover-image: ./_assets/portrait.jpg
```

```markdown
![Battle map](_assets/battle-map.png)
```

To add an image while editing an event, use the image button of the editor toolbar, paste it (Ctrl+V) or **drag it from your computer into the text** — Tecius copies it into `_assets/` (keeping its file name when free) and inserts the link.

On the **Images** page you can also add images: choose the destination folder in the header and click **Add images**, or drag image files anywhere onto the page.

The **Images** page (sidebar) lists every image in the vault, grouped by folder or as a paged grid. It shows which images are **orphans** (no `.md` in the same folder references them), lets you copy the Markdown link, rename an image and delete images — deleting is permanent, and Tecius warns you when the image is still used by events.

---

## 10. Trash

Deleted events are moved to a `.trash/` folder inside the vault root — they are **not** permanently removed from disk.

### Accessing the trash

Click **Trash** in the sidebar to open the Trash view.

### Restoring an event

Select an event in the Trash view and click **Restore**. The event is moved back to its original location.

### Permanently deleting

Select an event and click **Delete permanently**. This removes the file from disk and cannot be undone.

---

## 11. Export

**A whole timeline** — click **Export** in the timeline header and choose:

- **PDF** — a print-ready document with a cover (title, description, period, number of events), a table of contents and one chapter per event (date, place, category, tags and text; a chronicle becomes one chapter listing its entries).
- **Web page (.html)** — the same document as a single self-contained file (images embedded, follows the reader's light/dark preference), easy to share or publish.

**A single event** — open it and click **Export PDF** at the bottom of the page; choose page size, orientation, margins, scale and whether to include tags.

---

## 12. Search

Press `Ctrl` + `K` (`⌘K` on macOS) or click **Search** in the sidebar to search the whole vault — every timeline and sub-timeline. It matches titles, text, tags, categories and timeline names, ignores accents and finds words by their beginning as you type. Titles that match come first; each result shows the date, the timeline and a snippet of the text. Use ↑ ↓ and Enter to open an event.

---

## 13. Settings

Accessible via the sidebar. Every option applies immediately and is saved automatically.

| Setting | Description |
|---|---|
| **Appearance** | Light, Dark or System theme |
| **Language** | Portuguese or English — interface, dates, native dialogs and historical border names |
| **Online address search** | Searches addresses on OpenStreetMap when picking an event location (off by default) |
| **Paleogeographic maps** | Shows the continents of geological eras on the Map view (GPlates, off by default) |

---

## 14. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl` + `Scroll` | Zoom in / out on the canvas |
| `←` `→` | Previous / next event on the event page; previous / next date on the map ruler; slides on the onboarding carousel |
| `Home` `End` | First / last date on the map ruler |
| `Space` | Play / pause on the map ruler and in the presentation |
| `Ctrl` + `K` | Search the whole vault |
| `Ctrl` + `F` | Search the event content |
| `Ctrl` + `S` | Save the event while editing |
| `Ctrl` + `B` / `Ctrl` + `I` | Bold / italic the selection while editing (again to remove) |
| `Ctrl` + `Z` | Undo — including changes made with the formatting toolbar |
| `Enter` in a list | Continue the list (`- `, `1.` → `2.`, `- [ ] `); `Enter` on an empty item ends it |
| `Tab` / `Shift` + `Tab` | In a list: turn the item into a sub-item / move it back a level (several selected items at once). In plain text, `Tab` inserts two spaces |
| Paste a link over selected text | Turns the text into a link — `[text](https://…)` |
| `Enter` | Confirm inline rename |
| `Escape` | Cancel inline rename; close panels, popovers and search |

On macOS use `⌘` instead of `Ctrl`. The editing shortcuts work in the main text and in every section of a chronicle.

**Formatting toolbar** — each button works on the selected text or on the line of the cursor, and clicking it again removes the formatting: headings, bold, italic, strikethrough, inline code, quote and lists apply to every selected line, and switching between list types replaces the marker. Spaces at the edges of the selection stay outside bold/italic marks. The buttons light up to show the formatting where the cursor is; they stay disabled until you click in the text.

---

## 15. Frontmatter Reference

### `_vault.md`

```yaml
---
title: string          # Vault display name
---
```

### `_timeline.md`

```yaml
---
type: timeline
title: string          # Required
description: string    # Optional — short subtitle
icon: string           # Optional — Lucide icon key or emoji
sort: chronological | reverse | manual   # Default: chronological
tags: string[]         # Optional
---
```

### Event file (`type: event`)

```yaml
---
type: event
title: string          # Required
date: string           # Required — YYYY, YYYY-MM, or YYYY-MM-DD
time: string           # Optional — HH:MM
date-end: string       # Optional — same formats as date
date-precision: year | month | day | hour   # Optional — overrides auto-detection
circa: boolean         # Optional — marks date as approximate
category: string       # Optional — see Categories
importance: 1|2|3|4|5  # Optional — default 3
tags: string[]         # Optional
cover-image: string    # Optional — relative path to image
has-subtimeline: boolean       # Optional
subtimeline-path: string       # Optional — relative path to sub-timeline folder
links:
  - path: string
    label: string
references:
  - url: string
    label: string
---
```

### Chronicle file (`type: chronicle`)

```yaml
---
type: chronicle
title: string          # Required
category: string       # Optional — default category for entries
tags: string[]         # Optional
events:
  - date: string       # Required
    label: string      # Required — short title on the timeline
    importance: 1|2|3|4|5   # Optional
    category: string   # Optional — overrides chronicle-level category
    tags: string[]     # Optional
    anchor: string     # Optional — links to a paragraph block (^anchor)
---
```
