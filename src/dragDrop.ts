import { EditorView } from "@codemirror/view";
import { Component } from "obsidian";
import { canDrop, getDragPath, getBlockSource, getDropEdit, getDropTarget, isDragList, isDragQuote } from "./blockDrag";
import type { DragSource, DropTarget } from "./blockDrag";
import { t } from "./locale/helpers";
import { measureBlockLayout } from "./blockGeometry";
import type { CrossDocumentDrag } from "./crossDocument";
import type { Text } from "@codemirror/state";

export class DragManager extends Component {
    private ghostEl: HTMLElement | null = null;
    private indicatorEl: HTMLElement | null = null;
    private containerEl: HTMLElement | null = null;
    private labelEl: HTMLElement | null = null;
    private isDragging = false;
    private startBlock: DragSource | null = null;
    private currentTargetLine: number | null = null;
    private currentTarget: DropTarget | null = null;
    private ownerDocument: Document;
    private ownerWindow: Window;
    private activePointerId: number | null = null;
    private pointerCaptureEl: Element | null = null;
    private dragEvents: Component | null = null;
    private targetView: EditorView;
    private targetDocument: Text | null = null;
    private lastPoint = { x: 0, y: 0 };

    constructor(private view: EditorView, private onStopped?: () => void, private transfers?: CrossDocumentDrag) {
        super();
        this.targetView = view;
        this.ownerDocument = view.dom.ownerDocument;
        this.ownerWindow = this.ownerDocument.defaultView ?? activeWindow;
    }

    startDrag(lineNo: number, event: MouseEvent | PointerEvent, captureEl?: HTMLElement) {
        this.stopDrag(false);
        this.isDragging = true;
        
        // Resolve the CodeMirror selection before clearing the browser's visual selection.
        this.startBlock = getBlockSource(this.view.state, lineNo);
        this.ownerWindow.getSelection()?.removeAllRanges();
        const text = this.startBlock.text;

        // Create ghost element
        this.ghostEl = this.ownerDocument.body.createDiv({
            cls: "block-drag-ghost",
            text: text.slice(0, 50) + (text.length > 50 ? "..." : "")
        });
        this.updateGhostPosition(event.clientX, event.clientY);

        // Create indicator line
        this.indicatorEl = this.ownerDocument.body.createDiv({
            cls: "block-drag-indicator"
        });
        this.labelEl = this.indicatorEl.createSpan({ cls: "block-drag-label" });
        this.containerEl = this.ownerDocument.body.createDiv({ cls: "block-drag-container" });

        this.dragEvents = this.addChild(new Component());
        this.dragEvents.registerDomEvent(this.ownerWindow, "blur", () => this.stopDrag(false));
        this.dragEvents.registerDomEvent(this.ownerDocument, "keydown", (event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            this.stopDrag(false);
        }, true);
        if ("pointerId" in event) {
            this.activePointerId = event.pointerId;
            this.capturePointer(event, captureEl);
            if (captureEl) this.dragEvents.registerDomEvent(captureEl, "lostpointercapture", (lost) => {
                if (this.isDragging && lost.pointerId === this.activePointerId) this.stopDrag(false);
            });
            this.dragEvents.registerDomEvent(this.ownerDocument, "pointermove", this.onPointerMove);
            // 句柄会拦截冒泡；在捕获阶段结束拖拽，保证松手后清理。
            this.dragEvents.registerDomEvent(this.ownerDocument, "pointerup", this.onPointerUp, true);
            this.dragEvents.registerDomEvent(this.ownerDocument, "pointercancel", this.onPointerCancel, true);
        } else {
            this.dragEvents.registerDomEvent(this.ownerDocument, "mousemove", this.onMouseMove);
            this.dragEvents.registerDomEvent(this.ownerDocument, "mouseup", this.onMouseUp, true);
        }
        
        // Prevent text selection during drag
        this.ownerDocument.body.addClass("is-dragging-block");
    }

    private onMouseMove = (event: MouseEvent) => {
        if (!this.isDragging) return;
        this.handleMove(event);
    };

    private onPointerMove = (event: PointerEvent): void => {
        if (!this.isDragging || event.pointerId !== this.activePointerId) return;
        event.preventDefault();
        this.handleMove(event);
    };

    private handleMove(point: { clientX: number; clientY: number }): void {
        this.lastPoint = { x: point.clientX, y: point.clientY };
        this.updateGhostPosition(point.clientX, point.clientY);

        if (this.startBlock?.document !== this.view.state.doc) {
            this.stopDrag(false);
            return;
        }
        const view = this.transfers ? this.transfers.targetAt(this.view, point.clientX, point.clientY) : this.view;
        if (!view) { this.clearTarget(); return; }
        this.targetView = view;
        const rect = view.scrollDOM.getBoundingClientRect();
        if (point.clientY < rect.top || point.clientY > rect.bottom || point.clientX < rect.left - 80 || point.clientX > rect.right) {
            this.clearTarget();
            return;
        }
        const renderedLine = measureBlockLayout(view).lineAtY(point.clientY);
        if (renderedLine !== null) {
            this.updateIndicator(renderedLine, point.clientY, point.clientX);
            return;
        }
        const pos = view.posAtCoords({ x: Math.max(rect.left + 2, Math.min(rect.right - 2, point.clientX)), y: point.clientY });
        if (pos !== null) {
            const line = view.state.doc.lineAt(pos);
            this.updateIndicator(line.number, point.clientY, point.clientX);
        } else this.clearTarget();
    }

    private onMouseUp = (event: MouseEvent) => {
        this.handleMove(event);
        this.stopDrag();
    };

    private onPointerUp = (event: PointerEvent): void => {
        if (event.pointerId !== this.activePointerId) return;
        event.preventDefault();
        this.handleMove(event);
        this.stopDrag();
    };

    private onPointerCancel = (event: PointerEvent): void => {
        if (event.pointerId !== this.activePointerId) return;
        this.stopDrag(false);
    };

    private stopDrag(commit = true) {
        if (!this.isDragging) return;
        const source = this.startBlock, target = this.currentTarget;
        const targetView = this.targetView, targetDocument = this.targetDocument;
        this.isDragging = false;
        this.startBlock = null;
        this.currentTargetLine = null;
        this.currentTarget = null;
        this.targetDocument = null;

        if (this.ghostEl) {
            this.ghostEl.remove();
            this.ghostEl = null;
        }
        if (this.indicatorEl) {
            this.indicatorEl.remove();
            this.indicatorEl = null;
        }
        this.containerEl?.remove();
        this.containerEl = null;
        this.labelEl = null;

        this.releasePointer();
        if (this.dragEvents) this.removeChild(this.dragEvents);
        this.dragEvents = null;
        this.ownerDocument.body.removeClass("is-dragging-block");
        this.onStopped?.();
        if (commit && source && target && source.document === this.view.state.doc && targetDocument === targetView.state.doc) {
            if (this.transfers && !this.transfers.sameFile(this.view, targetView)) this.transfers.offer(this.view, source, targetView, target, this.lastPoint);
            else if (this.view.state.doc.toString() === targetView.state.doc.toString()) this.moveBlock(source, target);
        }
    }

    onunload(): void {
        this.stopDrag(false);
    }

    private capturePointer(event: PointerEvent, captureEl?: HTMLElement): void {
        const target = captureEl ?? event.currentTarget;
        const ownerElement = this.ownerDocument.defaultView?.Element;
        if (!ownerElement || !(target instanceof ownerElement)) return;
        try {
            target.setPointerCapture(event.pointerId);
            this.pointerCaptureEl = target;
        } catch {
            // 合成事件或旧 WebView 可能不支持 pointer capture。
        }
    }

    private releasePointer(): void {
        if (this.pointerCaptureEl && this.activePointerId !== null) {
            try {
                this.pointerCaptureEl.releasePointerCapture(this.activePointerId);
            } catch {
                // 指针可能已经由宿主释放。
            }
        }
        this.pointerCaptureEl = null;
        this.activePointerId = null;
    }

    private updateGhostPosition(x: number, y: number) {
        if (this.ghostEl) {
            this.ghostEl.setCssStyles({
                left: `${Math.max(4, Math.min(x + 10, this.ownerWindow.innerWidth - this.ghostEl.offsetWidth - 4))}px`,
                top: `${Math.max(4, Math.min(y + 10, this.ownerWindow.innerHeight - this.ghostEl.offsetHeight - 4))}px`
            });
        }
    }

    private clearTarget(): void {
        this.targetDocument = null;
        this.currentTarget = null;
        this.currentTargetLine = null;
        this.indicatorEl?.setCssStyles({ display: "none" });
        this.containerEl?.setCssStyles({ display: "none" });
    }

    private updateIndicator(lineNo: number, mouseY: number, mouseX?: number) {
        if (!this.indicatorEl) return;

        try {
            const view = this.targetView;
            const line = view.state.doc.line(lineNo);
            const layout = measureBlockLayout(view);
            const coords = layout.line(lineNo);
            if (!coords) { this.clearTarget(); return; }
            const endCoords = layout.rendered(lineNo) ? coords : view.coordsAtPos(line.to) ?? coords;
            const after = mouseY > coords.top + (endCoords.bottom - coords.top) / 2;
            let left = coords.left;
            let label = "";
            const path = getDragPath(view.state.doc, lineNo), root = path[0];
            const bounds = layout.node(root);
            const first = bounds ?? coords;
            const last = bounds ?? endCoords;
            const containers = path.filter(node => isDragList(node) || isDragQuote(node));
            const inside = mouseX !== undefined && containers.length > 0 && mouseX >= first.left - 8
                && mouseY > first.top + 3 && mouseY < last.bottom - 3;
            let indent = 0, quoteOnly = false;
            const item = [...path].reverse().find(node => node.item);
            if (inside && item?.marker && mouseX !== undefined) {
                const raw = view.state.doc.line(item.startLine).text;
                const prefix = raw.match(/^[ \t]*(?:>[ \t]*)*(?:[-+*]|\d+[.)])[ \t]+/)?.[0].length ?? 0;
                const contentCoords = layout.itemContent(item) ?? view.coordsAtPos(item.from + prefix) ?? coords;
                const step = Math.max(16, view.defaultCharacterWidth * item.marker.width);
                indent = mouseX >= contentCoords.left + step ? 1 : mouseX < contentCoords.left - step * 0.8 ? -1 : 0;
                quoteOnly = indent < 0 && path.some(isDragQuote) && !path.some(node => node.item && node !== item);
                left = contentCoords.left + (indent > 0 ? step : indent < 0 ? -step : 0);
            }
            const target = getDropTarget(view.state.doc, lineNo, after, inside, indent, quoteOnly);
            if (target.mode === "list") label = t(indent > 0 ? "drag.nest" : indent < 0 ? "drag.outdent" : "drag.list");
            if (target.mode === "quote") label = t(target.container?.type === "callout" ? "drag.callout" : "drag.quote");

            if (this.startBlock && (!this.transfers || this.transfers.sameFile(this.view, view)) && !canDrop(this.startBlock, target)) { this.clearTarget(); return; }
            this.currentTarget = target;
            this.targetDocument = view.state.doc;
            this.currentTargetLine = target.line;
            const doc = view.state.doc;
            const edge = target.line > doc.lines ? layout.line(doc.lines) : layout.line(target.line);
            const top = target.line > doc.lines ? (edge ?? endCoords).bottom : (edge ?? coords).top;
            const contentRect = view.contentDOM.getBoundingClientRect();
            left = Math.max(contentRect.left, Math.min(left, contentRect.right - 24));
            if (target.mode === "outside") left = contentRect.left;
            this.indicatorEl.setCssStyles({ top: `${top}px`, left: `${left}px`, width: `${Math.max(24, contentRect.right - left)}px`, display: "block" });
            this.indicatorEl.toggleClass("is-container-drop", target.mode !== "outside");
            this.labelEl?.setText(this.transfers && !this.transfers.sameFile(this.view, view)
                ? [`${t("transfer.choose")} → ${this.transfers.nameOf(view)}`, label].filter(Boolean).join(" · ") : label);
            if (target.container) {
                const start = layout.node(target.container) ?? coords;
                const end = start;
                const viewport = view.scrollDOM.getBoundingClientRect();
                const highlightTop = Math.max(viewport.top, start.top);
                this.containerEl?.setCssStyles({ display: "block", left: `${Math.max(contentRect.left, start.left - 4)}px`, top: `${highlightTop}px`,
                    width: `${Math.max(24, contentRect.right - Math.max(contentRect.left, start.left - 4))}px`,
                    height: `${Math.max(0, Math.min(viewport.bottom, end.bottom) - highlightTop)}px` });
            } else this.containerEl?.setCssStyles({ display: "none" });
        } catch {
            // A folded/offscreen line can disappear during measurement; never keep a stale drop.
            this.clearTarget();
        }
    }

    private moveBlock(startBlock: DragSource, target: DropTarget | number) {
        const doc = this.view.state.doc;
        const drop = typeof target === "number" ? { line: target, mode: "outside" as const, prefix: "", container: null, item: null, marker: null, depth: 0 } : target;
        const edit = getDropEdit(doc, startBlock, drop);
        if (edit) this.view.dispatch({ ...edit, scrollIntoView: true, userEvent: "move.block" });
    }
}
