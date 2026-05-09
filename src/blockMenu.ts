import { Menu, App, MenuItem } from "obsidian";
import { EditorView } from "@codemirror/view";
import { transformLine, insertBlock } from "./blockTransform";
import NotionBlock from "./main";

/**
 * Shared data for block types
 */
const BASIC_BLOCKS = [
    { type: "paragraph", label: "Text", icon: "pilcrow" },
    { type: "h1", label: "Heading 1", icon: "heading-1" },
    { type: "h2", label: "Heading 2", icon: "heading-2" },
    { type: "h3", label: "Heading 3", icon: "heading-3" },
    { type: "bullet", label: "Bullet list", icon: "list" },
    { type: "numbered", label: "Numbered list", icon: "list-ordered" },
    { type: "todo", label: "Todo list", icon: "check-square" },
    { type: "blockquote", label: "Quote", icon: "quote" },
    { type: "code", label: "Code block", icon: "code" },
    { type: "math", label: "Math block", icon: "sigma" },
    { type: "divider", label: "Divider", icon: "minus" },
];

const ADVANCED_BLOCKS = [
    { type: "link", label: "Internal link", icon: "link" },
    { type: "ext-link", label: "External link", icon: "link-2" },
    { type: "embed", label: "Embed / Attachment", icon: "image" },
    { type: "tag", label: "Tag", icon: "tag" },
    { type: "footnote", label: "Footnote", icon: "hash" },
    { type: "comment", label: "Comment", icon: "message-square" },
    { type: "today", label: "Today", icon: "calendar" },
    { type: "time", label: "Current time", icon: "clock" },
    { type: "table", label: "Table", icon: "table" },
    { type: "frontmatter", label: "Frontmatter / Properties", icon: "settings" },
];

const CALLOUT_TYPES = ["note", "info", "todo", "tip", "success", "question", "warning", "failure", "danger", "bug", "example", "quote"];
const CALLOUT_ICONS: Record<string, string> = {
    note: "pencil", info: "info", todo: "check-square", tip: "sparkles", 
    success: "check", question: "help-circle", warning: "alert-triangle", 
    failure: "x-circle", danger: "zap", bug: "bug", example: "list", quote: "quote"
};

/**
 * Helper to add Callout Submenu
 */
function addCalloutSubmenu(menu: Menu, view: EditorView, lineNo: number, mode: "transform" | "insert", plugin?: NotionBlock) {
    menu.addItem((item) => {
        const sub = (item as any).setSubmenu();
        item.setTitle("Callout").setIcon("megaphone");
        
        CALLOUT_TYPES.forEach(type => {
            sub.addItem((subItem: MenuItem) => {
                subItem.setTitle(type.charAt(0).toUpperCase() + type.slice(1))
                       .setIcon(CALLOUT_ICONS[type] || "megaphone")
                       .onClick(() => {
                           if (mode === "transform") {
                               transformLine(view, lineNo, `callout-${type}`);
                           } else if (plugin) {
                               insertBlock(plugin, view, lineNo, `callout-${type}`);
                           }
                       });
            });
        });
    });
}

/**
 * Transform Menu (⠿ handle)
 * Focuses on converting the current block's type
 */
export function showTransformMenu(plugin: NotionBlock, view: EditorView, lineNo: number, pos: { x: number, y: number } | MouseEvent) {
    const menu = new Menu();

    BASIC_BLOCKS.forEach((block, index) => {
        if (index === 1 || index === 4) menu.addSeparator();

        menu.addItem((item) => {
            item.setTitle(block.label)
                .setIcon(block.icon)
                .onClick(() => transformLine(view, lineNo, block.type));
        });
    });

    menu.addSeparator();
    addCalloutSubmenu(menu, view, lineNo, "transform");

    // Also include 'Comment' as a transformation (wrapping the line)
    menu.addItem((item) => {
        item.setTitle("Comment")
            .setIcon("message-square")
            .onClick(() => transformLine(view, lineNo, "comment"));
    });

    if (pos instanceof MouseEvent) {
        menu.showAtMouseEvent(pos);
    } else {
        menu.showAtPosition(pos);
    }
}

/**
 * Insert Menu (+ button)
 * Focuses on adding new blocks below the current one
 */
export function showInsertMenu(plugin: NotionBlock, view: EditorView, lineNo: number, pos: { x: number, y: number }) {
    const menu = new Menu();

    // Group 1: Basic Text
    BASIC_BLOCKS.forEach((block, index) => {
        if (index === 1 || index === 4) menu.addSeparator();
        menu.addItem((item) => {
            item.setTitle(block.label)
                .setIcon(block.icon)
                .onClick(() => insertBlock(plugin, view, lineNo, block.type));
        });
    });

    // Group 2: Callout
    menu.addSeparator();
    addCalloutSubmenu(menu, view, lineNo, "insert", plugin);

    // Group 3: Advanced & Meta
    menu.addSeparator();
    ADVANCED_BLOCKS.forEach((block) => {
        menu.addItem((item) => {
            item.setTitle(block.label)
                .setIcon(block.icon)
                .onClick(() => insertBlock(plugin, view, lineNo, block.type));
        });
    });

    menu.showAtPosition(pos);
}
