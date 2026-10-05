# Changelog

## [1.7.2] - 2026-10-05

### Fixed

- Restore drag-to-reorder commands in the block popup and plugin settings, including pop-out settings windows. Orders save when the drag finishes.
- Left-align menu group headings and command names in plugin settings.

### Changed

- Remove the redundant **Enable plugin** setting. Use Obsidian's community plugin manager to enable or disable the plugin.
- Remove the separate **+** button and its setting. **Add** commands remain available in the unified block menu.

## [1.7.1] - 2026-10-05

### Improved

- Find plugin settings through Obsidian's settings search on Obsidian 1.13 and newer. Earlier supported versions keep the existing settings page.

## [1.7.0] - 2026-10-05

### Added

- Drag blocks between open Markdown panes in the same window. Choose to move, copy, link to the original block, or embed it.
- Undo and redo each transfer together in both documents.

### Improved

- Preserve block IDs when moving content and assign fresh IDs when copying. Rebase copied or moved wikilinks and inline Markdown links and images for the destination note.
- Use Obsidian-native block references for quotes, callouts, lists, code blocks, tables, and math. Partial selections expand to a complete block where Obsidian requires it.
- Prevent moves that would break existing block references, and explain when a selected block cannot be safely linked.

## [1.6.0] - 2026-10-04

### Added

- Select an entire list, quote, or callout from the block menu before moving or converting it.
- Reorder list items by dragging, and change nesting by moving an item right or left.
- Drop content into a list, quote, or callout to add it at the hovered position.

### Changed

- Use one selection-first scope for dragging and **Turn into**. Remove the line/paragraph mode setting; list items and quote/callout body lines follow consistent rules.
- Treat adjacent block types as separate drag targets even when no blank line separates them. Keep code, table, and math blocks intact.

### Fixed

- Convert selected multi-line content into one callout while preserving its list and nested Markdown structure.
- Preserve content when converting between quotes and callouts, and when dragging a non-first quote line out of its quote.
- Drop content into the middle of lists, quotes, and callouts without moving it to an endpoint or adding unwanted blank lines.
- Normalize language identifiers and retain a fallback for older Obsidian language settings.

## [1.5.1] - 2026-10-03

### Fixed

- Keep the block handle clear of heading collapse arrows. Handles on other lines keep their usual position.
- Keep handles visible and clickable at editor edges and in narrow panes, including when the separate **+** button is enabled.
- Keep handle positioning stable when scrolling or moving the pointer onto the handle. Hidden handles no longer intercept clicks.
- Preserve mouse and touch handle interactions in pop-out windows.

## [1.5.0] - 2026-10-02

### Added

- Customize which commands appear directly in each menu group and which stay under **More**. Reset either group to its defaults.
- Reorder commands by dragging their grips in the popup or settings. **Alt + Up / Down** also changes their order.

### Changed

- Show one block handle by default. **Add** commands now share the block action menu; a setting restores the separate **+** button.
- Use a single-column popup with **Turn into** above **Add**. Collapse or expand either group independently; their states are remembered.
- Keep colors and block actions available below the scrollable command list.
- Update menu and settings labels in English, Simplified Chinese, and Traditional Chinese.

### Fixed

- Keep the popup open and preserve editor focus when saving command layouts. Failed saves restore the last saved layout, including after several rapid changes.
- Clean up menu listeners and drag state when interactions are cancelled or the plugin reloads.
- Detect the app language through Obsidian's supported API.

### Compatibility

- Requires Obsidian **1.8.7** or later.
- Remains a desktop-only plugin.

[1.7.2]: https://github.com/BCS1037/notion-block/compare/1.7.1...1.7.2
[1.7.1]: https://github.com/BCS1037/notion-block/compare/1.7.0...1.7.1
[1.7.0]: https://github.com/BCS1037/notion-block/compare/1.6.0...1.7.0
[1.6.0]: https://github.com/BCS1037/notion-block/compare/1.5.1...1.6.0
[1.5.1]: https://github.com/BCS1037/notion-block/compare/1.5.0...1.5.1
[1.5.0]: https://github.com/BCS1037/notion-block/compare/1.4.0...1.5.0
