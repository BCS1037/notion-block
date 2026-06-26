import { Notice, setIcon } from "obsidian";
import { EditorView } from "@codemirror/view";
import NotionBlock from "./main";
import { transformLine } from "./blockTransform";

type MenuPage = "color" | "callout";
type MenuAction = () => void | Promise<void>;

interface ActionItem {
    id: string;
    label: string;
    icon: string;
    shortcut?: string;
    page?: MenuPage;
    action?: MenuAction;
}

interface ColorOption {
    id: string;
    label: string;
    value: string;
    className: string;
}

interface CalloutOption {
    type: string;
    label: string;
}

interface MenuPosition {
    x: number;
    y: number;
}

const TEXT_COLORS: ColorOption[] = [
    { id: "default", label: "默认文本", value: "", className: "is-default" },
    { id: "gray", label: "灰色文本", value: "var(--text-muted)", className: "is-gray" },
    { id: "brown", label: "棕色文本", value: "var(--color-orange)", className: "is-brown" },
    { id: "orange", label: "橙色文本", value: "var(--color-orange)", className: "is-orange" },
    { id: "yellow", label: "黄色文本", value: "var(--color-yellow)", className: "is-yellow" },
    { id: "green", label: "绿色文本", value: "var(--color-green)", className: "is-green" },
    { id: "blue", label: "蓝色文本", value: "var(--color-blue)", className: "is-blue" },
    { id: "purple", label: "紫色文本", value: "var(--color-purple)", className: "is-purple" },
    { id: "pink", label: "粉色文本", value: "var(--color-pink)", className: "is-pink" },
    { id: "red", label: "红色文本", value: "var(--color-red)", className: "is-red" },
];

const BACKGROUND_COLORS: ColorOption[] = [
    { id: "default", label: "默认背景", value: "", className: "is-default" },
    { id: "gray", label: "灰色背景", value: "rgba(var(--mono-rgb-100), 0.08)", className: "is-gray" },
    { id: "brown", label: "棕色背景", value: "rgba(var(--color-orange-rgb), 0.16)", className: "is-brown" },
    { id: "orange", label: "橙色背景", value: "rgba(var(--color-orange-rgb), 0.16)", className: "is-orange" },
    { id: "yellow", label: "黄色背景", value: "rgba(var(--color-yellow-rgb), 0.18)", className: "is-yellow" },
    { id: "green", label: "绿色背景", value: "rgba(var(--color-green-rgb), 0.16)", className: "is-green" },
    { id: "blue", label: "蓝色背景", value: "rgba(var(--color-blue-rgb), 0.16)", className: "is-blue" },
    { id: "purple", label: "紫色背景", value: "rgba(var(--color-purple-rgb), 0.16)", className: "is-purple" },
    { id: "pink", label: "粉色背景", value: "rgba(var(--color-pink-rgb), 0.16)", className: "is-pink" },
    { id: "red", label: "红色背景", value: "rgba(var(--color-red-rgb), 0.16)", className: "is-red" },
];

const CALLOUT_OPTIONS: CalloutOption[] = [
    { type: "note", label: "note" },
    { type: "info", label: "info" },
    { type: "todo", label: "todo" },
    { type: "tip", label: "tip" },
    { type: "success", label: "success" },
    { type: "question", label: "question" },
    { type: "warning", label: "warning" },
    { type: "failure", label: "failure" },
    { type: "danger", label: "danger" },
    { type: "bug", label: "bug" },
    { type: "example", label: "example" },
    { type: "quote", label: "quote" },
];

const CALLOUT_ICONS: Record<string, string> = {
    note: "pencil",
    abstract: "clipboard-list",
    summary: "clipboard-list",
    tldr: "clipboard-list",
    info: "info",
    todo: "check-circle",
    tip: "flame",
    hint: "flame",
    important: "flame",
    success: "check",
    check: "check",
    done: "check",
    question: "help-circle",
    help: "help-circle",
    faq: "help-circle",
    warning: "alert-triangle",
    caution: "alert-triangle",
    attention: "alert-triangle",
    failure: "x-circle",
    fail: "x-circle",
    missing: "x-circle",
    danger: "zap",
    error: "zap",
    bug: "bug",
    example: "list",
    quote: "quote",
    cite: "quote",
};

const OPEN_MENUS = new Set<NotionBlockActionMenu>();

export function showNotionBlockActionMenu(
    plugin: NotionBlock,
    view: EditorView,
    lineNo: number,
    pos: MenuPosition
): void {
    closeNotionBlockActionMenus();
    const menu = new NotionBlockActionMenu(plugin, view, lineNo, pos);
    OPEN_MENUS.add(menu);
    menu.open();
}

export function closeNotionBlockActionMenus(): void {
    OPEN_MENUS.forEach((menu) => menu.close());
    OPEN_MENUS.clear();
}

class NotionBlockActionMenu {
    private readonly plugin: NotionBlock;
    private readonly view: EditorView;
    private readonly lineNo: number;
    private readonly pos: MenuPosition;
    private readonly ownerDocument: Document;
    private readonly ownerWindow: Window;
    private rootEl: HTMLElement | null = null;
    private submenuEl: HTMLElement | null = null;
    private listEl: HTMLElement | null = null;
    private activeIndex = 0;
    private visibleItems: ActionItem[] = [];
    private readonly handlePointerDown = (event: PointerEvent): void => this.onPointerDown(event);
    private readonly handleKeyDown = (event: KeyboardEvent): void => this.onKeyDown(event);

    constructor(plugin: NotionBlock, view: EditorView, lineNo: number, pos: MenuPosition) {
        this.plugin = plugin;
        this.view = view;
        this.lineNo = lineNo;
        this.pos = pos;
        this.ownerDocument = view.dom.ownerDocument;
        this.ownerWindow = this.ownerDocument.defaultView ?? activeWindow;
    }

    open(): void {
        this.rootEl = this.ownerDocument.body.createDiv({ cls: "wk-nb-action-menu" });
        this.rootEl.setAttribute("role", "menu");
        this.rootEl.tabIndex = -1;
        this.rootEl.style.left = `${this.pos.x}px`;
        this.rootEl.style.top = `${this.pos.y}px`;

        this.listEl = this.rootEl.createDiv({ cls: "wk-nb-action-menu-list" });
        this.renderList();
        this.reposition();

        this.rootEl.focus();
        this.ownerDocument.addEventListener("pointerdown", this.handlePointerDown, true);
        this.ownerDocument.addEventListener("keydown", this.handleKeyDown, true);
    }

    close(): void {
        this.ownerDocument.removeEventListener("pointerdown", this.handlePointerDown, true);
        this.ownerDocument.removeEventListener("keydown", this.handleKeyDown, true);
        this.closeFloatingSubmenu();
        this.rootEl?.remove();
        this.rootEl = null;
        OPEN_MENUS.delete(this);
    }

    private renderList(): void {
        if (!this.listEl) return;
        this.listEl.empty();

        const transformItems = this.getTurnIntoItems();
        const colorItems = this.getColorEntryItems();
        const blockItems = this.getBlockActionItems();
        this.visibleItems = [...transformItems, ...colorItems, ...blockItems];

        this.renderSection("转换成", transformItems);
        this.renderSeparator();
        this.renderSection("", colorItems);
        this.renderSeparator();
        this.renderSection("", blockItems);
        this.reposition();
    }

    private getTurnIntoItems(): ActionItem[] {
        return [
            { id: "paragraph", label: "文本", icon: "text", action: () => this.runTransform("paragraph") },
            { id: "h1", label: "标题 1", icon: "heading1", action: () => this.runTransform("h1") },
            { id: "h2", label: "标题 2", icon: "heading2", action: () => this.runTransform("h2") },
            { id: "h3", label: "标题 3", icon: "heading3", action: () => this.runTransform("h3") },
            { id: "todo", label: "待办列表", icon: "check-square", action: () => this.runTransform("todo") },
            { id: "bullet", label: "无序列表", icon: "list", action: () => this.runTransform("bullet") },
            { id: "numbered", label: "有序列表", icon: "list-ordered", action: () => this.runTransform("numbered") },
            { id: "blockquote", label: "引用", icon: "quote", action: () => this.runTransform("blockquote") },
            { id: "code", label: "代码块", icon: "code", action: () => this.runTransform("code") },
            { id: "math", label: "数学块", icon: "sigma", action: () => this.runTransform("math") },
            { id: "divider", label: "分割线", icon: "minus", action: () => this.runTransform("divider") },
            { id: "callout", label: "Callout", icon: this.getCurrentCalloutIcon(), page: "callout" },
        ];
    }

    private getColorEntryItems(): ActionItem[] {
        return [
            { id: "color", label: "颜色", icon: "paint-roller", page: "color" },
        ];
    }

    private getBlockActionItems(): ActionItem[] {
        return [
            { id: "copy-link", label: "拷贝区块链接", icon: "link", shortcut: "⌘⌃L", action: () => this.copyBlockLink() },
            { id: "delete", label: "删除", icon: "trash-2", shortcut: "Del", action: () => this.deleteLine() },
        ];
    }

    private getTextColorItems(): ActionItem[] {
        return TEXT_COLORS.map((color): ActionItem => ({
            id: `text-${color.id}`,
            label: color.label,
            icon: "letter-text",
            action: () => this.applyTextColor(color)
        }));
    }

    private getBackgroundColorItems(): ActionItem[] {
        return BACKGROUND_COLORS.map((color): ActionItem => ({
            id: `bg-${color.id}`,
            label: color.label,
            icon: "paint-bucket",
            action: () => this.applyBackgroundColor(color)
        }));
    }

    private getCalloutItems(): ActionItem[] {
        return CALLOUT_OPTIONS.map((option): ActionItem => ({
            id: `callout-${option.type}`,
            label: option.label,
            icon: this.getCalloutIcon(option.type),
            action: () => this.runTransform(`callout-${option.type}`)
        }));
    }

    private renderSection(title: string, items: ActionItem[], colorOptions?: ColorOption[]): void {
        if (!this.listEl || items.length === 0) return;
        if (title) {
            this.listEl.createDiv({ cls: "wk-nb-action-menu-section", text: title });
        }
        items.forEach((item) => this.renderItem(item, colorOptions?.find((color) => item.id.endsWith(color.id))));
    }

    private renderSeparator(): void {
        this.listEl?.createDiv({ cls: "wk-nb-action-menu-separator" });
    }

    private renderItem(item: ActionItem, color?: ColorOption): void {
        if (!this.listEl) return;
        const index = this.visibleItems.indexOf(item);
        const row = this.listEl.createDiv({
            cls: `wk-nb-action-menu-row${index === this.activeIndex ? " is-active" : ""}`,
            attr: { role: "menuitem" }
        });

        const iconWrap = row.createSpan({ cls: "wk-nb-action-menu-icon" });
        if (color) {
            iconWrap.addClass("wk-nb-action-menu-color-icon", color.className);
            iconWrap.setText(item.id.startsWith("text-") ? "A" : "");
        } else {
            setIcon(iconWrap, item.icon);
        }
        row.createSpan({ cls: "wk-nb-action-menu-label", text: item.label });

        if (item.shortcut) {
            row.createSpan({ cls: "wk-nb-action-menu-shortcut", text: item.shortcut });
        }
        if (item.page) {
            setIcon(row.createSpan({ cls: "wk-nb-action-menu-chevron" }), "chevron-right");
        }

        row.addEventListener("mouseenter", () => {
            this.activeIndex = Math.max(0, index);
            this.refreshActiveRows();
            this.syncFloatingSubmenuForItem(item);
        });
        row.addEventListener("click", () => {
            void this.activateItem(item);
        });
    }

    private renderFloatingSubmenu(page: MenuPage): void {
        if (!this.rootEl) return;
        this.submenuEl?.remove();
        this.submenuEl = this.ownerDocument.body.createDiv({ cls: `wk-nb-action-menu wk-nb-action-submenu is-${page}` });
        this.submenuEl.setAttribute("role", "menu");

        if (page === "color") {
            this.renderFloatingSection(this.submenuEl, "文本颜色", this.getTextColorItems(), TEXT_COLORS);
            this.submenuEl.createDiv({ cls: "wk-nb-action-menu-separator" });
            this.renderFloatingSection(this.submenuEl, "背景颜色", this.getBackgroundColorItems(), BACKGROUND_COLORS);
        } else {
            this.renderFloatingSection(this.submenuEl, "Callout", this.getCalloutItems());
        }
        this.positionFloatingSubmenu();
    }

    private closeFloatingSubmenu(): void {
        this.submenuEl?.remove();
        this.submenuEl = null;
    }

    private syncFloatingSubmenuForItem(item: ActionItem | undefined): void {
        if (item?.page) {
            this.renderFloatingSubmenu(item.page);
            return;
        }
        this.closeFloatingSubmenu();
    }

    private renderFloatingSection(container: HTMLElement, title: string, items: ActionItem[], colors?: ColorOption[]): void {
        container.createDiv({ cls: "wk-nb-action-menu-section", text: title });
        items.forEach((item) => {
            const color = colors?.find((option) => item.id.endsWith(option.id));
            const row = container.createDiv({ cls: "wk-nb-action-menu-row", attr: { role: "menuitem" } });
            const iconWrap = row.createSpan({ cls: "wk-nb-action-menu-icon" });
            if (color) {
                iconWrap.addClass("wk-nb-action-menu-color-icon", color.className);
                iconWrap.setText(item.id.startsWith("text-") ? "A" : "");
            } else {
                setIcon(iconWrap, item.icon);
            }
            row.createSpan({ cls: "wk-nb-action-menu-label", text: item.label });
            row.addEventListener("click", () => {
                void this.activateItem(item);
            });
        });
    }

    private refreshActiveRows(): void {
        if (!this.listEl) return;
        const rows = Array.from(this.listEl.querySelectorAll(".wk-nb-action-menu-row"));
        rows.forEach((row, index) => {
            row.toggleClass("is-active", index === this.activeIndex);
        });
    }

    private async activateItem(item: ActionItem): Promise<void> {
        if (item.page) {
            this.renderFloatingSubmenu(item.page);
            return;
        }
        if (item.action) {
            await item.action();
            this.close();
        }
    }

    private onPointerDown(event: PointerEvent): void {
        if (this.rootEl?.contains(event.target as Node)) return;
        if (this.submenuEl?.contains(event.target as Node)) return;
        this.close();
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (!this.rootEl) return;
        if (event.key === "Escape") {
            event.preventDefault();
            this.close();
            return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const delta = event.key === "ArrowDown" ? 1 : -1;
            const length = Math.max(this.visibleItems.length, 1);
            this.activeIndex = (this.activeIndex + delta + length) % length;
            this.refreshActiveRows();
            this.syncFloatingSubmenuForItem(this.visibleItems[this.activeIndex]);
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault();
            const item = this.visibleItems[this.activeIndex];
            if (item) void this.activateItem(item);
        }
    }

    private runTransform(type: string): void {
        transformLine(this.view, this.lineNo, type);
    }

    private getCurrentCalloutIcon(): string {
        const line = this.view.state.doc.line(this.lineNo);
        const match = line.text.match(/^>\s*\[!([^\]\s|+-]+)/);
        return this.getCalloutIcon(match?.[1]);
    }

    private getCalloutIcon(type: string | undefined): string {
        if (!type) return CALLOUT_ICONS.note;
        return CALLOUT_ICONS[type.toLowerCase()] ?? CALLOUT_ICONS.note;
    }

    private deleteLine(): void {
        const line = this.view.state.doc.line(this.lineNo);
        const from = line.number === 1 ? line.from : line.from - 1;
        const to = line.number === 1 && this.view.state.doc.lines > 1 ? line.to + 1 : line.to;
        this.view.dispatch({
            changes: { from, to, insert: "" },
            scrollIntoView: true,
            userEvent: "delete.block"
        });
    }

    private async copyBlockLink(): Promise<void> {
        const file = this.plugin.app.workspace.getActiveFile();
        if (!file) {
            new Notice("没有活动笔记");
            return;
        }
        const line = this.view.state.doc.line(this.lineNo);
        const existingId = line.text.match(/\s\^([A-Za-z0-9-]+)$/)?.[1];
        const blockId = existingId ?? `nb-${Date.now().toString(36)}`;
        if (!existingId) {
            this.view.dispatch({
                changes: { from: line.to, insert: ` ^${blockId}` },
                userEvent: "input.block-id"
            });
        }
        const link = `[[${file.basename}#^${blockId}]]`;
        try {
            await this.ownerWindow.navigator.clipboard.writeText(link);
            new Notice("已复制区块链接");
        } catch {
            new Notice("复制区块链接失败");
        }
    }

    private applyTextColor(color: ColorOption): void {
        this.wrapLineContent(color.value ? "span" : "", color.value ? `color: ${color.value};` : "");
    }

    private applyBackgroundColor(color: ColorOption): void {
        this.wrapLineContent(color.value ? "mark" : "", color.value ? `background-color: ${color.value}; color: inherit;` : "");
    }

    private wrapLineContent(tagName: string, style: string): void {
        const line = this.view.state.doc.line(this.lineNo);
        const parts = this.splitMarkdownLine(line.text);
        const unwrapped = parts.content
            .replace(/^<span style="[^"]*">(.*)<\/span>$/u, "$1")
            .replace(/^<mark style="[^"]*">(.*)<\/mark>$/u, "$1");
        const nextContent = tagName ? `<${tagName} style="${style}">${unwrapped}</${tagName}>` : unwrapped;
        const nextText = `${parts.prefix}${nextContent}${parts.suffix}`;
        this.view.dispatch({
            changes: { from: line.from, to: line.to, insert: nextText },
            scrollIntoView: true,
            userEvent: "input.block-color"
        });
    }

    private splitMarkdownLine(text: string): { prefix: string; content: string; suffix: string } {
        const blockIdMatch = text.match(/(\s\^[A-Za-z0-9-]+)$/);
        const suffix = blockIdMatch?.[1] ?? "";
        const body = suffix ? text.slice(0, -suffix.length) : text;
        const prefixMatch = body.match(/^(#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+\.\s+|>\s+)/);
        const prefix = prefixMatch?.[1] ?? "";
        return {
            prefix,
            content: body.slice(prefix.length).trim(),
            suffix
        };
    }

    private reposition(): void {
        if (!this.rootEl) return;
        const rect = this.rootEl.getBoundingClientRect();
        const padding = 8;
        let left = this.pos.x;
        let top = this.pos.y;
        if (left + rect.width > this.ownerWindow.innerWidth - padding) {
            left = Math.max(padding, this.ownerWindow.innerWidth - rect.width - padding);
        }
        if (top + rect.height > this.ownerWindow.innerHeight - padding) {
            top = Math.max(padding, this.ownerWindow.innerHeight - rect.height - padding);
        }
        this.rootEl.style.left = `${left}px`;
        this.rootEl.style.top = `${top}px`;
        this.positionFloatingSubmenu();
    }

    private positionFloatingSubmenu(): void {
        if (!this.rootEl || !this.submenuEl) return;
        const rootRect = this.rootEl.getBoundingClientRect();
        const submenuRect = this.submenuEl.getBoundingClientRect();
        const padding = 8;
        let left = rootRect.right + 8;
        let top = rootRect.top;
        if (left + submenuRect.width > this.ownerWindow.innerWidth - padding) {
            left = Math.max(padding, rootRect.left - submenuRect.width - 8);
        }
        if (top + submenuRect.height > this.ownerWindow.innerHeight - padding) {
            top = Math.max(padding, this.ownerWindow.innerHeight - submenuRect.height - padding);
        }
        this.submenuEl.style.left = `${left}px`;
        this.submenuEl.style.top = `${top}px`;
    }
}
