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
11. [PDF Export](#11-pdf-export)
12. [Settings](#12-settings)
13. [Keyboard Shortcuts](#13-keyboard-shortcuts)
14. [Frontmatter Reference](#14-frontmatter-reference)

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
| `cover-image` | string | No | Relative path to an image shown in the event panel |
| `has-subtimeline` | boolean | No | Marks this event as having a sub-timeline |
| `subtimeline-path` | string | No | Relative path to the sub-timeline folder |
| `links` | array | No | Internal links to other events |
| `references` | array | No | External reference URLs |

### Date formats

Tecius does **not** use JavaScript's `Date` object internally, so historical dates before 1970 and imprecise dates work correctly.

| Format | Example | Precision auto-detected |
|---|---|---|
| Year only | `1789` | year |
| Year + month | `1789-07` | month |
| Full date | `1789-07-14` | day |
| Full date + time | `1789-07-14` + `time: "10:30"` | hour |

Use `circa: true` to display the date with a `~` prefix indicating approximation.

### Internal links

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

A chronicle is a single `.md` file that generates **multiple events** on the timeline. It is useful when you want to group related milestones in one document — a biography, a project log, a series of discoveries.

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

When inside a timeline, sub-timelines appear in the event list and on the canvas. Click on a sub-timeline card to navigate into it. The breadcrumb bar at the top of the view shows your current depth and lets you jump back to any ancestor level.

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
- **Event dots** — size reflects the importance value; click to open the event panel
- **Cluster dots** — when multiple events overlap at the current zoom level, they merge into a cluster dot; click to expand

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

Each timeline can have an `_assets/` subfolder for images, PDFs, and other files. Assets stored there can be referenced in event front matter or bodies using relative paths:

```yaml
cover-image: ./_assets/portrait.jpg
```

```markdown
![Battle map](_assets/battle-map.png)
```

The Asset Manager panel (accessible from the timeline header) lists all assets in the current timeline and allows uploading new files.

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

## 11. PDF Export

Any timeline can be exported as a PDF:

1. Open the timeline
2. Click the export button in the timeline header
3. Choose the output file location
4. Tecius generates a print-ready PDF with all events and their content

---

## 12. Settings

Accessible via the sidebar. Available options:

| Setting | Description |
|---|---|
| **Language** | Switch between Portuguese (PT) and English (EN) |
| **Theme** | Light or Dark mode |

---

## 13. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl` + `Scroll` | Zoom in / out on the canvas |
| `←` `→` | Navigate slides on the onboarding carousel |
| `Enter` | Confirm inline rename |
| `Escape` | Cancel inline rename |

---

## 14. Frontmatter Reference

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
