# erd-as-document

[日本語版 README はこちら](README.ja.md)

`erd-as-document` is an OSS tool that takes Rails application's `schema.rb` as input to visualize DB structure, transforming **ERD from "something to look at" into "a tool for thinking"**.

- Reduce the cost of understanding large-scale DB structures
- Extract only the tables and relationships you need, organized by context
- Serve as a guide for understanding Rails app design through layout and perspective adjustments

---

## Concept

- ERD is not a "deliverable" but a "work in progress of thinking"
- ERD is not just auto-generated, but **selected and arranged**
- Express **context-specific structure** rather than the entire DB overview

---

## Use Cases

- Understanding the DB structure of existing Rails apps
- Generating ER diagrams from `schema.rb`
- Viewing only tables related to specific screens or features
- Handling large numbers of tables that are difficult to grasp with standard ERD tools
- Getting assistance to understand "why this structure exists"

---

## What This Tool Does NOT Do

- Does not have its own database
- Does not rely solely on auto-layout for ERD
- Does not Git-manage user data

---

## Project Structure (Single Repository)

    erd-as-document/
    ├── app/                        # Nuxt source directory
    │   ├── app.vue
    │   ├── components/
    │   │   ├── ErdCanvas.vue       # ERD rendering
    │   │   ├── TableNode.vue       # Table rendering
    │   │   └── TableSelector.vue   # Table selection UI
    │   └── types/
    │       └── er-schema.ts        # Type definitions
    ├── scripts/
    │   ├── parse-schema.ts         # schema.rb → ER JSON
    │   └── types.ts                # Type definitions
    ├── server/
    │   ├── api/states/             # State save/load API
    │   │   ├── list.get.ts
    │   │   └── save.post.ts
    │   └── plugins/
    │       └── schema-watcher.ts   # Auto-regenerate on schema.rb changes
    ├── public/
    │   └── storage/
    │       └── config.json.example # Config template
    ├── nuxt.config.ts
    ├── tsconfig.json
    ├── package.json
    ├── .gitignore
    ├── CLAUDE.md
    ├── README.md
    └── README.ja.md

---

## Usage Flow

### 1. Setup and Start

```bash
# 1. Create the config file
cp public/storage/config.json.example public/storage/config.json
```

Edit `public/storage/config.json` to set your `schemaPath` (absolute path, or relative to the project root):

```json
{
  "projects": [
    {
      "name": "my-project",
      "schemaPath": "/path/to/rails-app/db/schema.rb"
    }
  ]
}
```

```bash
# 2. Start the web app (ER JSON is auto-generated on startup)
npm run dev
# → Access at http://localhost:3000
```

ER JSON is generated automatically on startup, and any changes to `schema.rb` are detected and regenerated automatically.

> **Manual generation:**
> ```bash
> npx tsx scripts/parse-schema.ts path/to/schema.rb --name my-project
> ```

---

### 2. Load ER JSON

Select a project in the web app to load the ER JSON.

---

### 3. Select Tables and Relationships to Display

The UI allows you to:

- Select tables to display (checkboxes)
- Toggle relationship display (ON / OFF)
- Highlight tables (★ button for orange emphasis)
- "Selected only" button to show only checked tables

**Table search feature** helps you quickly find tables from a large list.
Supports fuzzy search with subsequence matching (e.g., `usrord` → `user_orders`).

Use the button on the left edge of the window to hide the selection panel and expand the ERD display area.

By using checkboxes, you can create an **ERD focused on the context you want to understand**.

---

### 4. Manually Adjust Layout

Displayed tables can be freely positioned via drag & drop.

- Not dependent on auto-layout
- Layout is treated as part of "understanding and intent"
- Zoom feature to switch between overview and detail
- Toggle column display ON/OFF per table

---

### 5. Save ER Diagrams

Save the adjusted ERD state (selected tables, highlights, positions, zoom level, etc.).

- **Save**: Enter a name to save as new
- **Overwrite**: Overwrite the currently selected ER diagram

Saved ER diagrams can be selected from a dropdown in the UI.

**Example use cases:**
- `overview` - Layout for viewing the overall picture
- `user-management` - Display only tables related to user management
- `order-flow` - Layout of tables related to order flow

**Sharing states between projects:**
State files can be shared between projects that reference the same `schema.rb`. Simply copy the state file (e.g., `states/overview.json`) to another project's `states/` directory.

---

### 6. Favorite Projects and States

You can set favorites for projects and ER diagram states to streamline your workflow.

**Features:**
- **Auto-select on startup**: Favorited project and state are automatically loaded when you open the app
- **Quick access**: Click the ★/☆ button next to the project/state selector to toggle favorites
- **Visual feedback**: Toast notifications confirm when favorites are set or removed
- **One favorite per type**: Only one project and one state (per project) can be favorited at a time

**How to use:**
1. Select a project from the dropdown
2. Click the ☆ button next to the selector to set it as favorite (it turns to ★)
3. The next time you open the app, this project will be auto-selected
4. Same applies to saved ER diagram states

Favorites are stored in your browser's localStorage, so they persist across sessions.

---

### 7. Filter Display Tables

You can hide specific tables by setting `filter` in `public/storage/config.json`.

```json
// public/storage/config.json
{
  "projects": [
    {
      "name": "my-project",
      "schemaPath": "/path/to/schema.rb",
      "filter": {
        "exclude": {
          "tables": ["ar_internal_metadata", "schema_migrations"],
          "patterns": ["^tmp_", "^backup_"]
        }
      }
    }
  ]
}
```

- **tables**: Array of table names to exclude
- **patterns**: Array of regex patterns to exclude

Reload the browser after changing settings.

---

### 8. Custom Foreign Key Relationships

For non-standard foreign key columns that don't follow Rails naming conventions (e.g., `send_user_id` → `users`), you can explicitly define relationships in `config.json`.

```json
// public/storage/config.json
{
  "projects": [
    {
      "name": "my-project",
      "schemaPath": "/path/to/schema.rb",
      "relationships": {
        "messages": {
          "send_user_id": "users",
          "receiver_user_id": "users"
        },
        "payments": {
          "payer_company_id": "companies",
          "payee_company_id": "companies"
        }
      }
    }
  ]
}
```

**Priority order:**
1. Use `relationships` definition if exists (highest priority)
2. Fall back to automatic inference if no definition (`user_id` → `users`, etc.)

Restart `npm run dev` after changing settings.

---

### 9. About Auto-regeneration

While `npm run dev` is running, changes to `schema.rb` are detected and `er.json` is automatically regenerated.

- Works only in development environment
- Browser reload is required after regeneration
- Multiple projects can be managed by adding entries to the `projects` array in `config.json`

---

## About public/storage Directory

`public/storage/` is a temporary workspace for local use.

    public/storage/
    ├── config.json          # Project settings (user-created)
    ├── config.json.example  # Template file
    ├── projects.json        # Project list (auto-generated)
    ├── my-project/
    │   ├── er.json          # ER JSON (auto-generated)
    │   └── states/          # Multiple saved states
    │       ├── index.json   # State list (auto-generated)
    │       ├── overview.json
    │       └── user-flow.json
    ├── another-app/
    │   └── er.json
    └── ...

A directory is created for each project, holding the generated ER JSON and saved state files.
`projects.json` is automatically updated with the project list.

**These are all intermediate artifacts** and are not Git-managed.

Therefore, `public/storage/` is included in `.gitignore`.

---

## Development Setup

### Requirements

- Node.js v25.4.0 or higher (specified in `.node-version`)

### Installation

```bash
npm install
```

### Running

```bash
# 1. Copy and edit the config template
cp public/storage/config.json.example public/storage/config.json
# Edit config.json to set your schemaPath

# 2. Start the web app (ER JSON is auto-generated)
npm run dev
# → Access at http://localhost:3000
```

**Alternative: Manual generation**
```bash
npm run parse-schema -- path/to/schema.rb --name my-project
```

---

## Tech Stack

### Scripts

- TypeScript
- schema.rb parsing (text parsing)
- Execution: `npx tsx`

### Frontend

- Nuxt 4
- Vue 3
- SVG-based rendering
- Drag & Drop UI

---

## License

MIT License
