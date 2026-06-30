import { 
    EditorView, 
    ViewPlugin, 
    ViewUpdate
} from "@codemirror/view";
import { setIcon, Menu, Platform } from "obsidian";
import NotionBlock from "./main";
import { closeNotionBlockActionMenus, showNotionBlockActionMenu } from "./notionActionMenu";
import { closeNotionBlockInsertMenus, showNotionBlockInsertMenu } from "./notionInsertMenu";
import { DragManager } from "./dragDrop";
import { t } from "./locale/helpers";

const DESKTOP_DRAG_DELAY_MS = 150;
const MOBILE_DRAG_DELAY_MS = 300;

export const blockHandlesExtension = (plugin: NotionBlock) => ViewPlugin.fromClass(class {
    handleEl: HTMLElement | null = null;
    addButton: HTMLElement | null = null;
    dragButton: HTMLElement | null = null;
    
    hoveredLine: number | null = null;
    hideTimeout: number | null = null;
    dragManager: DragManager | null = null;
    ownerWindow: Window;
    isMouseOverHandle = false;
    editorDom: HTMLElement | null = null;
    editorPointerDown: ((event: PointerEvent) => void) | null = null;

    constructor(view: EditorView) {
        this.ownerWindow = view.dom.ownerDocument.defaultView ?? activeWindow;
        this.createHandle(view);
    }

    createHandle(view: EditorView) {
        // 直接挂到 scrollDOM，避免跨窗口 Document 根节点追加导致 HierarchyRequestError。
        this.handleEl = view.scrollDOM.createDiv();
        this.handleEl.className = "block-handle-wrap is-hidden";
        this.handleEl.classList.toggle("is-mobile", this.isMobileView());
        this.editorDom = view.dom;
        this.editorPointerDown = (event: PointerEvent) => this.handlePointerDown(view, event);
        this.editorDom.addEventListener("pointerdown", this.editorPointerDown);
        
        this.addButton = this.handleEl.createDiv({ 
            cls: "block-handle-button add-button", 
            attr: { "aria-label": t("handles.addBlock") } 
        });
        setIcon(this.addButton, "plus");
        
        this.dragButton = this.handleEl.createDiv({ 
            cls: "block-handle-button drag-button", 
            attr: { "aria-label": t("handles.dragReorder") } 
        });
        setIcon(this.dragButton, "grip-vertical");
        
        // 显式记录悬停状态，避开弹出窗口中 :hover 判断不稳定的问题。
        this.handleEl.addEventListener("mouseenter", () => {
            this.isMouseOverHandle = true;
            if (this.hideTimeout) {
                this.ownerWindow.clearTimeout(this.hideTimeout);
                this.hideTimeout = null;
            }
        });
        this.handleEl.addEventListener("mouseleave", () => {
            this.isMouseOverHandle = false;
            this.handleMouseLeave();
        });

        // ⠿ 短按打开菜单，长按进入拖拽。
        let dragTimeout: number | null = null;
        let isDragging = false;
        let suppressClick = false;

        const clearDragTimeout = () => {
            if (dragTimeout !== null) {
                this.ownerWindow.clearTimeout(dragTimeout);
                dragTimeout = null;
            }
        };

        const openActionMenu = () => {
            if (this.hoveredLine === null || !this.dragButton) return;
            const rect = this.dragButton.getBoundingClientRect();
            closeNotionBlockInsertMenus();
            showNotionBlockActionMenu(plugin, view, this.hoveredLine, {
                x: rect.left,
                y: rect.bottom
            });
        };

        this.dragButton.onpointerdown = (e) => {
            if (this.hoveredLine === null) return;
            if (e.pointerType === "mouse" && e.button !== 0) return;
            if (this.hideTimeout) {
                this.ownerWindow.clearTimeout(this.hideTimeout);
                this.hideTimeout = null;
            }
            e.preventDefault();
            e.stopPropagation();
            
            isDragging = false;
            suppressClick = false;
            const dragDelay = this.isMobilePointer(e) ? MOBILE_DRAG_DELAY_MS : DESKTOP_DRAG_DELAY_MS;
            dragTimeout = this.ownerWindow.setTimeout(() => {
                isDragging = true;
                suppressClick = true;
                if (!this.dragManager) {
                    this.dragManager = new DragManager(plugin, view);
                }
                this.dragManager.startDrag(this.hoveredLine!, e, this.dragButton);
            }, dragDelay);
        };

        this.dragButton.onpointerup = (e) => {
            e.preventDefault();
            e.stopPropagation();
            clearDragTimeout();
            if (!isDragging) {
                openActionMenu();
            }
        };

        this.dragButton.onpointercancel = (e) => {
            e.stopPropagation();
            clearDragTimeout();
        };

        this.dragButton.onclick = (e) => {
            if (suppressClick) {
                e.preventDefault();
            }
            e.stopPropagation();
            suppressClick = false;
        };

        this.dragButton.oncontextmenu = (e) => {
            const menu = new Menu();
            menu.addItem(item => {
                item.setTitle(plugin.settings.dragGranularity === "line" ? t("handles.switchToParagraph") : t("handles.switchToLine"))
                    .setIcon("layers")
                    .onClick(async () => {
                        plugin.settings.dragGranularity = plugin.settings.dragGranularity === "line" ? "paragraph" : "line";
                        await plugin.saveSettings();
                    });
            });
            menu.showAtMouseEvent(e);
            e.preventDefault();
        };

        this.addButton.onclick = (e) => {
            if (this.hoveredLine === null) return;
            if (this.hideTimeout) {
                this.ownerWindow.clearTimeout(this.hideTimeout);
                this.hideTimeout = null;
            }
            e.stopPropagation();
            
            const rect = this.addButton!.getBoundingClientRect();
            const pos = { x: rect.left, y: rect.bottom };

            closeNotionBlockActionMenus();
            showNotionBlockInsertMenu(plugin, view, this.hoveredLine, pos);
        };

    }

    update(update: ViewUpdate) {
        if (update.selectionSet && this.isMobileView() && this.hoveredLine !== null) {
            this.revealHandleAtSelection(update.view);
            return;
        }

        if ((update.docChanged || update.viewportChanged) && this.hoveredLine !== null) {
            this.updatePosition(update.view);
        }
    }

    updatePosition(view: EditorView) {
        if (this.hoveredLine === null || !this.handleEl) return;

        try {
            const line = view.state.doc.line(this.hoveredLine);
            
            // 获取当前行的屏幕坐标。
            const coords = view.coordsAtPos(line.from);
            if (!coords) return;
            
            const scrollerRect = view.scrollDOM.getBoundingClientRect();
            
            let top = (coords.top - scrollerRect.top) + view.scrollDOM.scrollTop;
            
            const lineHeight = coords.bottom - coords.top;
            const handleHeight = this.handleEl.offsetHeight || 24;
            top += (lineHeight - handleHeight) / 2;
            
            const left = this.getHandleLeft(view);
            
            this.handleEl.style.transform = `translate3d(${left}px, ${Math.round(top)}px, 0)`;
        } catch {
            this.hideHandle();
        }
    }

    handleMouseMove(view: EditorView, event: MouseEvent) {
        const rect = view.dom.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // 扩大左侧检测范围，覆盖句柄所在区域。
        if (x < -100 || x > rect.width + 100 || y < 0 || y > rect.height) {
            this.handleMouseLeave();
            return;
        }

        if ((event.target as HTMLElement).closest(".block-handle-wrap")) {
            if (this.hideTimeout) {
                this.ownerWindow.clearTimeout(this.hideTimeout);
                this.hideTimeout = null;
            }
            if (this.handleEl?.classList.contains("is-hidden")) {
                this.handleEl.classList.remove("is-hidden");
                if (this.hoveredLine === null) {
                    this.hoveredLine = this.getLineAtClientY(view, event.clientY);
                }
                this.updatePosition(view);
            }
            return;
        }

        const lineNo = this.getLineAtClientY(view, event.clientY);
        if (lineNo !== null && this.hoveredLine !== lineNo) {
            this.revealHandleAtLine(view, lineNo);
        }
    }

    handlePointerDown(view: EditorView, event: PointerEvent) {
        if (!this.shouldActivateFromPointer(event)) return;
        const target = event.target;
        if (!(target instanceof this.ownerWindow.HTMLElement)) return;
        if (target.closest(".block-handle-wrap") || target.closest(".wk-nb-action-menu")) return;
        const rect = view.dom.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
            return;
        }
        const lineNo = this.getLineAtClientPoint(view, event.clientX, event.clientY);
        if (lineNo !== null) {
            this.revealHandleAtLine(view, lineNo, true);
        }
    }

    handleMouseLeave() {
        if (this.hideTimeout) this.ownerWindow.clearTimeout(this.hideTimeout);
        
        this.hideTimeout = this.ownerWindow.setTimeout(() => {
            if (this.isMouseOverHandle) {
                return;
            }
            this.hoveredLine = null;
            this.handleEl?.classList.add("is-hidden");
        }, plugin.settings.hideDelay);
    }

    hideHandle() {
        this.hoveredLine = null;
        if (this.handleEl) {
            this.handleEl.classList.add("is-hidden");
        }
        if (this.hideTimeout) {
            this.ownerWindow.clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
    }

    destroy() {
        closeNotionBlockActionMenus();
        closeNotionBlockInsertMenus();
        if (this.editorDom && this.editorPointerDown) {
            this.editorDom.removeEventListener("pointerdown", this.editorPointerDown);
        }
        if (this.handleEl) {
            this.handleEl.remove();
        }
    }

    getHandleLeft(view: EditorView): number {
        if (!this.isMobileView()) {
            return view.contentDOM.offsetLeft - 52;
        }
        const handleWidth = this.handleEl?.offsetWidth || 52;
        const preferredLeft = view.contentDOM.offsetLeft - handleWidth - 6;
        return Math.max(4, preferredLeft);
    }

    getLineAtClientY(view: EditorView, clientY: number): number | null {
        const contentRect = view.contentDOM.getBoundingClientRect();
        return this.getLineAtClientPoint(view, contentRect.left + 5, clientY);
    }

    getLineAtClientPoint(view: EditorView, clientX: number, clientY: number): number | null {
        const contentRect = view.contentDOM.getBoundingClientRect();
        const clampedX = Math.min(Math.max(clientX, contentRect.left + 1), contentRect.right - 1);
        const candidateXs = [clampedX, contentRect.left + 5, contentRect.left + contentRect.width / 2];
        for (const targetX of candidateXs) {
            const pos = view.posAtCoords({ x: targetX, y: clientY });
            if (pos === null) continue;
            try {
                return view.state.doc.lineAt(pos).number;
            } catch {
                /* 文档更新时坐标可能暂时失效。 */
            }
        }
        return null;
    }

    revealHandleAtSelection(view: EditorView): void {
        try {
            const lineNo = view.state.doc.lineAt(view.state.selection.main.head).number;
            this.revealHandleAtLine(view, lineNo);
        } catch {
            /* 选区更新期间行号可能暂时不可用。 */
        }
    }

    revealHandleAtLine(view: EditorView, lineNo: number, forceMobile = false): void {
        this.hoveredLine = lineNo;
        this.handleEl?.classList.remove("is-hidden");
        this.handleEl?.classList.toggle("is-mobile", forceMobile || this.isMobileView());
        this.updatePosition(view);
        if (this.hideTimeout) {
            this.ownerWindow.clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
    }

    isMobileView(): boolean {
        return Platform.isMobile || this.ownerWindow.matchMedia("(pointer: coarse)").matches;
    }

    isMobilePointer(event: PointerEvent): boolean {
        return this.isMobileView() || event.pointerType === "touch" || event.pointerType === "pen";
    }

    shouldActivateFromPointer(event: PointerEvent): boolean {
        if (event.pointerType === "mouse") return false;
        return this.isMobilePointer(event);
    }
}, {
    eventHandlers: {
        mousemove(event, _view) {
            this.handleMouseMove(_view, event);
        },
        mouseleave(_event, _view) {
            this.handleMouseLeave();
        }
    }
});
