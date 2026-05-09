# Notion block

Bring Notion-like block interactions to Obsidian Live Preview.

## Features

### 1. Hover Handles
- Hover over any line to reveal `+` (Add) and `⠿` (Drag/Transform) handles.
- Smooth transitions and clean UI integrated with your Obsidian theme.

### 2. Drag & Drop
- **Long-press** the `⠿` handle (150ms) to drag a block.
- **Visual indicators**: A ghost element follows your cursor, and a blue line shows the insertion point.
- **Modes**: Switch between **Line mode** and **Paragraph mode** via the context menu (right-click the `⠿` handle).

### 3. Transformation Menu
- Click the `⠿` handle to convert a block to:
    - Headings (H1, H2, H3)
    - Lists (Bullet, Numbered, Todo)
    - Advanced blocks: Code, Math, Divider, and Callouts (12 variants).

### 4. Smart Insert Menu
- Click the `+` button to open a fuzzy-searchable menu.
- **Keyboard navigation**: Search for block types and insert them instantly.
- **Support for**: Internal/External links, Tags, Footnotes, Tables, and Frontmatter.

## Installation

### Manual
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [Release](https://github.com/BCS1037/notion-block/releases).
2. Move them to `<vault>/.obsidian/plugins/notion-block/`.
3. Enable the plugin in settings.

## Developer Policies
This plugin adheres to the [Obsidian Developer Policies](https://docs.obsidian.md/Developer+policies).

## License
MIT License.
