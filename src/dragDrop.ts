import { EditorView } from "@codemirror/view";
import { Component } from "obsidian";
import NotionBlock from "./main";

export class DragManager extends Component {
    private ghostEl: HTMLElement | null = null;
    private indicatorEl: HTMLElement | null = null;
    private isDragging = false;
    private startBlock: { from: number, to: number, text: string } | null = null;
    private currentTargetLine: number | null = null;
    private ownerDocument: Document;
    private ownerWindow: Window;
    private activePointerId: number | null = null;
    private pointerCaptureEl: Element | null = null;
    private dragEvents: Component | null = null;

    constructor(private plugin: NotionBlock, private view: EditorView) {
        super();
        this.ownerDocument = view.dom.ownerDocument;
        this.ownerWindow = this.ownerDocument.defaultView ?? activeWindow;
    }

    startDrag(lineNo: number, event: MouseEvent | PointerEvent, captureEl?: HTMLElement) {
        this.stopDrag(false);
        this.isDragging = true;
        
        // Clear any existing selection
        this.ownerWindow.getSelection()?.removeAllRanges();
        
        const doc = this.view.state.doc;
        let fromPos, toPos, text;

        if (this.plugin.settings.dragGranularity === "paragraph") {
            // Find paragraph boundaries
            let startLine = lineNo;
            while (startLine > 1 && doc.line(startLine - 1).text.trim() !== "") {
                startLine--;
            }
            let endLine = lineNo;
            while (endLine < doc.lines && doc.line(endLine + 1).text.trim() !== "") {
                endLine++;
            }
            
            const startL = doc.line(startLine);
            const endL = doc.line(endLine);
            fromPos = startL.from;
            toPos = endL.to;
            text = doc.sliceString(fromPos, toPos);
        } else {
            const line = doc.line(lineNo);
            fromPos = line.from;
            toPos = line.to;
            text = line.text;
        }

        this.startBlock = { from: fromPos, to: toPos, text: text };

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

        this.dragEvents = this.addChild(new Component());
        if ("pointerId" in event) {
            this.activePointerId = event.pointerId;
            this.capturePointer(event, captureEl);
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
        this.updateGhostPosition(point.clientX, point.clientY);

        const pos = this.view.posAtCoords({ x: point.clientX, y: point.clientY });
        if (pos !== null) {
            const line = this.view.state.doc.lineAt(pos);
            this.updateIndicator(line.number, point.clientY);
        }
    }

    private onMouseUp = (_event: MouseEvent) => {
        this.stopDrag();
    };

    private onPointerUp = (event: PointerEvent): void => {
        if (event.pointerId !== this.activePointerId) return;
        this.stopDrag();
    };

    private onPointerCancel = (event: PointerEvent): void => {
        if (event.pointerId !== this.activePointerId) return;
        this.stopDrag(false);
    };

    private stopDrag(commit = true) {
        if (!this.isDragging) return;

        if (commit && this.startBlock !== null && this.currentTargetLine !== null) {
            this.moveBlock(this.startBlock, this.currentTargetLine);
        }

        this.isDragging = false;
        this.startBlock = null;
        this.currentTargetLine = null;

        if (this.ghostEl) {
            this.ghostEl.remove();
            this.ghostEl = null;
        }
        if (this.indicatorEl) {
            this.indicatorEl.remove();
            this.indicatorEl = null;
        }

        this.releasePointer();
        if (this.dragEvents) this.removeChild(this.dragEvents);
        this.dragEvents = null;
        this.ownerDocument.body.removeClass("is-dragging-block");
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
                left: `${x + 10}px`,
                top: `${y + 10}px`
            });
        }
    }

    private updateIndicator(lineNo: number, mouseY: number) {
        if (!this.indicatorEl) return;

        try {
            const line = this.view.state.doc.line(lineNo);
            const coords = this.view.coordsAtPos(line.from);
            
            if (coords) {
                // Use coordsAtPos for the end of line to determine full line height
                const endCoords = this.view.coordsAtPos(line.to);
                
                let top = coords.top;
                let targetLine = lineNo;

                if (endCoords) {
                    const lineBottom = endCoords.bottom;
                    const midPoint = coords.top + (lineBottom - coords.top) / 2;
                    if (mouseY > midPoint) {
                        top = lineBottom;
                        targetLine = lineNo + 1;
                    } else {
                        top = coords.top;
                        targetLine = lineNo;
                    }
                }

                this.currentTargetLine = targetLine;

                this.indicatorEl.setCssStyles({
                    top: `${top}px`,
                    left: `${coords.left}px`,
                    width: `${this.view.contentDOM.clientWidth}px`,
                    display: "block"
                });
            }
        } catch {
            // Ignore if line doesn't exist
        }
    }

    private moveBlock(startBlock: { from: number, to: number, text: string }, toLineNo: number) {
        const doc = this.view.state.doc;
        const textToMove = startBlock.text;

        // Handle insertion at the end of the document
        if (toLineNo > doc.lines) {
            this.view.dispatch({
                changes: [
                    { from: doc.length, insert: "\n" + textToMove },
                    { from: startBlock.from, to: Math.min(startBlock.to + 1, doc.length) }
                ],
                scrollIntoView: true,
                userEvent: "move.block"
            });
            return;
        }

        const toLine = doc.line(toLineNo);

        // If dropping inside the same block, do nothing
        if (toLine.from >= startBlock.from && toLine.to <= startBlock.to) return;
        
        if (startBlock.from < toLine.from) {
            // Moving down
            this.view.dispatch({
                changes: [
                    { from: toLine.from, insert: textToMove + "\n" }, // Insert before the target line
                    { from: startBlock.from, to: Math.min(startBlock.to + 1, doc.length) }
                ],
                scrollIntoView: true,
                userEvent: "move.block"
            });
        } else {
            // Moving up
            this.view.dispatch({
                changes: [
                    { from: toLine.from, insert: textToMove + "\n" },
                    { from: startBlock.from, to: Math.min(startBlock.to + 1, doc.length) }
                ],
                scrollIntoView: true,
                userEvent: "move.block"
            });
        }
    }
}
