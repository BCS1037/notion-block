import type { EditorView } from "@codemirror/view";
import { getDragPath, getDragStructure, isDragList, isDragQuote } from "./blockDrag";
import type { DragNode } from "./blockDrag";

interface BlockRect { left: number; right: number; top: number; bottom: number }
interface RenderedBlock { element: HTMLElement; head: BlockRect | null; rows: readonly BlockRect[] }

function visibleRect(element: HTMLElement): BlockRect | null {
    const rect = element.getBoundingClientRect();
    return rect.width && rect.height ? rect : null;
}

function firstContentRect(element: HTMLElement): BlockRect | null {
    const range = element.ownerDocument.createRange();
    range.setStart(element, 0);
    const block = Array.from(element.childNodes).findIndex(node => node.nodeType === 1
        && /^(?:UL|OL|BLOCKQUOTE|DIV|PRE|TABLE|P)$/.test(node.nodeName));
    range.setEnd(element, block < 0 ? element.childNodes.length : block);
    const rect = range.getBoundingClientRect();
    return rect.width && rect.height ? rect : visibleRect(element);
}

/** Soft breaks and BRs retain source rows even when one paragraph spans several visual lines. */
function paragraphRows(element: HTMLElement, count: number): BlockRect[] {
    if (count < 2) return [];
    const ranges: Range[] = [], doc = element.ownerDocument;
    let start = { node: element as Node, offset: 0 }, afterBreak = false;
    const finish = (node: Node, offset: number): void => {
        const range = doc.createRange();
        range.setStart(start.node, start.offset); range.setEnd(node, offset);
        ranges.push(range);
    };
    const visit = (parent: Node): void => {
        for (let i = 0; i < parent.childNodes.length; i++) {
            const child = parent.childNodes[i];
            if (child.nodeType === 3) {
                const text = child.textContent ?? "";
                for (let at = 0; at < text.length; at++) {
                    if (text[at] !== "\n") { afterBreak = false; continue; }
                    if (!afterBreak) finish(child, at);
                    start = { node: child, offset: at + 1 }; afterBreak = false;
                }
            } else if (child.nodeName === "BR") {
                finish(parent, i); start = { node: parent, offset: i + 1 }; afterBreak = true;
            } else if (/^(?:UL|OL|BLOCKQUOTE|DIV|PRE|TABLE|P)$/.test(child.nodeName)) {
                finish(parent, i); return;
            } else visit(child);
        }
        if (parent === element) finish(element, element.childNodes.length);
    };
    visit(element);
    // Tight list paragraphs can have a trailing renderer newline before their child list.
    while (ranges.length > count && !ranges[ranges.length - 1].toString().trim()) ranges.pop();
    if (ranges.length !== count) return [];
    const rows = ranges.map(range => range.getBoundingClientRect());
    return rows.every(rect => rect.width && rect.height) ? rows : [];
}

function matchesBlock(node: DragNode, element: HTMLElement): boolean {
    if (isDragList(node)) return element.tagName === (node.marker?.number === null ? "UL" : "OL");
    if (node.type === "callout") return element.hasClass("callout");
    if (node.type === "blockquote") return element.tagName === "BLOCKQUOTE";
    if (node.type === "heading") return /^H[1-6]$/.test(element.tagName);
    if (node.type === "code") return element.tagName === "PRE" || element.hasClass("el-pre");
    if (node.type === "table") return element.tagName === "TABLE" || !!element.querySelector("table");
    if (node.type === "math") return element.hasClass("math") || element.hasClass("math-block") || !!element.querySelector(".math-block");
    if (node.type === "divider") return element.tagName === "HR";
    if (node.type === "embed") return element.hasClass("internal-embed") || !!element.querySelector(".internal-embed,img");
    return element.tagName === "P";
}

/** Live Preview replaces a callout with one widget. Map semantic children to rendered DOM. */
export function measureBlockLayout(view: EditorView) {
    const doc = view.state.doc, mapped = new Map<DragNode, RenderedBlock>();
    const ownerElement = view.dom.ownerDocument.defaultView?.HTMLElement;
    const bindScope = (nodes: readonly DragNode[], parent: HTMLElement): void => {
        const elements = Array.from(parent.children).filter((el): el is HTMLElement => !!ownerElement && el.instanceOf(ownerElement));
        let cursor = 0;
        for (const node of nodes) {
            if (!node.lines.some(line => line.trim()) || node.type === "comment" || node.type === "frontmatter") continue;
            const at = elements.findIndex((element, index) => index >= cursor && matchesBlock(node, element));
            if (at < 0) continue;
            bind(node, elements[at]); cursor = at + 1;
        }
    };
    const bind = (node: DragNode, element: HTMLElement): void => {
        if (!visibleRect(element)) return;
        let head: BlockRect | null = null;
        if (node.type === "callout") {
            const calloutTitleElement = Array.from(element.children).find(el => el.hasClass("callout-title"));
            if (ownerElement && calloutTitleElement?.instanceOf(ownerElement)) head = visibleRect(calloutTitleElement);
        } else if (node.item) head = firstContentRect(element);
        mapped.set(node, { element, head, rows: node.type === "paragraph" ? paragraphRows(element, node.lines.length) : [] });
        if (isDragList(node)) {
            const items = Array.from(element.children).filter((el): el is HTMLElement => !!ownerElement && el.instanceOf(ownerElement) && el.tagName === "LI");
            node.children.forEach((item, index) => { if (items[index]) bind(item, items[index]); });
        } else if (isDragQuote(node)) {
            const content = node.type === "callout" ? Array.from(element.children).find(el => el.hasClass("callout-content")) : element;
            if (ownerElement && content?.instanceOf(ownerElement)) bindScope(node.children, content);
        } else if (node.item) {
            const first = node.children[0];
            const paragraph = element.querySelector<HTMLElement>(":scope > p");
            const inline = first?.type === "paragraph" && first.startLine === node.startLine;
            if (inline) mapped.set(first, { element: paragraph ?? element, head: paragraph ? visibleRect(paragraph) : head,
                rows: paragraphRows(paragraph ?? element, first.lines.length) });
            bindScope(inline ? node.children.slice(1) : node.children, element);
        }
    };
    for (const root of getDragStructure(doc)) {
        if (root.type !== "callout" || root.to < view.viewport.from || root.from > view.viewport.to) continue;
        const position = view.domAtPos(root.from);
        const element = ownerElement && position.node.instanceOf(ownerElement) ? position.node : position.node.parentElement;
        const candidates = [element, position.node.childNodes[position.offset], position.node.childNodes[position.offset - 1]];
        for (const candidate of candidates) {
            if (!ownerElement || !candidate?.instanceOf(ownerElement)) continue;
            const widget = candidate.matches(".cm-callout") ? candidate : candidate.closest<HTMLElement>(".cm-callout");
            const callout = widget?.querySelector<HTMLElement>(".callout");
            if (callout) { bind(root, callout); break; }
        }
    }
    const nodeRect = (node: DragNode, head = false): BlockRect | null => {
        const rendered = mapped.get(node);
        if (rendered) return head && rendered.head ? rendered.head : visibleRect(rendered.element);
        const start = view.coordsAtPos(node.from), end = view.coordsAtPos(node.to);
        return start && end ? { left: Math.min(start.left, end.left), right: Math.max(start.right, end.right), top: start.top, bottom: end.bottom } : start;
    };
    const lineRect = (lineNo: number): BlockRect | null => {
        const path = getDragPath(doc, lineNo);
        for (let i = path.length - 1; i >= 0; i--) {
            const node = path[i], rendered = mapped.get(node);
            if (!rendered) continue;
            const row = rendered.rows[lineNo - node.startLine];
            if (row) return row;
            if (node.startLine !== lineNo && (node.item || isDragQuote(node))) {
                const siblings = node.children;
                const previous = [...siblings].reverse().find(child => child.endLine < lineNo && mapped.has(child));
                const next = siblings.find(child => child.startLine > lineNo && mapped.has(child));
                const before = previous ? nodeRect(previous) : rendered.head;
                const after = next ? nodeRect(next) : nodeRect(node);
                if (before && after) {
                    const top = before.bottom, bottom = Math.max(top, next ? after.top : after.bottom);
                    return { left: next ? after.left : before.left, right: after.right, top, bottom };
                }
            }
            return nodeRect(node, true);
        }
        return view.coordsAtPos(doc.line(lineNo).from);
    };
    const lineAtY = (y: number): number | null => {
        for (const root of getDragStructure(doc)) {
            if (!mapped.has(root)) continue;
            const rect = nodeRect(root);
            if (!rect || y < rect.top || y > rect.bottom) continue;
            let closest = root.startLine, distance = Infinity;
            for (const [node, rendered] of mapped) {
                if (node.startLine < root.startLine || node.endLine > root.endLine) continue;
                const rows = rendered.rows.length ? rendered.rows : [nodeRect(node, true)];
                rows.forEach((rect, index) => {
                    if (!rect) return;
                    const nextDistance = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
                    if (nextDistance <= distance) { closest = node.startLine + index; distance = nextDistance; }
                });
            }
            return closest;
        }
        return null;
    };
    return { node: nodeRect, line: lineRect, lineAtY,
        rendered: (lineNo: number): boolean => getDragPath(doc, lineNo).some(node => mapped.has(node)),
        itemContent: (item: DragNode): BlockRect | null => mapped.get(item)?.head ?? null };
}
