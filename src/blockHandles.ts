import { 
    EditorView, 
    ViewPlugin, 
    ViewUpdate, 
    Decoration, 
    DecorationSet, 
    WidgetType 
} from "@codemirror/view";
import { Range } from "@codemirror/state";
import { setIcon, Menu } from "obsidian";
import NotionBlock from "./main";
import { showTransformMenu, showInsertMenu } from "./blockMenu";
import { DragManager } from "./dragDrop";

class BlockHandleWidget extends WidgetType {
    private dragManager: DragManager;

    constructor(private plugin: NotionBlock, private lineNo: number) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {
        const wrap = document.createElement("div");
        wrap.className = "block-handle-wrap";
        
        const addButton = wrap.createEl("div", { cls: "block-handle-button add-button", attr: { "aria-label": "Add block below" } });
        setIcon(addButton, "plus");
        
        const dragButton = wrap.createEl("div", { cls: "block-handle-button drag-button", attr: { "aria-label": "Drag to reorder" } });
        setIcon(dragButton, "grip-vertical");

        let dragTimeout: ReturnType<typeof setTimeout> | null = null;
        let isDragging = false;

        dragButton.onmousedown = (e) => {
            // Prevent browser from starting text selection
            e.preventDefault();
            e.stopPropagation();
            
            isDragging = false;
            dragTimeout = setTimeout(() => {
                isDragging = true;
                if (!this.dragManager) {
                    this.dragManager = new DragManager(this.plugin, view);
                }
                this.dragManager.startDrag(this.lineNo, e);
            }, 150);
        };

        dragButton.onmouseup = (e) => {
            clearTimeout(dragTimeout);
            if (!isDragging) {
                showTransformMenu(this.plugin.app, view, this.lineNo, e);
            }
        };

        dragButton.onclick = (e) => {
            e.stopPropagation();
        };

        dragButton.oncontextmenu = (e) => {
            const menu = new Menu();
            menu.addItem(item => {
                item.setTitle(this.plugin.settings.dragGranularity === "line" ? "Switch to paragraph mode" : "Switch to line mode")
                    .setIcon("layers")
                    .onClick(async () => {
                        this.plugin.settings.dragGranularity = this.plugin.settings.dragGranularity === "line" ? "paragraph" : "line";
                        await this.plugin.saveSettings();
                    });
            });
            menu.showAtMouseEvent(e);
            e.preventDefault();
        };

        addButton.onclick = (e) => {
            showInsertMenu(this.plugin, view, this.lineNo);
        };
        
        return wrap;
    }

    ignoreEvent() { return false; }
}

export const blockHandlesExtension = (plugin: NotionBlock) => ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    hoveredLine: number | null = null;
    hideTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(view: EditorView) {
        this.decorations = Decoration.none;
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.updateDecorations(update.view);
        }
    }

    updateDecorations(view: EditorView) {
        if (this.hoveredLine === null) {
            this.decorations = Decoration.none;
            return;
        }

        const widgets: Range<Decoration>[] = [];
        try {
            const line = view.state.doc.line(this.hoveredLine);
            widgets.push(Decoration.widget({
                widget: new BlockHandleWidget(plugin, line.number),
                side: -1 // Place before the line
            }).range(line.from));
        } catch {
            // Line might not exist anymore
        }
        
        this.decorations = Decoration.set(widgets);
    }

    handleMouseMove(view: EditorView, event: MouseEvent) {
        // If we are hovering over the handle itself, don't change anything
        if ((event.target as HTMLElement).closest(".block-handle-wrap")) {
            if (this.hideTimeout) {
                clearTimeout(this.hideTimeout);
                this.hideTimeout = null;
            }
            return;
        }

        const rect = view.contentDOM.getBoundingClientRect();
        const x = event.clientX;
        const y = event.clientY;

        // If mouse is too far left or right of the editor content, ignore
        if (x < rect.left - 100 || x > rect.right + 100 || y < rect.top || y > rect.bottom) {
            this.handleMouseLeave(view);
            return;
        }

        // Use a small X-offset to ensure we get the line even if mouse is slightly to the left
        const targetX = Math.max(rect.left + 5, x);
        const pos = view.posAtCoords({ x: targetX, y: y });
        
        if (pos === null) return;

        try {
            const line = view.state.doc.lineAt(pos);
            if (this.hoveredLine !== line.number) {
                this.hoveredLine = line.number;
                this.updateDecorations(view);
                view.requestMeasure();
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
        this.hideTimeout = setTimeout(() => {
            this.hoveredLine = null;
            this.updateDecorations(view);
            view.requestMeasure();
        }, plugin.settings.hideDelay);
    }
}, {
    decorations: v => v.decorations,
    eventHandlers: {
        mousemove(event, view) {
            this.handleMouseMove(view, event);
        },
        mouseleave(event, view) {
            this.handleMouseLeave(view);
        }
    }
});
