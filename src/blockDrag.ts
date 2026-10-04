import { EditorState, Text } from "@codemirror/state";
import type { ChangeSpec } from "@codemirror/state";
import { CALLOUT_HEADER, getBlockRanges } from "./blockRange";
import type { BlockRange, MarkdownBlockType } from "./blockRange";

interface ListMarker {
    indent: number;
    width: number;
    token: string;
    number: number | null;
    check: string | null;
    content: string;
}

/** Lines are expressed in this node's scope, without ancestor quote/list prefixes. */
export interface DragNode extends BlockRange {
    item: boolean;
    parent: DragNode | null;
    children: DragNode[];
    prefix: string;
    lines: readonly string[];
    marker: ListMarker | null;
}

export interface DragSource extends BlockRange {
    text: string;
    content: string;
    prefix: string;
    nodes: readonly DragNode[];
    document: Text;
}

export interface DropTarget {
    line: number;
    mode: "outside" | "list" | "quote";
    prefix: string;
    container: DragNode | null;
    item: DragNode | null;
    marker: ListMarker | null;
    depth: number;
}

export interface DropEdit {
    changes: ChangeSpec;
    selection: { anchor: number; head: number };
}

const structures = new WeakMap<Text, readonly DragNode[]>();
const LIST_TYPES: readonly MarkdownBlockType[] = ["bullet", "numbered", "todo"];

function columns(text: string): number {
    let width = 0;
    for (const char of text) width += char === "\t" ? 4 - width % 4 : 1;
    return width;
}

function stripIndent(text: string, width: number): string {
    let at = 0, used = 0;
    while (at < text.length && used < width && /[ \t]/.test(text[at])) {
        used += text[at] === "\t" ? 4 - used % 4 : 1;
        at++;
    }
    return " ".repeat(Math.max(0, used - width)) + text.slice(at);
}

function marker(text: string): ListMarker | null {
    const match = text.match(/^([ \t]*)([-+*]|\d+[.)])([ \t]+)(?:\[([^\]])\]([ \t]+|$))?(.*)$/);
    if (!match) return null;
    const indent = columns(match[1]);
    // The task checkbox belongs to item content; continuation indentation follows the list marker.
    return {
        indent, width: columns(match[1] + match[2] + match[3]), token: match[2],
        number: /^\d/.test(match[2]) ? parseInt(match[2], 10) : null,
        check: match[4] ?? null, content: match[6]
    };
}

export function isDragList(node: DragNode): boolean {
    return !node.item && LIST_TYPES.includes(node.type);
}

export function isDragQuote(node: DragNode): boolean {
    return !node.item && (node.type === "callout" || node.type === "blockquote");
}

function parseScope(doc: Text, lines: readonly string[], startLine: number, prefix: string, parent: DragNode | null): DragNode[] {
    if (!lines.length) return [];
    const local = Text.of(lines);
    const ranges: BlockRange[] = [];
    for (const block of getBlockRanges(local)) {
        const previous = ranges[ranges.length - 1];
        const head = marker(local.line(block.startLine).text);
        const previousHead = previous ? marker(local.line(previous.startLine).text) : null;
        // A checkbox does not break an ordered sequence into independent numbered lists.
        if (previous && LIST_TYPES.includes(previous.type) && LIST_TYPES.includes(block.type)
            && previous.endLine + 1 === block.startLine && previousHead?.number !== null && head?.number !== null
            && previousHead && head && previousHead.indent === head.indent) {
            previous.endLine = block.endLine;
            previous.to = block.to;
        } else ranges.push({ ...block });
    }
    return ranges.map(block => {
        const first = startLine + block.startLine - 1, last = startLine + block.endLine - 1;
        const content = lines.slice(block.startLine - 1, block.endLine);
        const node: DragNode = {
            from: doc.line(first).from, to: doc.line(last).to, startLine: first, endLine: last,
            type: block.type, item: false, parent, children: [], prefix, lines: content, marker: marker(content[0])
        };
        if (isDragQuote(node)) {
            const header = node.type === "callout" ? 1 : 0;
            node.children = parseScope(doc, content.slice(header).map(line => line.replace(/^ {0,3}>[ \t]?/, "")),
                first + header, prefix + "> ", node);
        } else if (isDragList(node) && node.marker) {
            const starts = [0];
            for (let i = 1; i < content.length; i++) {
                const next = marker(content[i]);
                if (next?.indent === node.marker.indent) starts.push(i);
            }
            node.children = starts.map((at, index) => {
                const end = (starts[index + 1] ?? content.length) - 1;
                const itemLines = content.slice(at, end + 1);
                const head = marker(itemLines[0]);
                const item: DragNode = {
                    from: doc.line(first + at).from, to: doc.line(first + end).to,
                    startLine: first + at, endLine: first + end, type: node.type, item: true,
                    parent: node, children: [], prefix, lines: itemLines, marker: head
                };
                if (head) {
                    const firstContent = (head.check === null ? "" : `[${head.check}] `) + head.content;
                    item.children = parseScope(doc, [firstContent, ...itemLines.slice(1).map(line => stripIndent(line, head.width))],
                        item.startLine, prefix + " ".repeat(head.width), item);
                }
                return item;
            });
        }
        return node;
    });
}

export function getDragStructure(doc: Text): readonly DragNode[] {
    const cached = structures.get(doc);
    if (cached) return cached;
    const nodes = parseScope(doc, Array.from({ length: doc.lines }, (_, i) => doc.line(i + 1).text), 1, "", null);
    structures.set(doc, nodes);
    return nodes;
}

export function getDragPath(doc: Text, lineNo: number): DragNode[] {
    const path: DragNode[] = [];
    let nodes = getDragStructure(doc);
    for (;;) {
        const node = nodes.find(item => item.startLine <= lineNo && lineNo <= item.endLine);
        if (!node) return path;
        path.push(node);
        nodes = node.children;
    }
}

function carryOwner(node: DragNode): DragNode {
    for (let parent = node.parent; parent; parent = parent.parent) {
        if (parent.item && parent.startLine === node.startLine) return parent;
    }
    return node;
}

function sourceNode(doc: Text, path: readonly DragNode[], lineNo: number,
    selection?: { first: number; last: number }): DragNode {
    // 完整选区携带容器；callout 标题始终保留元数据与正文的归属。
    if (selection) {
        const complete = path.find(node => (isDragList(node) || isDragQuote(node))
            && node.startLine === lineNo && node.startLine >= selection.first
            && node.endLine <= selection.last);
        if (complete) return carryOwner(complete);
    }
    const leaf = path[path.length - 1];
    // A continuation is part of its item; moving it must also carry the item's descendants.
    if (leaf.type === "paragraph" || leaf.item) {
        for (let i = path.length - 1; i >= 0; i--) {
            if (isDragQuote(path[i])) break;
            if (path[i].item) return path[i];
        }
    }
    // Quote body rows can leave independently. Visual wraps stay on the same source row.
    if (leaf.type === "paragraph" && leaf.parent && isDragQuote(leaf.parent)) {
        const line = doc.line(lineNo);
        return carryOwner({ ...leaf, from: line.from, to: line.to, startLine: lineNo, endLine: lineNo,
            lines: [leaf.lines[lineNo - leaf.startLine]], children: [] });
    }
    // 普通段落选区只覆盖选中的源行，不扩大到其他正文。
    if (selection && leaf.type === "paragraph") {
        const first = Math.max(leaf.startLine, selection.first), last = Math.min(leaf.endLine, selection.last);
        return { ...leaf, from: doc.line(first).from, to: doc.line(last).to, startLine: first, endLine: last,
            lines: leaf.lines.slice(first - leaf.startLine, last - leaf.startLine + 1), children: [] };
    }
    return carryOwner(leaf);
}

function sharedParent(nodes: readonly DragNode[]): DragNode | null {
    let parent = nodes[0].parent;
    while (parent) {
        const candidate = parent;
        if (nodes.every(node => {
            for (let current: DragNode | null = node.parent; current; current = current.parent) if (current === candidate) return true;
            return false;
        })) return parent;
        parent = parent.parent;
    }
    return null;
}

/** 拖拽与转换共用范围；选区优先并保留完整的结构单元。 */
export function getBlockSource(state: EditorState, lineNo: number): DragSource {
    const doc = state.doc;
    const selection = state.selection.ranges.find(range => !range.empty
        && doc.lineAt(range.from).number <= lineNo && doc.lineAt(range.to - 1).number >= lineNo);
    let nodes: DragNode[];
    if (selection) {
        const first = doc.lineAt(selection.from).number, last = doc.lineAt(selection.to - 1).number;
        nodes = [];
        for (let at = first; at <= last;) {
            const node = sourceNode(doc, getDragPath(doc, at), at, { first, last });
            nodes.push(node);
            at = node.endLine + 1;
        }
    } else nodes = [sourceNode(doc, getDragPath(doc, lineNo), lineNo)];
    const first = Math.min(...nodes.map(node => node.startLine)), last = Math.max(...nodes.map(node => node.endLine));
    const from = doc.line(first).from, to = doc.line(last).to;
    // Use the common scope so a multi-item selection retains markers and nested structure.
    const parent = sharedParent(nodes);
    const scope = parent ? parent.children : getDragStructure(doc);
    const scopeLines = parent ? (isDragQuote(parent) ? parent.lines.slice(parent.type === "callout" ? 1 : 0)
        .map(text => text.replace(/^ {0,3}>[ \t]?/, "")) : parent.item && parent.marker
        ? [parent.marker.content, ...parent.lines.slice(1).map(text => stripIndent(text, parent.marker?.width ?? 0))] : parent.lines) : [];
    let content: string;
    let prefix = nodes.length === 1 ? nodes[0].prefix : parent ? parent.prefix
        + (isDragQuote(parent) ? "> " : parent.item && parent.marker ? " ".repeat(parent.marker.width) : "") : "";
    if (nodes.length === 1) content = nodes[0].lines.join("\n");
    else if (parent && scope.length) {
        const base = parent.startLine + (parent.type === "callout" && !parent.item ? 1 : 0);
        content = scopeLines.slice(first - base, last - base + 1).join("\n");
    } else content = doc.sliceString(from, to);
    // Nested list scopes may use an indent beyond their ancestor's marker width.
    const indent = marker(content.split("\n")[0])?.indent ?? 0;
    if (indent) {
        content = content.split("\n").map(text => stripIndent(text, indent)).join("\n");
        prefix += " ".repeat(indent);
    }
    return { from, to, startLine: first, endLine: last, type: nodes[0].type,
        text: doc.sliceString(from, to), content, prefix, nodes, document: doc };
}

/** 显式选择最近的列表/引用容器及标题，并覆盖依赖同一列表标记的子内容。 */
export function getWholeBlockRange(doc: Text, lineNo: number): BlockRange {
    const path = getDragPath(doc, lineNo);
    return carryOwner([...path].reverse().find(node => isDragList(node) || isDragQuote(node))
        ?? sourceNode(doc, path, lineNo));
}

function listTarget(list: DragNode, item: DragNode, line: number, prefix = list.prefix,
    parentItem: DragNode | null = null): DropTarget {
    const head = item.marker ?? list.marker;
    return { line, mode: "list", prefix: prefix + " ".repeat(parentItem ? 0 : head?.indent ?? 0),
        container: list, item: parentItem, marker: head, depth: columns(prefix.replace(/>/g, " ")) };
}

/** Geometry supplies intent; this resolver never splits an item, fence, table or formula. */
export function getDropTarget(doc: Text, lineNo: number, after: boolean, inside: boolean,
    indent = 0, quoteOnly = false): DropTarget {
    const path = getDragPath(doc, lineNo), root = path[0];
    const outside = (): DropTarget => ({ line: after ? root.endLine + 1 : root.startLine,
        mode: "outside", prefix: "", container: null, item: null, marker: null, depth: 0 });
    if (!inside) return outside();
    const list = [...path].reverse().find(isDragList);
    const quote = [...path].reverse().find(isDragQuote);
    if (list && !quoteOnly && (!quote || path.indexOf(list) > path.indexOf(quote))) {
        const item = list.children.find(node => node.startLine <= lineNo && lineNo <= node.endLine) ?? list.children[0];
        if (indent < 0) {
            for (let parent = list.parent; parent; parent = parent.parent) {
                if (parent.item && parent.parent && isDragList(parent.parent)) {
                    return listTarget(parent.parent, parent, after ? parent.endLine + 1 : parent.startLine);
                }
            }
            if (!quote) return outside();
        } else if (indent > 0 && item.marker) {
            const childList = [...item.children].reverse().find(isDragList);
            if (childList) return listTarget(childList, childList.children[0], childList.endLine + 1,
                childList.prefix + " ".repeat(childList.marker?.indent ?? 0), item);
            const target = listTarget(list, item, item.endLine + 1, list.prefix + " ".repeat(item.marker.width), item);
            if (target.marker?.number !== null && target.marker) target.marker = { ...target.marker, number: 1 };
            return target;
        } else return listTarget(list, item, after ? item.endLine + 1 : item.startLine);
    }
    if (quote) {
        const child = quote.children.find(node => node.startLine <= lineNo && lineNo <= node.endLine);
        const item = child && isDragList(child) ? path.find(node => node.item && node.parent === child) : null;
        const boundary = child?.type === "paragraph" ? { startLine: lineNo, endLine: lineNo } : item ?? child;
        return { line: boundary ? (after ? boundary.endLine + 1 : boundary.startLine) : quote.startLine + 1,
            mode: "quote", prefix: quote.prefix + "> ", container: quote, item: null, marker: null, depth: 0 };
    }
    return outside();
}

function itemText(lines: readonly string[], head: ListMarker, destination: ListMarker): string[] {
    const token = destination.number === null ? destination.token : `${destination.number}${destination.token.slice(-1)}`;
    const check = head.check ?? (destination.check === null ? null : " ");
    const first = token + " " + (check === null ? "" : `[${check}] `) + head.content;
    const width = token.length + 1;
    return [first, ...lines.slice(1).map(text => text.trim() ? " ".repeat(width) + stripIndent(text, head.width) : "")];
}

function adoptList(content: string, destination: ListMarker): string[] {
    const lines = content.split("\n"), doc = Text.of(lines);
    const output: string[] = [];
    for (const node of getDragStructure(doc)) {
        if (isDragList(node)) {
            for (const item of node.children) if (item.marker) output.push(...itemText(item.lines, item.marker, destination));
        } else if (node.lines.some(text => text.trim())) {
            const token = destination.number === null ? destination.token : `${destination.number}${destination.token.slice(-1)}`;
            const prefix = token + " ";
            const check = destination.check === null ? "" : "[ ] ";
            output.push(prefix + check + node.lines[0], ...node.lines.slice(1).map(text => text.trim() ? " ".repeat(prefix.length) + text : ""));
        } else if (output.length) output.push("");
    }
    if (!output.length) {
        const token = destination.number === null ? destination.token : `${destination.number}${destination.token.slice(-1)}`;
        output.push(token + " " + (destination.check === null ? "" : "[ ] "));
    }
    return output;
}

interface MovedLine { text: string; origin: number | null; inserted: boolean }

function allLists(nodes: readonly DragNode[]): DragNode[] {
    return nodes.reduce<DragNode[]>((result, node) => [...result, ...(isDragList(node) ? [node] : []), ...allLists(node.children)], []);
}

function affectedLists(source: DragSource, target: DropTarget): Set<DragNode> {
    const result = new Set<DragNode>();
    for (const node of source.nodes) {
        if (isDragList(node)) result.add(node);
        for (let parent = node.parent; parent; parent = parent.parent) if (isDragList(parent)) result.add(parent);
    }
    if (target.container && isDragList(target.container)) result.add(target.container);
    return result;
}

function renumber(lines: MovedLine[], original: Text, affected: Set<DragNode>, target: DropTarget): void {
    const doc = Text.of(lines.map(line => line.text));
    for (const list of allLists(getDragStructure(doc)).reverse()) {
        if (list.marker?.number === null || list.marker?.number === undefined) continue;
        const itemOrigins = list.children.map(item => lines[item.startLine - 1]);
        const related = [...affected].filter(old => itemOrigins.some(line => line.origin !== null
            && old.children.some(item => item.startLine === line.origin)));
        if (!related.length && !(itemOrigins.some(line => line.inserted) && target.mode === "list"
            && list.prefix + " ".repeat(list.marker.indent) === target.prefix)) continue;
        const existing = itemOrigins.find(line => !line.inserted && line.origin !== null);
        const previous = existing ? allLists(getDragStructure(original)).find(old => old.children.some(item => item.startLine === existing.origin)) : null;
        let number = previous?.marker?.number ?? related[0]?.marker?.number ?? list.marker.number;
        if (target.container && related.includes(target.container)) number = target.container.marker?.number ?? number;
        if (target.item && list.prefix + " ".repeat(list.marker.indent) === target.prefix
            && target.container?.prefix !== target.prefix) number = target.marker?.number ?? number;
        for (const item of list.children) {
            const head = item.marker;
            if (!head || head.number === null) continue;
            const row = lines[item.startLine - 1];
            const oldToken = head.token, newToken = `${number++}${oldToken.slice(-1)}`;
            const raw = row.text.match(/^([ \t]*(?:>[ \t]*)*)(\d+[.)])[ \t]+/);
            if (!raw) continue;
            const at = raw[1].length;
            row.text = row.text.slice(0, at) + newToken + row.text.slice(at + oldToken.length);
            const delta = newToken.length - oldToken.length;
            if (delta) for (let i = item.startLine; i < item.endLine; i++) {
                if (!lines[i].text.trim()) continue;
                const prefix = lines[i].text.match(/^(?:[ \t]*>[ \t]?)+/)?.[0] ?? "";
                const text = lines[i].text.slice(prefix.length);
                lines[i].text = prefix + (delta > 0 ? " ".repeat(delta) + text : stripIndent(text, -delta));
            }
        }
    }
}

export function canDrop(source: DragSource, target: DropTarget): boolean {
    if (target.item && target.item.startLine >= source.startLine && target.item.endLine <= source.endLine) return false;
    if (target.container && target.container.startLine >= source.startLine && target.container.endLine <= source.endLine) return false;
    return target.line <= source.startLine || target.line > source.endLine;
}

/** Produce one atomic document change, including local numbering and container prefixes. */
export function getDropEdit(doc: Text, source: DragSource, target: DropTarget): DropEdit | null {
    if (doc !== source.document || !canDrop(source, target)) return null;
    let content = target.mode === "list" && target.marker ? adoptList(source.content, target.marker) : source.content.split("\n");
    content = content.map(text => target.prefix + text);
    if ((target.line === source.startLine || target.line === source.endLine + 1) && content.join("\n") === source.text) return null;
    const lines: MovedLine[] = Array.from({ length: doc.lines }, (_, i) => ({ text: doc.line(i + 1).text, origin: i + 1, inserted: false }));
    const count = source.endLine - source.startLine + 1;
    lines.splice(source.startLine - 1, count);
    let at = target.line - 1 - (target.line > source.endLine ? count : 0);
    at = Math.max(0, Math.min(at, lines.length));
    const moved = content.map((text, i) => ({ text, origin: source.startLine + i <= source.endLine ? source.startLine + i : null, inserted: true }));
    // Markdown lazy continuations would absorb a paragraph dropped just outside a list/quote.
    if (target.mode === "outside") {
        const previous = lines[at - 1]?.text ?? "";
        const first = content[0] ?? "";
        if (previous.trim() && first.trim() && !/^(?: {0,3}(?:>|#{1,6}\s|`{3,}|~{3,}|[-+*]\s|\d+[.)]\s|\$\$))/.test(first)
            && (/^ {0,3}>/.test(previous) || marker(previous))) moved.unshift({ text: "", origin: null, inserted: false });
        if (/^ {0,3}>/.test(first) && /^ {0,3}>/.test(previous) && !CALLOUT_HEADER.test(first)) moved.unshift({ text: "", origin: null, inserted: false });
        const next = lines[at]?.text ?? "";
        if (content[content.length - 1]?.trim() && next.trim() && /^ {0,3}>/.test(content[content.length - 1])
            && /^ {0,3}>/.test(next) && !CALLOUT_HEADER.test(next)) moved.push({ text: "", origin: null, inserted: false });
    }
    lines.splice(at, 0, ...moved);
    renumber(lines, doc, affectedLists(source, target), target);
    const before = doc.toString(), after = lines.map(line => line.text).join("\n");
    if (before === after) return null;
    let from = 0, oldTo = before.length, newTo = after.length;
    while (from < oldTo && from < newTo && before[from] === after[from]) from++;
    while (oldTo > from && newTo > from && before[oldTo - 1] === after[newTo - 1]) { oldTo--; newTo--; }
    const firstMoved = lines.findIndex(line => line.inserted), lastMoved = lines.length - 1 - [...lines].reverse().findIndex(line => line.inserted);
    const position = (line: number): number => lines.slice(0, line).reduce((sum, item) => sum + item.text.length + 1, 0);
    return { changes: { from, to: oldTo, insert: after.slice(from, newTo) },
        selection: { anchor: position(firstMoved), head: position(lastMoved) + lines[lastMoved].text.length } };
}
