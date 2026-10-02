import { Component, Notice, setIcon } from "obsidian";
import { EditorView } from "@codemirror/view";
import NotionBlock from "./main";
import { transformLine } from "./blockTransform";
import { t } from "./locale/helpers";
import { NotionBlockInsertActions } from "./notionInsertMenu";
import { MENU_COMMANDS, MenuGroup, reorderMenuCommands, setMenuGroupCollapsed } from "./menuLayout";
import { MenuOrderDrag } from "./menuOrder";

type MenuPage = "color" | "callout";
type MainMenuPage = "actions" | "insert" | "insert-more" | "transform-more";
type MenuAction = () => boolean | void | Promise<boolean | void>;

interface ActionItem {
    id: string;
    label: string;
    icon: string;
    shortcut?: string;
    page?: MenuPage;
    destination?: MainMenuPage;
    action?: MenuAction;
    group?: MenuGroup;
    toggleGroup?: MenuGroup;
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
    pos: MenuPosition,
    initialPage: MainMenuPage = "actions"
): void {
    closeNotionBlockActionMenus();
    const menu = new NotionBlockActionMenu(plugin, view, lineNo, pos, initialPage);
    OPEN_MENUS.add(menu);
    plugin.addChild(menu);
    menu.open();
}

export function closeNotionBlockActionMenus(): void {
    OPEN_MENUS.forEach((menu) => menu.close(false));
    OPEN_MENUS.clear();
}

class NotionBlockActionMenu extends Component {
    private readonly plugin: NotionBlock;
    private readonly view: EditorView;
    private readonly lineNo: number;
    private readonly pos: MenuPosition;
    private readonly ownerDocument: Document;
    private readonly ownerWindow: Window;
    private rootEl: HTMLElement | null = null;
    private submenuEl: HTMLElement | null = null;
    private listEl: HTMLElement | null = null;
    private footerEl: HTMLElement | null = null;
    private activeIndex = 0;
    private currentPage: MainMenuPage;
    private returnPage: "actions" | "insert" = "actions";
    private readonly insertActions: NotionBlockInsertActions;
    private listEvents: Component | null = null;
    private submenuEvents: Component | null = null;
    private visibleItems: ActionItem[] = [];
    private orderDrag: MenuOrderDrag | null = null;
    private layoutSaving = false;
    private readonly handlePointerDown = (event: PointerEvent): void => this.onPointerDown(event);
    private readonly handleKeyDown = (event: KeyboardEvent): void => this.onKeyDown(event);

    constructor(plugin: NotionBlock, view: EditorView, lineNo: number, pos: MenuPosition, initialPage: MainMenuPage) {
        super();
        this.plugin = plugin;
        this.view = view;
        this.lineNo = lineNo;
        this.pos = pos;
        this.ownerDocument = view.dom.ownerDocument;
        this.ownerWindow = this.ownerDocument.defaultView ?? activeWindow;
        this.currentPage = initialPage;
        this.insertActions = this.addChild(new NotionBlockInsertActions(plugin, view, lineNo, () => this.close()));
    }

    open(): void {
        this.rootEl = this.ownerDocument.body.createDiv({ cls: "wk-nb-action-menu" });
        this.rootEl.setAttribute("role", "menu");
        this.rootEl.tabIndex = -1;
        this.rootEl.setCssStyles({ left: `${this.pos.x}px`, top: `${this.pos.y}px` });

        this.listEl = this.rootEl.createDiv({ cls: "wk-nb-action-menu-list" });
        this.footerEl = this.rootEl.createDiv({ cls: "wk-nb-action-menu-footer" });
        this.renderList();
        this.reposition();

        this.rootEl.focus();
        this.registerDomEvent(this.ownerDocument, "pointerdown", this.handlePointerDown, true);
        this.registerDomEvent(this.ownerDocument, "keydown", this.handleKeyDown, true);
        this.registerDomEvent(this.ownerWindow, "resize", () => {
            this.reposition();
            this.positionFloatingSubmenu();
        });
    }

    close(restoreFocus = true): void {
        this.plugin.removeChild(this);
        if (restoreFocus && this.view.dom.isConnected) this.view.focus();
    }

    onunload(): void {
        this.closeFloatingSubmenu();
        this.rootEl?.remove();
        this.rootEl = null;
        OPEN_MENUS.delete(this);
    }

    private renderList(preserveScroll = false): void {
        if (!this.rootEl || !this.listEl || !this.footerEl) return;
        const scrollTop = preserveScroll ? this.listEl.scrollTop : 0;
        if (this.listEvents) this.removeChild(this.listEvents);
        this.listEl.empty();
        this.footerEl.empty();
        this.listEvents = this.addChild(new Component());
        this.orderDrag = this.listEvents.addChild(new MenuOrderDrag((group, ids, movedId) => {
            void this.saveMenuOrder(group, ids, movedId);
        }, () => this.closeFloatingSubmenu()));
        const main = this.currentPage === "actions";
        this.rootEl.toggleClass("is-main", main);
        this.rootEl.toggleClass("wk-nb-insert-menu", this.currentPage === "insert" || this.currentPage === "insert-more");
        this.rootEl.dataset.page = this.currentPage;
        this.listEl.toggleClass("wk-nb-menu-groups", main);
        this.visibleItems = [];

        if (main) {
            this.renderGroup(this.listEl.createDiv({ cls: "wk-nb-menu-group" }), "transform", true);
            this.renderGroup(this.listEl.createDiv({ cls: "wk-nb-menu-group" }), "insert", true);
            const colorItems = this.getColorEntryItems();
            const blockItems = this.getBlockActionItems();
            this.visibleItems.push(...colorItems, ...blockItems);
            this.renderSeparator(this.footerEl);
            this.renderSection(this.footerEl, "", colorItems);
            this.renderSeparator(this.footerEl);
            this.renderSection(this.footerEl, "", blockItems);
        } else {
            const backItem: ActionItem = {
                id: "back", label: t("menu.back"), icon: "arrow-left",
                destination: this.currentPage === "insert" ? "actions" : this.returnPage
            };
            this.visibleItems.push(backItem);
            this.renderSection(this.listEl, "", [backItem]);
            this.renderSeparator(this.listEl);
            this.renderGroup(this.listEl, this.currentPage === "transform-more" ? "transform" : "insert", this.currentPage === "insert");
        }
        this.activeIndex = Math.min(this.activeIndex, Math.max(0, this.visibleItems.length - 1));
        this.refreshActiveRows();
        this.listEl.scrollTop = scrollTop;
        if (this.layoutSaving) this.rootEl.setAttribute("aria-busy", "true");
        else this.rootEl.removeAttribute("aria-busy");
        this.reposition();
    }

    private renderGroup(container: HTMLElement, group: MenuGroup, expanded: boolean): void {
        const groupLabel = t(group === "insert" ? "menu.addInsert" : "menu.turnInto");
        container.setAttribute("role", "group");
        const layout = this.plugin.settings.menuLayout[group];
        const allItems = group === "insert"
            ? this.insertActions.getItems().map(item => ({ ...item, group }))
            : this.getTurnIntoItems();
        const items = layout.order
            .map(id => allItems.find(item => item.id === id))
            .filter((item): item is ActionItem => !!item && layout.expanded.includes(item.id) === expanded);
        if (this.currentPage === "actions") {
            const header: ActionItem = {
                id: `group-${group}`, label: groupLabel, toggleGroup: group,
                icon: layout.collapsed ? "chevron-right" : "chevron-down"
            };
            this.visibleItems.push(header);
            this.renderItem(container, header);
            if (layout.collapsed) return;
        } else {
            container.createDiv({ cls: "wk-nb-action-menu-section", text: groupLabel });
        }
        this.visibleItems.push(...items);
        const commands = container.createDiv({ cls: "wk-nb-menu-command-list" });
        items.forEach(item => this.renderItem(commands, item));
        if (expanded && layout.expanded.length < layout.order.length) {
            const more: ActionItem = {
                id: `more-${group}`,
                label: t(group === "insert" ? "menu.moreInsert" : "menu.moreTransform"),
                icon: "ellipsis", destination: group === "insert" ? "insert-more" : "transform-more"
            };
            this.visibleItems.push(more);
            this.renderItem(container, more);
        }
    }

    private getTurnIntoItems(): ActionItem[] {
        return MENU_COMMANDS.transform.map(command => ({
            id: command.id, label: t(command.labelKey), group: "transform",
            icon: command.id === "callout" ? this.getCurrentCalloutIcon() : command.icon,
            ...(command.id === "callout" ? { page: "callout" as const } : { action: () => this.runTransform(command.id) })
        }));
    }

    private getColorEntryItems(): ActionItem[] {
        return [
            { id: "color", label: t("menu.color"), icon: "paint-roller", page: "color" },
        ];
    }

    private getBlockActionItems(): ActionItem[] {
        return [
            { id: "copy-link", label: t("menu.copyLink"), icon: "link", shortcut: "⌘⌃L", action: () => this.copyBlockLink() },
            { id: "delete", label: t("menu.delete"), icon: "trash-2", shortcut: "Del", action: () => this.deleteLine() },
            {
                id: "toggle-drag-granularity",
                label: this.plugin.settings.dragGranularity === "line" ? t("handles.switchToParagraph") : t("handles.switchToLine"),
                icon: "layers",
                action: async () => {
                    this.plugin.settings.dragGranularity = this.plugin.settings.dragGranularity === "line" ? "paragraph" : "line";
                    await this.plugin.saveSettings();
                }
            },
        ];
    }

    private getTextColorItems(): ActionItem[] {
        return TEXT_COLORS.map((color): ActionItem => ({
            id: `text-${color.id}`,
            label: t(`color.text${color.id.charAt(0).toUpperCase() + color.id.slice(1)}`),
            icon: "letter-text",
            action: () => this.applyTextColor(color)
        }));
    }

    private getBackgroundColorItems(): ActionItem[] {
        return BACKGROUND_COLORS.map((color): ActionItem => ({
            id: `bg-${color.id}`,
            label: t(`color.bg${color.id.charAt(0).toUpperCase() + color.id.slice(1)}`),
            icon: "paint-bucket",
            action: () => this.applyBackgroundColor(color)
        }));
    }

    private getCalloutItems(): ActionItem[] {
        return CALLOUT_OPTIONS.map((option): ActionItem => ({
            id: `callout-${option.type}`,
            label: t(`callout.${option.type}`),
            icon: this.getCalloutIcon(option.type),
            action: () => this.runTransform(`callout-${option.type}`)
        }));
    }

    private renderSection(container: HTMLElement, title: string, items: ActionItem[]): void {
        if (items.length === 0) return;
        if (title) {
            container.createDiv({ cls: "wk-nb-action-menu-section", text: title });
        }
        items.forEach((item) => this.renderItem(container, item));
    }

    private renderSeparator(container: HTMLElement): void {
        container.createDiv({ cls: "wk-nb-action-menu-separator" });
    }

    private renderItem(container: HTMLElement, item: ActionItem): void {
        const index = this.visibleItems.indexOf(item);
        const row = container.createDiv({
            cls: `wk-nb-action-menu-row${index === this.activeIndex ? " is-active" : ""}`,
            attr: { role: "menuitem", "data-item-id": item.id }
        });

        const iconWrap = row.createSpan({ cls: "wk-nb-action-menu-icon" });
        setIcon(iconWrap, item.icon);
        row.createSpan({ cls: "wk-nb-action-menu-label", text: item.label });

        if (item.shortcut) {
            row.createSpan({ cls: "wk-nb-action-menu-shortcut", text: item.shortcut });
        }
        if (item.page || item.destination?.endsWith("-more")) {
            row.setAttribute("aria-haspopup", "menu");
            setIcon(row.createSpan({ cls: "wk-nb-action-menu-chevron" }), "chevron-right");
        }
        if (item.group) {
            this.orderDrag?.bindRow(row, item.group, item.id);
            const grip = row.querySelector<HTMLButtonElement>(".wk-nb-order-grip");
            if (grip) grip.disabled = this.layoutSaving;
        }
        if (item.toggleGroup) {
            row.addClass("wk-nb-menu-group-header");
            row.setAttribute("aria-expanded", String(!this.plugin.settings.menuLayout[item.toggleGroup].collapsed));
            row.setAttribute("aria-disabled", String(this.layoutSaving));
            row.tabIndex = 0;
            this.listEvents?.registerDomEvent(row, "focus", () => {
                this.activeIndex = index;
                this.refreshActiveRows();
            });
        }

        this.listEvents?.registerDomEvent(row, "mouseenter", () => {
            if (this.orderDrag?.hasPointer) return;
            this.activeIndex = Math.max(0, index);
            this.refreshActiveRows();
            this.syncFloatingSubmenuForItem(item);
        });
        this.listEvents?.registerDomEvent(row, "click", () => {
            if (this.orderDrag?.hasPointer) return;
            void this.activateItem(item);
        });
    }

    private renderFloatingSubmenu(page: MenuPage, group?: MenuGroup): void {
        if (!this.rootEl) return;
        this.closeFloatingSubmenu();
        this.submenuEl = this.ownerDocument.body.createDiv({ cls: `wk-nb-action-menu wk-nb-action-submenu is-${page}` });
        this.submenuEl.setAttribute("role", "menu");
        this.submenuEvents = this.addChild(new Component());

        if (page === "color") {
            this.renderFloatingSection(this.submenuEl, t("menu.textColor"), this.getTextColorItems(), TEXT_COLORS);
            this.submenuEl.createDiv({ cls: "wk-nb-action-menu-separator" });
            this.renderFloatingSection(this.submenuEl, t("menu.backgroundColor"), this.getBackgroundColorItems(), BACKGROUND_COLORS);
        } else {
            const items = group === "insert" ? this.insertActions.getCalloutItems() : this.getCalloutItems();
            this.renderFloatingSection(this.submenuEl, t("menu.callout"), items);
        }
        this.positionFloatingSubmenu();
    }

    private closeFloatingSubmenu(): void {
        this.submenuEl?.remove();
        this.submenuEl = null;
        if (this.submenuEvents) this.removeChild(this.submenuEvents);
        this.submenuEvents = null;
    }

    private syncFloatingSubmenuForItem(item: ActionItem | undefined): void {
        if (item?.page) {
            this.renderFloatingSubmenu(item.page, item.group);
            return;
        }
        this.closeFloatingSubmenu();
    }

    private renderFloatingSection(container: HTMLElement, title: string, items: ActionItem[], colors?: ColorOption[]): void {
        container.createDiv({ cls: "wk-nb-action-menu-section", text: title });
        items.forEach((item) => {
            const color = colors?.find((option) => item.id.endsWith(option.id));
            const row = container.createDiv({ cls: "wk-nb-action-menu-row", attr: { role: "menuitem", "data-item-id": item.id } });
            const iconWrap = row.createSpan({ cls: "wk-nb-action-menu-icon" });
            if (color) {
                iconWrap.addClass("wk-nb-action-menu-color-icon", color.className);
                iconWrap.setText(item.id.startsWith("text-") ? "A" : "");
            } else {
                setIcon(iconWrap, item.icon);
            }
            row.createSpan({ cls: "wk-nb-action-menu-label", text: item.label });
            this.submenuEvents?.registerDomEvent(row, "click", () => {
                void this.activateItem(item);
            });
        });
    }

    private refreshActiveRows(): void {
        if (!this.rootEl) return;
        const rows = Array.from(this.rootEl.querySelectorAll(".wk-nb-action-menu-row"));
        rows.forEach((row, index) => {
            row.toggleClass("is-active", index === this.activeIndex);
        });
    }

    private async activateItem(item: ActionItem): Promise<void> {
        if (item.toggleGroup) {
            await this.setGroupCollapsed(item.toggleGroup, !this.plugin.settings.menuLayout[item.toggleGroup].collapsed);
            return;
        }
        if (item.destination) {
            this.switchPage(item.destination);
            return;
        }
        if (item.page) {
            this.renderFloatingSubmenu(item.page, item.group);
            return;
        }
        if (item.action) {
            const keepOpen = await item.action();
            if (keepOpen !== true) this.close();
        }
    }

    private switchPage(page: MainMenuPage): void {
        this.closeFloatingSubmenu();
        if (page.endsWith("-more")) this.returnPage = this.currentPage === "insert" ? "insert" : "actions";
        this.currentPage = page;
        this.activeIndex = page === "insert" ? 1 : 0;
        this.renderList();
        this.rootEl?.focus();
    }

    private async saveMenuOrder(group: MenuGroup, ids: string[], movedId: string): Promise<void> {
        if (this.layoutSaving || !this.rootEl) return;
        this.layoutSaving = true;
        this.rootEl.setAttribute("aria-busy", "true");
        this.rootEl.querySelectorAll<HTMLButtonElement>(".wk-nb-order-grip").forEach(grip => { grip.disabled = true; });
        this.rootEl.querySelectorAll(".wk-nb-menu-group-header").forEach(header => header.setAttribute("aria-disabled", "true"));
        try {
            await this.plugin.saveMenuLayout(reorderMenuCommands(this.plugin.settings.menuLayout, group, ids));
        } catch {
            new Notice(t("notice.menuLayoutSaveFailed"));
        } finally {
            this.layoutSaving = false;
        }
        if (!this.rootEl) return;
        this.renderList(true);
        this.rootEl.removeAttribute("aria-busy");
        const index = this.visibleItems.findIndex(item => item.group === group && item.id === movedId);
        if (index >= 0) this.activeIndex = index;
        this.refreshActiveRows();
        this.rootEl.querySelector<HTMLButtonElement>(`[data-menu-group="${group}"][data-item-id="${movedId}"] .wk-nb-order-grip`)?.focus({ preventScroll: true });
    }

    private async setGroupCollapsed(group: MenuGroup, collapsed: boolean): Promise<void> {
        if (this.layoutSaving || !this.rootEl || this.plugin.settings.menuLayout[group].collapsed === collapsed) return;
        this.layoutSaving = true;
        this.closeFloatingSubmenu();
        const write = this.plugin.saveMenuLayout(setMenuGroupCollapsed(this.plugin.settings.menuLayout, group, collapsed));
        // 立即更新布局，保存失败再回滚到已落盘的状态。
        this.renderList(true);
        this.focusGroupHeader(group);
        try {
            await write;
        } catch {
            new Notice(t("notice.menuLayoutSaveFailed"));
        } finally {
            this.layoutSaving = false;
        }
        if (!this.rootEl) return;
        this.renderList(true);
        this.focusGroupHeader(group);
    }

    private focusGroupHeader(group: MenuGroup): void {
        this.activeIndex = Math.max(0, this.visibleItems.findIndex(item => item.toggleGroup === group));
        this.refreshActiveRows();
        this.rootEl?.querySelector<HTMLElement>(`[data-item-id="group-${group}"]`)?.scrollIntoView({ block: "nearest" });
        this.rootEl?.focus({ preventScroll: true });
    }

    private onPointerDown(event: PointerEvent): void {
        if (this.rootEl?.contains(event.target as Node)) return;
        if (this.submenuEl?.contains(event.target as Node)) return;
        this.close(false);
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (!this.rootEl) return;
        if (event.key === "Escape") {
            event.preventDefault();
            if (this.orderDrag?.hasPointer) {
                this.orderDrag.cancel();
                return;
            }
            this.close();
            return;
        }
        if (event.altKey) return;
        if (this.orderDrag?.hasPointer) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest?.(".wk-nb-order-grip") && (event.key === "Enter" || event.key === " ")) return;
        const activeItem = this.visibleItems[this.activeIndex];
        if (activeItem?.toggleGroup && (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === " ")) {
            event.preventDefault();
            const group = activeItem.toggleGroup;
            const collapsed = event.key === " " ? !this.plugin.settings.menuLayout[group].collapsed : event.key === "ArrowLeft";
            void this.setGroupCollapsed(group, collapsed);
            return;
        }
        if (event.key === "ArrowLeft" && this.currentPage !== "actions") {
            event.preventDefault();
            this.switchPage(this.currentPage === "insert" ? "actions" : this.returnPage);
            return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const delta = event.key === "ArrowDown" ? 1 : -1;
            const length = Math.max(this.visibleItems.length, 1);
            this.activeIndex = (this.activeIndex + delta + length) % length;
            this.refreshActiveRows();
            this.rootEl.focus({ preventScroll: true });
            this.rootEl.querySelector<HTMLElement>(".wk-nb-action-menu-row.is-active")?.scrollIntoView({ block: "nearest" });
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
            new Notice(t("notice.noActiveNote"));
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
            new Notice(t("notice.linkCopied"));
        } catch {
            new Notice(t("notice.linkCopyFailed"));
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
        this.rootEl.setCssStyles({ left: `${Math.max(padding, left)}px`, top: `${Math.max(padding, top)}px` });
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
        this.submenuEl.setCssStyles({ left: `${Math.max(padding, left)}px`, top: `${Math.max(padding, top)}px` });
    }
}
