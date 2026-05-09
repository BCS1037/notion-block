# Notion Block for Obsidian

Bring Notion-like block interactions to Obsidian's Live Preview mode.

## Features

### 1. Smooth Follow Handles
- Handles smoothly follow your mouse vertically in the gutter area, automatically aligning with the line you're pointing at.
- Allows you to perform actions on any line without needing to move the cursor first.

### 2. Block Transformation Menu (`⠿`)
- Click the handle to open a conversion menu using native Obsidian styling for a consistent look and feel.
- Convert current blocks to:
    - Headings (H1, H2, H3)
    - Lists (Bullet, Numbered, Todo)
    - Advanced Blocks (Code, Math, Divider, Quote)
    - Callouts (supports 12 built-in types)

### 3. Quick Insert Menu (`+`)
- Click the `+` button to insert a new line below and open a searchable insertion menu.
- Quickly add complex elements like Tables, Footnotes, and Frontmatter.

### 4. Drag & Drop
- Long-press the handle (150ms) to drag and reorder blocks visually.
- Toggle between **Line mode** (single physical line) and **Paragraph mode** (logical block) via the handle's context menu (right-click).

## Installation

### Manual
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest Release](https://github.com/BCS1037/notion-block/releases).
2. Move the files to your vault's plugin folder: `<vault>/.obsidian/plugins/notion-block/`.
3. Enable the plugin in Obsidian settings.

## Security & Compliance
This plugin strictly follows [Obsidian Developer Policies](https://docs.obsidian.md/Developer+policies). It avoids using `innerHTML` and ensures all DOM manipulations are safe and performant.

## License
MIT License.
