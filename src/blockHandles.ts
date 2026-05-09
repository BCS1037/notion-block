import { 
    EditorView, 
    ViewPlugin, 
    ViewUpdate
} from "@codemirror/view";
import { setIcon, Menu } from "obsidian";
import NotionBlock from "./main";
import { showTransformMenu, showInsertMenu } from "./blockMenu";
import { DragManager } from "./dragDrop";

export const blockHandlesExtension = (plugin: NotionBlock) => ViewPlugin.fromClass(class {
    handleEl: HTMLElement | null = null;
    addButton: HTMLElement | null = null;
    dragButton: HTMLElement | null = null;
    
    hoveredLine: number | null = null;
    hideTimeout: ReturnType<typeof setTimeout> | null = null;
    dragManager: DragManager | null = null;

    constructor(view: EditorView) {
        this.createHandle(view);
    }

    createHandle(view: EditorView) {
        this.handleEl = document.createElement("div");
        this.handleEl.className = "block-handle-wrap is-hidden";
        
        this.addButton = this.handleEl.createEl("div", { 
            cls: "block-handle-button add-button", 
            attr: { "aria-label": "Add block below" } 
        });
        setIcon(this.addButton, "plus");
        
        this.dragButton = this.handleEl.createEl("div", { 
            cls: "block-handle-button drag-button", 
            attr: { "aria-label": "Drag to reorder" } 
        });
        setIcon(this.dragButton, "grip-vertical");

        // Drag & Menu Logic
        let dragTimeout: ReturnType<typeof setTimeout> | null = null;
        let isDragging = false;

        this.dragButton.onmousedown = (e) => {
            if (this.hoveredLine === null) return;
            if (this.hideTimeout) {
                clearTimeout(this.hideTimeout);
                this.hideTimeout = null;
            }
            e.preventDefault();
            e.stopPropagation();
            
            isDragging = false;
            dragTimeout = setTimeout(() => {
                isDragging = true;
                if (!this.dragManager) {
                    this.dragManager = new DragManager(plugin, view);
                }
                this.dragManager.startDrag(this.hoveredLine!, e);
            }, 150);
        };

        this.dragButton.onmouseup = (e) => {
            clearTimeout(dragTimeout!);
            if (!isDragging && this.hoveredLine !== null) {
                const rect = this.dragButton!.getBoundingClientRect();
                showTransformMenu(plugin, view, this.hoveredLine, {
                    x: rect.left,
                    y: rect.bottom
                });
            }
        };

        this.dragButton.onclick = (e) => e.stopPropagation();

        this.dragButton.oncontextmenu = (e) => {
            const menu = new Menu();
            menu.addItem(item => {
                item.setTitle(plugin.settings.dragGranularity === "line" ? "Switch to paragraph mode" : "Switch to line mode")
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
                clearTimeout(this.hideTimeout);
                this.hideTimeout = null;
            }
            e.stopPropagation();
            
            const rect = this.addButton!.getBoundingClientRect();
            const pos = { x: rect.left, y: rect.bottom };

            // Just show the menu for the current line. 
            // insertBlock will handle creating a new line if the current one isn't empty.
            showInsertMenu(plugin, view, this.hoveredLine, pos);
        };

        // Add to scrollDOM so it scrolls with the content
        view.scrollDOM.appendChild(this.handleEl);
    }

    update(update: ViewUpdate) {
        // Only update position on viewport changes or document changes if handle is visible
        if ((update.docChanged || update.viewportChanged) && this.hoveredLine !== null) {
            this.updatePosition(update.view);
        }
    }

    updatePosition(view: EditorView) {
        if (this.hoveredLine === null || !this.handleEl) return;

        try {
            const line = view.state.doc.line(this.hoveredLine);
            
            // Get accurate screen coordinates of the line
            const coords = view.coordsAtPos(line.from);
            if (!coords) return;
            
            const scrollerRect = view.scrollDOM.getBoundingClientRect();
            
            // Calculate top relative to scrollDOM
            // (coords.top - scrollerRect.top) is the viewport-relative offset
            // We add scrollDOM.scrollTop because handleEl is a child of scrollDOM
            let top = (coords.top - scrollerRect.top) + view.scrollDOM.scrollTop;
            
            // Centering logic:
            // Adjust to the vertical center of the first visual line
            const lineHeight = coords.bottom - coords.top;
            const handleHeight = this.handleEl.offsetHeight || 24;
            top += (lineHeight - handleHeight) / 2;
            
            // Calculate left position based on contentDOM offset
            const left = view.contentDOM.offsetLeft - 52; 
            
            this.handleEl.style.transform = `translate3d(${left}px, ${Math.round(top)}px, 0)`;
        } catch {
            this.hideHandle();
        }
    }

    handleMouseMove(view: EditorView, event: MouseEvent) {
        const rect = view.dom.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Detection range check - Expand left range to accommodate the handle
        if (x < -100 || x > rect.width + 100 || y < 0 || y > rect.height) {
            this.handleMouseLeave(view);
            return;
        }

        if ((event.target as HTMLElement).closest(".block-handle-wrap")) {
            if (this.hideTimeout) {
                clearTimeout(this.hideTimeout);
                this.hideTimeout = null;
            }
            if (this.handleEl?.classList.contains("is-hidden")) {
                this.handleEl.classList.remove("is-hidden");
                // If it was fully nullified, try to recover the line from current Y
                if (this.hoveredLine === null) {
                    const contentRect = view.contentDOM.getBoundingClientRect();
                    const targetX = contentRect.left + 5; 
                    const pos = view.posAtCoords({ x: targetX, y: event.clientY });
                    if (pos !== null) {
                        try {
                            this.hoveredLine = view.state.doc.lineAt(pos).number;
                        } catch {}
                    }
                }
                this.updatePosition(view);
            }
            return;
        }

        // Use a fixed X point inside content to find the line at current Y
        const contentRect = view.contentDOM.getBoundingClientRect();
        const targetX = contentRect.left + 5; 
        const pos = view.posAtCoords({ x: targetX, y: event.clientY });
        
        if (pos === null) return;

        try {
            const line = view.state.doc.lineAt(pos);
            // CRITICAL: Only update if the logical line has actually changed
            if (this.hoveredLine !== line.number) {
                this.hoveredLine = line.number;
                this.handleEl?.classList.remove("is-hidden");
                this.updatePosition(view);
            }

            if (this.hideTimeout) {
                clearTimeout(this.hideTimeout);
                this.hideTimeout = null;
            }
        } catch {
            // Document might be changing
        }
    }

    handleMouseLeave(view: EditorView) {
        if (this.hideTimeout) clearTimeout(this.hideTimeout);
        
        this.hideTimeout = setTimeout(() => {
            // Check if mouse is actually over the handle before hiding
            if (this.handleEl?.matches(":hover")) {
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
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
    }

    destroy() {
        if (this.handleEl) {
            this.handleEl.remove();
        }
    }
}, {
    eventHandlers: {
        mousemove(event, view) {
            this.handleMouseMove(view, event);
        },
        mouseleave(event, view) {
            this.handleMouseLeave(view);
        }
    }
});
