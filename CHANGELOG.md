# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-03-14

### Added
- Auto-select first project and state on initial load
- Favorite feature for projects and states
  - Store favorites in localStorage
  - Toggle favorites with ★/☆ buttons
  - Toast notifications when favorites change
  - Auto-load favorited items on startup
  - Only one favorite per type (new replaces old)

## [1.1.0] - 2026-03-14

### Added
- Custom foreign key relationship mapping feature
  - Define non-standard FK column mappings in `config.json` (e.g., `send_user_id` → `users`)
  - Explicit relationships take priority over automatic inference
  - Useful for columns that don't follow Rails naming conventions

## [1.0.0] - 2026-02-27

### Added
- Initial release
- Parse Rails `schema.rb` and generate ER diagrams
- Interactive table selection and filtering
- Drag-and-drop table positioning
- Save and load ER diagram states
- Auto-regeneration on schema.rb changes
- Table column expand/collapse
- Zoom and pan controls
- Export as SVG, PNG, and Mermaid format
- i18n support (English and Japanese)
- Smart snap guides for table alignment
