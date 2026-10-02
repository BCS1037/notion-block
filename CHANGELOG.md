# Changelog

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

[1.5.0]: https://github.com/BCS1037/notion-block/compare/1.4.0...1.5.0
