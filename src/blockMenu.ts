import { Menu, App, FuzzySuggestModal, FuzzyMatch } from "obsidian";
import { EditorView } from "@codemirror/view";
import { transformLine, insertBlock } from "./blockTransform";
import NotionBlock from "./main";

export function showTransformMenu(app: App, view: EditorView, lineNo: number, event: MouseEvent) {
    const menu = new Menu();

    menu.addItem((item) =>
        item
            .setTitle("Text")
            .setIcon("pilcrow")
            .onClick(() => transformLine(view, lineNo, "paragraph"))
    );

    menu.addSeparator();

    menu.addItem((item) =>
        item
            .setTitle("Heading 1")
            .setIcon("heading-1")
            .onClick(() => transformLine(view, lineNo, "h1"))
    );

    menu.addItem((item) =>
        item
            .setTitle("Heading 2")
            .setIcon("heading-2")
            .onClick(() => transformLine(view, lineNo, "h2"))
    );

    menu.addItem((item) =>
        item
            .setTitle("Heading 3")
            .setIcon("heading-3")
            .onClick(() => transformLine(view, lineNo, "h3"))
    );

    menu.addSeparator();

    menu.addItem((item) =>
        item
            .setTitle("Bullet list")
            .setIcon("list")
            .onClick(() => transformLine(view, lineNo, "bullet"))
    );

    menu.addItem((item) =>
        item
            .setTitle("Numbered list")
            .setIcon("list-ordered")
            .onClick(() => transformLine(view, lineNo, "numbered"))
    );

    menu.addItem((item) =>
        item
            .setTitle("Todo list")
            .setIcon("check-square")
            .onClick(() => transformLine(view, lineNo, "todo"))
    );

    menu.addItem((item) =>
        item
            .setTitle("Quote")
            .setIcon("quote")
            .onClick(() => transformLine(view, lineNo, "blockquote"))
    );

    menu.addItem((item) =>
        item
            .setTitle("Code block")
            .setIcon("code")
            .onClick(() => transformLine(view, lineNo, "code"))
    );

    menu.addItem((item) =>
        item
            .setTitle("Math block")
            .setIcon("sigma")
            .onClick(() => transformLine(view, lineNo, "math"))
    );

    menu.addItem((item) =>
        item
            .setTitle("Divider")
            .setIcon("minus")
            .onClick(() => transformLine(view, lineNo, "divider"))
    );

    menu.addSeparator();

    // Callout Submenu
    menu.addItem((item) => {
        const sub = (item as any).setSubmenu();
        item.setTitle("Callout").setIcon("megaphone");
        
        const calloutTypes = ["note", "info", "todo", "tip", "success", "question", "warning", "failure", "danger", "bug", "example", "quote"];
        
        calloutTypes.forEach(type => {
            sub.addItem((subItem: any) => {
                subItem.setTitle(type.charAt(0).toUpperCase() + type.slice(1))
                       .onClick(() => transformLine(view, lineNo, `callout-${type}`));
            });
        });
    });

    menu.showAtMouseEvent(event);
}

interface BlockItem {
    type: string;
    label: string;
    icon: string;
}

const ALL_BLOCKS: BlockItem[] = [
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
    { type: "callout-note", label: "Callout: Note", icon: "megaphone" },
    { type: "callout-info", label: "Callout: Info", icon: "info" },
    { type: "callout-tip", label: "Callout: Tip", icon: "sparkles" },
    { type: "callout-warning", label: "Callout: Warning", icon: "alert-triangle" },
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

class BlockInsertModal extends FuzzySuggestModal<BlockItem> {
    constructor(private plugin: NotionBlock, private view: EditorView, private lineNo: number) {
        super(plugin.app);
        this.setPlaceholder("Type a block type...");
    }

    getItems(): BlockItem[] {
        return ALL_BLOCKS;
    }

    getItemText(item: BlockItem): string {
        return item.label;
    }

    onChooseItem(item: BlockItem, evt: MouseEvent | KeyboardEvent): void {
        insertBlock(this.plugin, this.view, this.lineNo, item.type);
    }

    renderSuggestion(match: FuzzyMatch<BlockItem>, el: HTMLElement): void {
        el.createDiv({ cls: "block-suggest-item" }, (div) => {
            // In a real scenario, we'd use Obsidian's setIcon, but this is a simple mockup
            div.createSpan({ cls: "block-suggest-icon" }).innerText = "•"; 
            div.createSpan({ cls: "block-suggest-label" }).innerText = match.item.label;
        });
    }
}

export function showInsertMenu(plugin: NotionBlock, view: EditorView, lineNo: number) {
    const modal = new BlockInsertModal(plugin, view, lineNo);
    modal.open();
}
