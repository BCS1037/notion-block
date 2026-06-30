import { EditorView } from "@codemirror/view";
import NotionBlock from "./main";

interface DragPoint {
    clientX: number;
    clientY: number;
}

export class DragManager {
    private ghostEl: HTMLElement | null = null;
    private indicatorEl: HTMLElement | null = null;
    private isDragging = false;
    private startBlock: { from: number, to: number, text: string } | null = null;
    private currentTargetLine: number | null = null;
    private ownerDocument: Document;
    private ownerWindow: Window;
    private activePointerId: number | null = null;
    private pointerCaptureEl: Element | null = null;

    constructor(private plugin: NotionBlock, private view: EditorView) {
        this.ownerDocument = view.dom.ownerDocument;
        this.ownerWindow = this.ownerDocument.defaultView ?? activeWindow;
    }

    startDrag(lineNo: number, event: MouseEvent | PointerEvent, captureEl?: Element | null) {
        this.isDragging = true;
        
        // 清理现有选区，避免拖拽时触发文本选择。
        this.ownerWindow.getSelection()?.removeAllRanges();
        
        const doc = this.view.state.doc;
        let fromPos, toPos, text;

        if (this.plugin.settings.dragGranularity === "paragraph") {
            // 按空行寻找段落边界。
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

        // 创建拖拽幽灵块。
        this.ghostEl = this.ownerDocument.body.createDiv({
            cls: "block-drag-ghost",
            text: text.slice(0, 50) + (text.length > 50 ? "..." : "")
        });
        this.updateGhostPosition(event.clientX, event.clientY);

        // 创建插入指示线。
        this.indicatorEl = this.ownerDocument.body.createDiv({
            cls: "block-drag-indicator"
        });

        if (this.isPointerEvent(event)) {
            this.activePointerId = event.pointerId;
            this.capturePointer(event, captureEl);
            this.ownerDocument.addEventListener("pointermove", this.onPointerMove);
            this.ownerDocument.addEventListener("pointerup", this.onPointerUp);
            this.ownerDocument.addEventListener("pointercancel", this.onPointerCancel);
        } else {
            this.ownerDocument.addEventListener("mousemove", this.onMouseMove);
            this.ownerDocument.addEventListener("mouseup", this.onMouseUp);
        }
        
        // 拖拽期间禁止选择文本。
        this.ownerDocument.body.addClass("is-dragging-block");
    }

    private onMouseMove = (event: MouseEvent) => {
        if (!this.isDragging) return;
        this.handleMove(event);
    };

    private onPointerMove = (event: PointerEvent) => {
        if (!this.isDragging || !this.isActivePointer(event)) return;
        event.preventDefault();
        this.handleMove(event);
    };

    private handleMove(point: DragPoint): void {
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

    private onPointerUp = (event: PointerEvent) => {
        if (!this.isActivePointer(event)) return;
        event.preventDefault();
        this.stopDrag();
    };

    private onPointerCancel = (event: PointerEvent) => {
        if (!this.isActivePointer(event)) return;
        event.preventDefault();
        this.stopDrag();
    };

    private stopDrag() {
        if (!this.isDragging) return;

        if (this.startBlock !== null && this.currentTargetLine !== null) {
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
        this.ownerDocument.removeEventListener("mousemove", this.onMouseMove);
        this.ownerDocument.removeEventListener("mouseup", this.onMouseUp);
        this.ownerDocument.removeEventListener("pointermove", this.onPointerMove);
        this.ownerDocument.removeEventListener("pointerup", this.onPointerUp);
        this.ownerDocument.removeEventListener("pointercancel", this.onPointerCancel);
        this.ownerDocument.body.removeClass("is-dragging-block");
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
                // 用行尾坐标估算完整行高。
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
            // 行不存在时忽略。
        }
    }

    private moveBlock(startBlock: { from: number, to: number, text: string }, toLineNo: number) {
        const doc = this.view.state.doc;
        const textToMove = startBlock.text;

        // 处理插入到文档末尾。
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

        // 丢回原区块内部时不处理。
        if (toLine.from >= startBlock.from && toLine.to <= startBlock.to) return;
        
        if (startBlock.from < toLine.from) {
            // 向下移动。
            this.view.dispatch({
                changes: [
                    { from: toLine.from, insert: textToMove + "\n" },
                    { from: startBlock.from, to: Math.min(startBlock.to + 1, doc.length) }
                ],
                scrollIntoView: true,
                userEvent: "move.block"
            });
        } else {
            // 向上移动。
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

    private isPointerEvent(event: MouseEvent | PointerEvent): event is PointerEvent {
        return "pointerId" in event;
    }

    private isActivePointer(event: PointerEvent): boolean {
        return this.activePointerId === null || event.pointerId === this.activePointerId;
    }

    private capturePointer(event: PointerEvent, captureEl?: Element | null): void {
        const target = captureEl ?? event.currentTarget;
        if (!(target instanceof this.ownerWindow.Element)) return;
        try {
            target.setPointerCapture(event.pointerId);
            this.pointerCaptureEl = target;
        } catch {
            /* 某些移动端 WebView 不支持或会拒绝 pointer capture。 */
        }
    }

    private releasePointer(): void {
        if (this.pointerCaptureEl && this.activePointerId !== null) {
            try {
                this.pointerCaptureEl.releasePointerCapture(this.activePointerId);
            } catch {
                /* pointer 已结束时释放可能失败，可忽略。 */
            }
        }
        this.pointerCaptureEl = null;
        this.activePointerId = null;
    }
}
