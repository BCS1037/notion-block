# Notion Block for Obsidian

Bring Notion-like block interactions to Obsidian's Live Preview mode.

Requires the desktop version of Obsidian 1.8.7 or later.

<img width="430" height="562" alt="image" src="https://github.com/user-attachments/assets/f84c7e2f-a3f9-49e6-872c-b394f9aeb2c4" />


## Features

### 1. Smooth Follow Handles
- Handles smoothly follow your mouse vertically in the gutter area, automatically aligning with the line you're pointing at.
- A single `⠿` handle is shown by default to keep the gutter compact.
- Allows you to perform actions on any line without needing to move the cursor first.

### 2. Block Action Menu (`⠿`)
- Click the handle to open block actions, including insertion, conversion, colors, copying links, and deletion.
- Convert current blocks to:
    - Headings (H1, H2, H3)
    - Lists (Bullet, Numbered, Todo)
    - Advanced Blocks (Code, Math, Divider, Quote)
    - Callouts (supports 12 built-in types)

### 3. Quick Insert Menu
- Click `⠿` to see **Turn into** above **Add** in a single column. Click either group heading to collapse or expand it; each group remembers its state.
- Both groups start expanded. Their command orders and visibility settings are independent. Use Enter / Space or the left / right arrow keys on a group heading to collapse or expand it.
- In **Menu commands** settings, choose which commands stay expanded and which appear under each group's **More** entry. Use **Back** or the left arrow key to return from More.
- Drag a command's right-hand grip to reorder it within its group, directly in the popup or in settings. Orders save automatically; Alt + Up / Down on a focused grip also works. Each group can be reset to defaults.
- Insert code blocks, math blocks, Callouts, links, images, tables, dates, times, footnotes, and comments. Block content is added below a nonempty line; inline content keeps its existing insertion behavior.
- After insertion, focus returns to the editor so you can keep typing. Changes remain undoable.
- Enable **Show separate add button** in plugin settings to restore a `+` button that opens the insertion list directly.

### 4. Drag & Drop
- Long-press the handle (150ms) to drag and reorder blocks visually.
- Dragging and **Turn into** share the same scope: a selection takes priority; otherwise use the current paragraph, list item with its descendants, or quote/callout body line. First list items and quote lines follow the same rules as later ones.
- Code blocks, tables, and math blocks stay intact. A callout title handle controls the whole callout.
- Choose **Select whole block** in the block menu or the handle's context menu to select an entire list, quote, or callout before moving or converting it.
- Drop into a list, quote, or callout to add content at that position; move right or left over a list to nest or outdent.

## Installation

### Manual
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest Release](https://github.com/BCS1037/notion-block/releases).
2. Move the files to your vault's plugin folder: `<vault>/.obsidian/plugins/notion-block/`.
3. Enable the plugin in Obsidian settings.

## Support
If this plugin helps you, consider supporting its development: [赞赏作者](https://ifdian.net/a/bcs1037)

## Security & Compliance
This plugin strictly follows [Obsidian Developer Policies](https://docs.obsidian.md/Developer+policies). It avoids using `innerHTML` and ensures all DOM manipulations are safe and performant.

## License
MIT License.
