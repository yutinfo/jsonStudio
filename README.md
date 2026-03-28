# JSON Studio

A browser-based JSON viewer and editor built with plain HTML, CSS, and JavaScript, using Tailwind CSS for styling. No build step required — open it directly or serve it with a minimal Node.js static server.

## Features

### Raw JSON Editor

- Syntax-highlighted textarea with line-number gutter (hidden in wrap mode)
- Live validation: status bar shows parse errors in real time
- Apply changes to the structured views via **Cmd/Ctrl+Enter** or the **Apply Raw** button
- **Prettify** button formats and re-indents the JSON; it pulses with a hint animation when the raw text is dirty and valid
- Word-wrap toggle (preserves preference across sessions)

### Pretty View

- Syntax-highlighted, read-only view of the full JSON document
- Color-coded tokens: keys (blue), strings (green), numbers (cyan), booleans (amber), null (grey), braces (slate)
- Automatic line numbers via CSS counters
- **Collapse / expand** any object or array with a toggle button (▼ / ▶); collapsed nodes show a count summary (e.g. `3 keys`)
- **Search integration**: matching rows are highlighted with an amber background; collapsed nodes containing matches are automatically expanded; matched text is highlighted inline with a darker mark

### Tree View

- Recursive, collapsible tree of all JSON nodes
- **Expand All / Collapse All** header buttons
- Inline primitive editor per node: change type (string / number / boolean / null) and value, then click **Apply**
- **+ Key** button on objects to add a new key (prompted by the browser)
- **+ Item** button on arrays to append a new element
- **Delete** button on every non-root node (with confirmation modal)
- Nodes are limited to 200 children in the tree to keep rendering fast; overflow is noted with a hint to use search or table view

### Table View

- Renders any array-of-objects or plain object as a styled, scrollable table
- **Breadcrumb navigation**: click any cell that contains an object or array to drill down; use the breadcrumb bar to navigate back
- **Column filter dropdown**: searchable checkbox list to show/hide individual columns per breadcrumb level; All / None toggle; hidden-column count badge
- **Inline cell editing**: click any primitive cell (string, number, boolean) to edit it in place — commits on Enter / blur, cancels on Escape
- **Delete column** button (×) in each table header cell — removes the column from all rows with confirmation
- **Export filtered view**: opens a modal with the current visible rows/columns serialized as JSON; supports Copy and Save File
- **Pagination**: page sizes 20 / 50 / 100 / All; Prev / Next navigation; resets on search or navigation
- **Search integration**: matching cells are highlighted; matched text is highlighted inline with a darker mark

### Extract Modal

- Open from the **Extract** toolbar button
- Enter a **key to find** and an optional **root ID field** (default: `id`)
- Recursively prunes the entire JSON to return only nodes that contain the target key, preserving the ID field alongside
- Results shown in a readonly textarea with a **Copy JSON** button

### Delete by Key

- Multi-select dropdown in the toolbar (**Select columns…**)
- Searchable list of all keys visible in the current view (or all keys at root)
- Select All / None shortcuts; selection count badge
- **Delete Key** button counts every matching node across the entire document and asks for confirmation before deleting

### Search

- Search box in the raw-panel header filters all structured views in real time (debounced: 150 ms normal, 400 ms for large files)
- **Pretty view**: highlights matching rows (light amber background) and matched text (dark amber mark); auto-expands collapsed nodes containing matches; match count shown next to the input
- **Tree view**: switches to a flat search-results list showing path, key, and value; capped at 500 results
- **Table view**: filters to matching rows/keys and highlights matched text inline; match count shown next to the input
- Clearing the query restores the normal view

### File Operations

| Action | Description |
| --- | --- |
| **Sample** | Load the built-in demo JSON |
| **Upload** | Read a `.json` file from disk |
| **Download** | Save the current raw text as `edited-json.json` |
| **Copy** | Write raw JSON to the clipboard |
| **Undo** | Restore the previous state (up to 30 steps) |
| **Reset** | Replace with the default sample (with confirmation) |

### UI / UX

- **Three structured views**: Pretty (read-only, syntax-highlighted), Tree (editable), Table (editable)
- **Dark mode toggle** — remembers preference in `localStorage`; defaults to the OS preference
- **Draggable panel resizer** between the Raw and Structured panels; remembers width in `localStorage`
- Compact button system (`btn-tool`) used consistently across toolbar, filter bar, and modals
- Toast notifications (success / error / info) auto-dismiss after 3.2 s
- Confirmation modal for all destructive operations
- JSON stats bar: total keys, nodes, and nesting depth

## Folder Structure

```text
.
├── package.json
├── server.js
├── README.md
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
└── gas/
    ├── code.gs
    ├── index.html
    └── app.html
```

## Run Locally

1. Make sure Node.js 18+ is installed.
1. From the project folder, run:

```bash
npm start
```

1. Open `http://localhost:3000`

The server (`server.js`) is a zero-dependency static file server. Tailwind CSS is loaded from the CDN, so no npm build step is needed.

## Deploy to Google Apps Script

Google Apps Script (GAS) cannot serve separate `.css` and `.js` files. The `gas/` folder contains three pre-assembled files ready to be pasted into a GAS project.

### Files

| File | Purpose |
| --- | --- |
| `gas/code.gs` | `doGet()` entry point and `include()` helper |
| `gas/index.html` | Full HTML with CSS inlined in a `<style>` tag and `<?!= include('app') ?>` for the script |
| `gas/app.html` | The full `app.js` wrapped in a `<script>` tag |

### Deployment Steps

1. Go to [script.google.com](https://script.google.com) and create a new project.
1. Rename the default `Code.gs` file and paste the contents of `gas/code.gs`.
1. Create a new HTML file named **`index`** and paste the contents of `gas/index.html`.
1. Create a new HTML file named **`app`** and paste the contents of `gas/app.html`.
1. Click **Deploy → New deployment**, choose **Web app**, set access to "Anyone" (or your organisation), and click **Deploy**.
1. Open the deployment URL in your browser.

> The Tailwind CSS CDN and Google Fonts CDN links in `index.html` work normally in GAS web apps.
