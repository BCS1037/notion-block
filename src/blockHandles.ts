import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { Component, Menu, Platform, setIcon } from "obsidian";
import NotionBlock from "./main";
import { showNotionBlockActionMenu, closeNotionBlockActionMenus } from "./notionActionMenu";
import { DragManager } from "./dragDrop";
import { t } from "./locale/helpers";

const DESKTOP_DRAG_DELAY_MS = 150;
const MOBILE_DRAG_DELAY_MS = 300;

export const blockHandlesExtension = (plugin: NotionBlock) => ViewPlugin.fromClass(class extends Component {
    handleEl: HTMLElement | null = null;
    addButton: HTMLElement | null = null;
    dragButton: HTMLElement | null = null;
    hoveredLine: number | null = null;
    hideTimeout: number | null = null;
    dragTimeout: number | null = null;
    dragManager: DragManager | null = null;
    ownerWindow: Window;
    isMouseOverHandle = false;

    constructor(view: EditorView) {
        super();
        this.ownerWindow = view.dom.ownerDocument.defaultView ?? activeWindow;
        plugin.addChild(this);
        this.register(() => {
            this.clearDragTimeout();
            if (this.hideTimeout !== null) this.ownerWindow.clearTimeout(this.hideTimeout);
        });
        this.createHandle(view);
    }

    createHandle(view: EditorView): void {
        this.handleEl = view.scrollDOM.createDiv({ cls: "block-handle-wrap is-hidden" });
        this.handleEl.toggleClass("is-mobile", this.isMobileView());
        this.syncHandleLayout();
        this.registerDomEvent(view.dom, "pointerdown", (event) => this.handlePointerDown(view, event));

        this.addButton = this.handleEl.createDiv({
            cls: "block-handle-button add-button",
            attr: { role: "button", tabindex: "0" }
        });
        setIcon(this.addButton, "plus");
        this.addButton.createSpan({ cls: "wk-nb-sr-only", text: t("handles.addBlock") });
        this.dragButton = this.handleEl.createDiv({
            cls: "block-handle-button drag-button",
            attr: { role: "button", tabindex: "0" }
        });
        setIcon(this.dragButton, "grip-vertical");
        this.dragButton.createSpan({ cls: "wk-nb-sr-only", text: t("handles.blockActions") });

        this.registerDomEvent(this.handleEl, "mouseenter", () => {
            this.isMouseOverHandle = true;
            this.clearHideTimeout();
        });
        this.registerDomEvent(this.handleEl, "mouseleave", () => {
            this.isMouseOverHandle = false;
            this.handleMouseLeave();
        });

        let isDragging = false;
        let suppressClick = false;
        let pointerId: number | null = null;
        const openMenu = (page: "actions" | "insert" = "actions"): void => {
            const button = page === "insert" ? this.addButton : this.dragButton;
            if (this.hoveredLine === null || !button) return;
            this.clearHideTimeout();
            const rect = button.getBoundingClientRect();
            showNotionBlockActionMenu(plugin, view, this.hoveredLine, { x: rect.left, y: rect.bottom }, page);
        };

        this.registerDomEvent(this.dragButton, "pointerdown", (event) => {
            if (this.hoveredLine === null || pointerId !== null) return;
            if (event.pointerType === "mouse" && event.button !== 0) return;
            this.clearHideTimeout();
            event.preventDefault();
            event.stopPropagation();
            isDragging = false;
            suppressClick = false;
            pointerId = event.pointerId;
            const lineNo = this.hoveredLine;
            const delay = this.isMobilePointer(event) ? MOBILE_DRAG_DELAY_MS : DESKTOP_DRAG_DELAY_MS;
            this.dragTimeout = this.ownerWindow.setTimeout(() => {
                this.dragTimeout = null;
                isDragging = true;
                suppressClick = true;
                if (!this.dragManager) this.dragManager = this.addChild(new DragManager(plugin, view));
                this.dragManager.startDrag(lineNo, event, this.dragButton ?? undefined);
            }, delay);
        });
        this.registerDomEvent(this.dragButton, "pointerup", (event) => {
            if (event.pointerId !== pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            pointerId = null;
            this.clearDragTimeout();
            if (!isDragging) openMenu();
        });
        this.registerDomEvent(this.dragButton, "pointercancel", (event) => {
            if (event.pointerId !== pointerId) return;
            event.stopPropagation();
            pointerId = null;
            this.clearDragTimeout();
        });
        this.registerDomEvent(this.dragButton, "click", (event) => {
            if (suppressClick) event.preventDefault();
            event.stopPropagation();
            suppressClick = false;
        });
        this.registerDomEvent(this.dragButton, "keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            openMenu();
        });
        this.registerDomEvent(this.dragButton, "contextmenu", (event) => {
            const menu = new Menu();
            menu.addItem((item) => {
                item.setTitle(plugin.settings.dragGranularity === "line" ? t("handles.switchToParagraph") : t("handles.switchToLine"))
                    .setIcon("layers")
                    .onClick(async () => {
                        plugin.settings.dragGranularity = plugin.settings.dragGranularity === "line" ? "paragraph" : "line";
                        await plugin.saveSettings();
                    });
            });
            menu.showAtMouseEvent(event);
            event.preventDefault();
        });
        this.registerDomEvent(this.addButton, "click", (event) => {
            event.stopPropagation();
            openMenu("insert");
        });
        this.registerDomEvent(this.addButton, "keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            openMenu("insert");
        });
    }

    update(update: ViewUpdate): void {
        const layoutChanged = this.syncHandleLayout();
        if (update.selectionSet && this.isMobileView() && this.hoveredLine !== null) {
            this.revealHandleAtSelection(update.view);
            return;
        }
        if ((layoutChanged || update.docChanged || update.viewportChanged) && this.hoveredLine !== null) {
            this.updatePosition(update.view);
        }
    }

    syncHandleLayout(): boolean {
        if (!this.handleEl) return false;
        const changed = this.handleEl.hasClass("has-add-button") !== plugin.settings.showAddButton;
        this.handleEl.toggleClass("has-add-button", plugin.settings.showAddButton);
        return changed;
    }

    updatePosition(view: EditorView): void {
        if (this.hoveredLine === null || !this.handleEl) return;
        this.syncHandleLayout();
        try {
            const line = view.state.doc.line(this.hoveredLine);
            const coords = view.coordsAtPos(line.from);
            if (!coords) return;
            const scrollerRect = view.scrollDOM.getBoundingClientRect();
            let top = coords.top - scrollerRect.top + view.scrollDOM.scrollTop;
            const lineHeight = coords.bottom - coords.top;
            const handleHeight = this.handleEl.offsetHeight || 24;
            top += (lineHeight - handleHeight) / 2;
            const left = this.getHandleLeft(view);
            this.handleEl.setCssStyles({ transform: `translate3d(${left}px, ${Math.round(top)}px, 0)` });
        } catch {
            this.hideHandle();
        }
    }

    handleMouseMove(view: EditorView, event: MouseEvent): void {
        const rect = view.dom.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        if (x < -100 || x > rect.width + 100 || y < 0 || y > rect.height) {
            this.handleMouseLeave();
            return;
        }
        const target = event.target;
        const ownerHTMLElement = view.dom.ownerDocument.defaultView?.HTMLElement;
        if (ownerHTMLElement && target instanceof ownerHTMLElement && target.closest(".block-handle-wrap")) {
            this.clearHideTimeout();
            if (this.handleEl?.hasClass("is-hidden")) {
                this.handleEl.removeClass("is-hidden");
                if (this.hoveredLine === null) this.hoveredLine = this.getLineAtClientY(view, event.clientY);
                this.updatePosition(view);
            }
            return;
        }
        const lineNo = this.getLineAtClientY(view, event.clientY);
        if (lineNo !== null && this.hoveredLine !== lineNo) this.revealHandleAtLine(view, lineNo);
        this.clearHideTimeout();
    }

    handlePointerDown(view: EditorView, event: PointerEvent): void {
        if (event.pointerType === "mouse" || !this.isMobilePointer(event)) return;
        const target = event.target;
        const ownerHTMLElement = view.dom.ownerDocument.defaultView?.HTMLElement;
        if (!ownerHTMLElement || !(target instanceof ownerHTMLElement)) return;
        if (target.closest(".block-handle-wrap") || target.closest(".wk-nb-action-menu")) return;
        const rect = view.dom.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
        const lineNo = this.getLineAtClientPoint(view, event.clientX, event.clientY);
        if (lineNo !== null) this.revealHandleAtLine(view, lineNo, true);
    }

    handleMouseLeave(): void {
        this.clearHideTimeout();
        this.hideTimeout = this.ownerWindow.setTimeout(() => {
            this.hideTimeout = null;
            if (this.isMouseOverHandle) return;
            this.hoveredLine = null;
            this.handleEl?.addClass("is-hidden");
        }, plugin.settings.hideDelay);
    }

    clearHideTimeout(): void {
        if (this.hideTimeout !== null) this.ownerWindow.clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
    }

    clearDragTimeout(): void {
        if (this.dragTimeout !== null) this.ownerWindow.clearTimeout(this.dragTimeout);
        this.dragTimeout = null;
    }

    hideHandle(): void {
        this.hoveredLine = null;
        this.handleEl?.addClass("is-hidden");
        this.clearHideTimeout();
    }

    destroy(): void {
        plugin.removeChild(this);
    }

    onunload(): void {
        closeNotionBlockActionMenus();
        this.handleEl?.remove();
        this.handleEl = null;
    }

    getHandleLeft(view: EditorView): number {
        const mobile = this.handleEl?.hasClass("is-mobile") || this.isMobileView();
        const fallbackWidth = plugin.settings.showAddButton ? (mobile ? 74 : 44) : (mobile ? 34 : 20);
        const width = this.handleEl?.offsetWidth || fallbackWidth;
        const left = view.contentDOM.offsetLeft - width - (mobile ? 6 : 8);
        return mobile ? Math.max(4, left) : left;
    }

    getLineAtClientY(view: EditorView, clientY: number): number | null {
        const contentRect = view.contentDOM.getBoundingClientRect();
        return this.getLineAtClientPoint(view, contentRect.left + 5, clientY);
    }

    getLineAtClientPoint(view: EditorView, clientX: number, clientY: number): number | null {
        const rect = view.contentDOM.getBoundingClientRect();
        const clampedX = Math.min(Math.max(clientX, rect.left + 1), rect.right - 1);
        for (const x of [clampedX, rect.left + 5, rect.left + rect.width / 2]) {
            const pos = view.posAtCoords({ x, y: clientY });
            if (pos === null) continue;
            try {
                return view.state.doc.lineAt(pos).number;
            } catch {
                // 文档变化时尝试下一个坐标。
            }
        }
        return null;
    }

    revealHandleAtSelection(view: EditorView): void {
        try {
            this.revealHandleAtLine(view, view.state.doc.lineAt(view.state.selection.main.head).number);
        } catch {
            // 选择位置可能正在随文档更新。
        }
    }

    revealHandleAtLine(view: EditorView, lineNo: number, forceMobile = false): void {
        this.hoveredLine = lineNo;
        this.handleEl?.removeClass("is-hidden");
        this.handleEl?.toggleClass("is-mobile", forceMobile || this.isMobileView());
        this.updatePosition(view);
        this.clearHideTimeout();
    }

    isMobileView(): boolean {
        return Platform.isMobile || this.ownerWindow.matchMedia("(pointer: coarse)").matches;
    }

    isMobilePointer(event: PointerEvent): boolean {
        return this.isMobileView() || event.pointerType === "touch" || event.pointerType === "pen";
    }
}, {
    eventHandlers: {
        mousemove(event, view) {
            this.handleMouseMove(view, event);
        },
        mouseleave() {
            this.handleMouseLeave();
        }
    }
});
