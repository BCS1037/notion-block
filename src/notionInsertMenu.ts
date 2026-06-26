import { setIcon } from "obsidian";
import { EditorView } from "@codemirror/view";
import NotionBlock from "./main";
import { insertBlock, insertImageFiles } from "./blockTransform";
import { t } from "./locale/helpers";

type InsertPage = "callout";
type InsertAction = () => boolean | void;

interface InsertItem {
    id: string;
    label: string;
    icon: string;
    page?: InsertPage;
    action?: InsertAction;
}

interface CalloutOption {
    type: string;
    label: string;
}

interface MenuPosition {
    x: number;
    y: number;
}

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

const OPEN_INSERT_MENUS = new Set<NotionBlockInsertMenu>();

export function showNotionBlockInsertMenu(
    plugin: NotionBlock,
    view: EditorView,
    lineNo: number,
    pos: MenuPosition
): void {
    closeNotionBlockInsertMenus();
    const menu = new NotionBlockInsertMenu(plugin, view, lineNo, pos);
    OPEN_INSERT_MENUS.add(menu);
    menu.open();
}

export function closeNotionBlockInsertMenus(): void {
    OPEN_INSERT_MENUS.forEach((menu) => menu.close());
    OPEN_INSERT_MENUS.clear();
}

class NotionBlockInsertMenu {
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
    private visibleItems: InsertItem[] = [];
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
        this.rootEl = this.ownerDocument.body.createDiv({ cls: "wk-nb-action-menu wk-nb-insert-menu" });
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
        OPEN_INSERT_MENUS.delete(this);
    }

    private renderList(): void {
        if (!this.listEl) return;
        this.listEl.empty();

        const textItems = this.getTextItems();
        const insertItems = this.getInlineItems();
        const metaItems = this.getMetaItems();
        this.visibleItems = [...textItems, ...insertItems, ...metaItems];

        this.renderSection(t("menu.insert"), textItems);
        this.renderSeparator();
        this.renderSection("", insertItems);
        this.renderSeparator();
        this.renderSection("", metaItems);
        this.reposition();
    }

    private getTextItems(): InsertItem[] {
        return [
            { id: "code", label: t("menu.code"), icon: "code", action: () => this.insert("code") },
            { id: "math", label: t("menu.math"), icon: "sigma", action: () => this.insert("math") },
            { id: "callout", label: t("menu.callout"), icon: this.getCalloutIcon("note"), page: "callout" },
        ];
    }

    private getInlineItems(): InsertItem[] {
        return [
            { id: "link", label: t("menu.link"), icon: "link", action: () => this.insert("link") },
            { id: "ext-link", label: t("menu.extLink"), icon: "link-2", action: () => this.insert("ext-link") },
            { id: "image", label: t("menu.image"), icon: "image", action: () => this.openImagePicker() },
            { id: "table", label: t("menu.table"), icon: "table", action: () => this.insert("table") },
        ];
    }

    private getMetaItems(): InsertItem[] {
        return [
            { id: "today", label: t("menu.today"), icon: "calendar", action: () => this.insert("today") },
            { id: "time", label: t("menu.time"), icon: "clock", action: () => this.insert("time") },
            { id: "footnote", label: t("menu.footnote"), icon: "hash", action: () => this.insert("footnote") },
            { id: "comment", label: t("menu.comment"), icon: "message-square", action: () => this.insert("comment") },
        ];
    }

    private renderSection(title: string, items: InsertItem[]): void {
        if (!this.listEl || items.length === 0) return;
        if (title) {
            this.listEl.createDiv({ cls: "wk-nb-action-menu-section", text: title });
        }
        items.forEach((item) => this.renderItem(item));
    }

    private renderSeparator(): void {
        this.listEl?.createDiv({ cls: "wk-nb-action-menu-separator" });
    }

    private renderItem(item: InsertItem): void {
        if (!this.listEl) return;
        const index = this.visibleItems.indexOf(item);
        const row = this.listEl.createDiv({
            cls: `wk-nb-action-menu-row${index === this.activeIndex ? " is-active" : ""}`,
            attr: { role: "menuitem" }
        });
        setIcon(row.createSpan({ cls: "wk-nb-action-menu-icon" }), item.icon);
        row.createSpan({ cls: "wk-nb-action-menu-label", text: item.label });
        if (item.page) {
            setIcon(row.createSpan({ cls: "wk-nb-action-menu-chevron" }), "chevron-right");
        }

        row.addEventListener("mouseenter", () => {
            this.activeIndex = Math.max(0, index);
            this.refreshActiveRows();
            this.syncFloatingSubmenuForItem(item);
        });
        row.addEventListener("click", () => {
            this.activateItem(item);
        });
    }

    private renderFloatingSubmenu(page: InsertPage): void {
        if (!this.rootEl) return;
        this.submenuEl?.remove();
        this.submenuEl = this.ownerDocument.body.createDiv({ cls: `wk-nb-action-menu wk-nb-action-submenu is-${page}` });
        this.submenuEl.setAttribute("role", "menu");
        this.renderFloatingSection(this.submenuEl, t("menu.callout"), this.getCalloutItems());
        this.positionFloatingSubmenu();
    }

    private getCalloutItems(): InsertItem[] {
        return CALLOUT_OPTIONS.map((option): InsertItem => ({
            id: `callout-${option.type}`,
            label: t(`callout.${option.type}`),
            icon: this.getCalloutIcon(option.type),
            action: () => this.insert(`callout-${option.type}`)
        }));
    }


    private renderFloatingSection(container: HTMLElement, title: string, items: InsertItem[]): void {
        container.createDiv({ cls: "wk-nb-action-menu-section", text: title });
        items.forEach((item) => {
            const row = container.createDiv({ cls: "wk-nb-action-menu-row", attr: { role: "menuitem" } });
            setIcon(row.createSpan({ cls: "wk-nb-action-menu-icon" }), item.icon);
            row.createSpan({ cls: "wk-nb-action-menu-label", text: item.label });
            row.addEventListener("click", () => {
                this.activateItem(item);
            });
        });
    }

    private closeFloatingSubmenu(): void {
        this.submenuEl?.remove();
        this.submenuEl = null;
    }

    private syncFloatingSubmenuForItem(item: InsertItem | undefined): void {
        if (item?.page) {
            this.renderFloatingSubmenu(item.page);
            return;
        }
        this.closeFloatingSubmenu();
    }

    private refreshActiveRows(): void {
        if (!this.listEl) return;
        const rows = Array.from(this.listEl.querySelectorAll(".wk-nb-action-menu-row"));
        rows.forEach((row, index) => {
            row.toggleClass("is-active", index === this.activeIndex);
        });
    }

    private activateItem(item: InsertItem): void {
        if (item.page) {
            this.renderFloatingSubmenu(item.page);
            return;
        }
        const keepOpen = item.action?.();
        if (keepOpen !== true) this.close();
    }

    private insert(type: string): void {
        insertBlock(this.plugin, this.view, this.lineNo, type);
    }

    private openImagePicker(): boolean {
        const input = this.ownerDocument.body.createEl("input", {
            attr: {
                type: "file",
                accept: ".avif,.bmp,.gif,.jpeg,.jpg,.png,.svg,.webp,image/avif,image/bmp,image/gif,image/jpeg,image/png,image/svg+xml,image/webp",
                multiple: "true",
            }
        });
        input.addClass("wk-nb-hidden-file-input");

        const cleanup = (): void => {
            input.remove();
            this.close();
        };

        input.addEventListener("change", () => {
            const files = Array.from(input.files ?? []);
            void insertImageFiles(this.plugin, this.view, this.lineNo, files).finally(cleanup);
        }, { once: true });
        input.addEventListener("cancel", cleanup, { once: true });
        input.click();
        return true;
    }

    private getCalloutIcon(type: string | undefined): string {
        if (!type) return CALLOUT_ICONS.note;
        return CALLOUT_ICONS[type.toLowerCase()] ?? CALLOUT_ICONS.note;
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
            if (item) this.activateItem(item);
        }
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
