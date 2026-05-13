import { Menu, MenuItem, setIcon } from "obsidian";
import { EditorView } from "@codemirror/view";
import { transformLine, insertBlock } from "./blockTransform";
import NotionBlock from "./main";

/**
 * Shared data for block types
 * Standard Lucide names used here (heading1 instead of heading-1)
 */
const BASIC_BLOCKS = [
    { type: "paragraph", label: "Text", icon: "text" },
    { type: "h1", label: "Heading 1", icon: "heading1" },
    { type: "h2", label: "Heading 2", icon: "heading2" },
    { type: "h3", label: "Heading 3", icon: "heading3" },
    { type: "todo", label: "To-do list", icon: "check-square" },
    { type: "bullet", label: "Bulleted list", icon: "list" },
    { type: "numbered", label: "Numbered list", icon: "list-ordered" },
    { type: "toggle", label: "Toggle list", icon: "chevron-right" },
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
    note: "pencil", info: "info", todo: "check-square", tip: "flame", 
    success: "check", question: "help-circle", warning: "alert-triangle", 
    failure: "x-circle", danger: "zap", bug: "bug", example: "list", quote: "quote"
};

/**
 * Helper to add Menu Item with Icon
 * Simplified: Direct use of Obsidian native API
 */
function addMenuItemWithIcon(menu: Menu, label: string, icon: string, onClick: () => void): MenuItem {
    let itemRef: MenuItem;
    menu.addItem((item) => {
        item.setTitle(label)
            .setIcon(icon)
            .onClick(onClick);
        itemRef = item;
    });
    return itemRef!;
}

/**
 * Helper to add Callout Submenu
 */
function addCalloutSubmenu(menu: Menu, view: EditorView, lineNo: number, mode: "transform" | "insert", _plugin?: NotionBlock) {
    menu.addItem((item) => {
        const sub = (item as MenuItem & { setSubmenu: () => Menu }).setSubmenu();
        item.setTitle("Callout").setIcon("megaphone");
        
        CALLOUT_TYPES.forEach(type => {
            addMenuItemWithIcon(sub, type.charAt(0).toUpperCase() + type.slice(1), CALLOUT_ICONS[type] || "megaphone", () => {
                if (mode === "transform") {
                    transformLine(view, lineNo, `callout-${type}`);
                } else if (_plugin) {
                    insertBlock(_plugin, view, lineNo, `callout-${type}`);
                }
            });
        });
    });
}

/**
 * Transform Menu (⠿ handle)
 */
export function showTransformMenu(_plugin: NotionBlock, view: EditorView, lineNo: number, pos: { x: number, y: number } | MouseEvent) {
    const menu = new Menu();

    BASIC_BLOCKS.forEach((block, index) => {
        if (index === 1 || index === 4 || index === 8) menu.addSeparator();
        addMenuItemWithIcon(menu, block.label, block.icon, () => transformLine(view, lineNo, block.type));
    });

    menu.addSeparator();
    addCalloutSubmenu(menu, view, lineNo, "transform");

    // Also include 'Comment' as a transformation
    addMenuItemWithIcon(menu, "Comment", "message-square", () => transformLine(view, lineNo, "comment"));

    if (pos instanceof MouseEvent) {
        menu.showAtMouseEvent(pos);
    } else {
        menu.showAtPosition(pos);
    }
}

/**
 * Insert Menu (+ button)
 */
export function showInsertMenu(plugin: NotionBlock, view: EditorView, lineNo: number, pos: { x: number, y: number }) {
    const menu = new Menu();

    // Group 1: Basic Text
    BASIC_BLOCKS.forEach((block, index) => {
        if (index === 1 || index === 4 || index === 8) menu.addSeparator();
        addMenuItemWithIcon(menu, block.label, block.icon, () => insertBlock(plugin, view, lineNo, block.type));
    });

    // Group 2: Callout
    menu.addSeparator();
    addCalloutSubmenu(menu, view, lineNo, "insert", plugin);

    // Group 3: Advanced & Meta
    menu.addSeparator();
    ADVANCED_BLOCKS.forEach((block) => {
        addMenuItemWithIcon(menu, block.label, block.icon, () => insertBlock(plugin, view, lineNo, block.type));
    });

    menu.showAtPosition(pos);
}
