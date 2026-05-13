import { EditorView } from "@codemirror/view";
import NotionBlock from "./main";

export class DragManager {
    private ghostEl: HTMLElement | null = null;
    private indicatorEl: HTMLElement | null = null;
    private isDragging = false;
    private startBlock: { from: number, to: number, text: string } | null = null;
    private currentTargetLine: number | null = null;

    constructor(private plugin: NotionBlock, private view: EditorView) {}

    startDrag(lineNo: number, event: MouseEvent) {
        this.isDragging = true;
        
        // Clear any existing selection
        activeWindow.getSelection()?.removeAllRanges();
        
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
        this.ghostEl = activeDocument.body.createDiv({
            cls: "block-drag-ghost",
            text: text.slice(0, 50) + (text.length > 50 ? "..." : "")
        });
        this.updateGhostPosition(event.clientX, event.clientY);

        // Create indicator line
        this.indicatorEl = activeDocument.body.createDiv({
            cls: "block-drag-indicator"
        });

        activeDocument.addEventListener("mousemove", this.onMouseMove);
        activeDocument.addEventListener("mouseup", this.onMouseUp);
        
        // Prevent text selection during drag
        activeDocument.body.addClass("is-dragging-block");
    }

    private onMouseMove = (event: MouseEvent) => {
        if (!this.isDragging) return;

        this.updateGhostPosition(event.clientX, event.clientY);

        const pos = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos !== null) {
            const line = this.view.state.doc.lineAt(pos);
            this.updateIndicator(line.number, event.clientY);
        }
    };

    private onMouseUp = (_event: MouseEvent) => {
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

        activeDocument.removeEventListener("mousemove", this.onMouseMove);
        activeDocument.removeEventListener("mouseup", this.onMouseUp);
        activeDocument.body.removeClass("is-dragging-block");
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
