import { ChangeSet, Text } from "@codemirror/state";
import { getDragPath, getInsertEdit, getRemoveEdit, isDragQuote } from "./blockDrag";
import type { DragNode, DragSource, DropTarget } from "./blockDrag";
import { STANDALONE_BLOCK_ID, getBlockRanges } from "./blockRange";

export type TransferMode = "move" | "copy" | "link" | "embed";
export class TransferError extends Error {}
interface IdPosition { id: string; from: number; to: number }
interface Edit { from: number; to: number; insert: string }
export interface ReferencePlan { after: string; ids: string[]; expanded: boolean }
export interface TransferPlan {
    sourceAfter: string;
    targetAfter: string;
    targetSelection: { anchor: number; head: number };
    expanded: boolean;
}
export interface TransferOptions {
    newId: () => string;
    blockLink: (id: string) => string;
    rewriteLinks: (text: string, ids: ReadonlyMap<string, string>) => string;
}

/** Visit Markdown content without rewriting literal code, math, comments or YAML. */
function mapLiveLines(text: string, rewrite: (line: string, offset: number) => string): string {
    const doc = Text.of(text.split("\n"));
    const first = /^---[ \t]*\n/.test(text) ? getBlockRanges(doc)[0] : null;
    const yamlEnd = first?.type === "frontmatter" ? first.endLine : 0;
    let offset = 0, number = 0, fence: string | null = null, math = false, comment = false;
    return text.split("\n").map(line => {
        number++;
        const body = line.replace(/^ {0,3}(?:>[ \t]*)+/, "");
        const indentation = body.match(/^[ \t]*/)?.[0].replace(/\t/g, "    ").length ?? 0;
        const syntax = indentation < 4 || getDragPath(doc, number).slice(-1)[0]?.type !== "code";
        const literal = body.trimStart().replace(/^(?:[-+*]|\d+[.)])[ \t]+(?:\[[^\]]\][ \t]+)?/, "");
        const match = literal.match(/^(`{3,}|~{3,})/);
        let live = false;
        if (number <= yamlEnd) { /* Skip the complete frontmatter range. */ }
        else if (fence) { if (match && match[1][0] === fence[0] && match[1].length >= fence.length) fence = null; }
        else if (math) { if (/\$\$[ \t]*$/.test(literal)) math = false; }
        else if (comment) { if ((literal.match(/%%/g)?.length ?? 0) % 2) comment = false; }
        else if (match && syntax) fence = match[1];
        else if (syntax && literal.startsWith("$$")) math = !/^\$\$.*\$\$[ \t]*$/.test(literal);
        else if (syntax && (literal.match(/%%/g)?.length ?? 0) % 2) comment = true;
        else if (syntax && !literal.startsWith("%%")) live = true;
        const result = live ? rewrite(line, offset) : line;
        offset += line.length + 1;
        return result;
    }).join("\n");
}

function idPositions(text: string): IdPosition[] {
    const ids: IdPosition[] = [];
    mapLiveLines(text, (line, offset) => {
        const anchor = line.match(/(?:^|\s)\^([A-Za-z0-9-]+)[ \t]*$/);
        if (anchor) {
            const at = line.lastIndexOf("^" + anchor[1]);
            ids.push({ id: anchor[1], from: offset + at + 1, to: offset + at + 1 + anchor[1].length });
        }
        return line;
    });
    return ids;
}

export function getBlockIds(text: string): string[] { return idPositions(text).map(item => item.id); }

function freshId(used: Set<string>, generate: () => string): string {
    for (let attempt = 0; attempt < 100; attempt++) {
        const id = generate();
        if (/^[A-Za-z0-9-]+$/.test(id) && !used.has(id)) { used.add(id); return id; }
    }
    throw new TransferError("idConflict");
}

function applyEdits(text: string, edits: Edit[]): string {
    for (const edit of edits.sort((a, b) => b.from - a.from)) text = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
    return text;
}

function nativeNode(source: DragSource, node: DragNode): DragNode {
    const path = getDragPath(source.document, node.startLine);
    const quote = path.find(isDragQuote);
    if (quote) return quote;
    if (!node.item && ["bullet", "numbered", "todo"].includes(node.type)) return node;
    return [...path].reverse().find(item => item.item) ?? path[path.length - 1];
}

export function createReferencePlan(source: DragSource, generate: () => string): ReferencePlan {
    const doc = source.document, before = doc.toString(), existing = getBlockIds(before), used = new Set(existing);
    const seen = new Set<string>(), ids: string[] = [], edits: Edit[] = [];
    let expanded = false;
    for (const selected of source.nodes) {
        if (!selected.lines.some(line => line.trim())) continue;
        const node = nativeNode(source, selected);
        if (!node || ["frontmatter", "comment", "divider", "footnote"].includes(node.type) || !node.lines.some(line => line.trim())) throw new TransferError("unsupportedReference");
        const key = `${node.from}:${node.to}`;
        if (seen.has(key)) continue;
        seen.add(key);
        expanded ||= node.from < source.from || node.to > source.to;
        const last = doc.line(node.endLine), first = doc.line(node.startLine);
        const standalone = last.text.match(STANDALONE_BLOCK_ID);
        const inline = (node.item ? first.text : last.text).match(/\s\^([A-Za-z0-9-]+)[ \t]*$/);
        const simple = node.item || ["paragraph", "embed"].includes(node.type)
            || node.type === "heading" && /^ {0,3}#{1,6}[ \t]/.test(first.text);
        const id = standalone?.[1] ?? (simple ? inline?.[1] : undefined);
        if (id) {
            if (existing.filter(value => value === id).length !== 1) throw new TransferError("idConflict");
            ids.push(id);
        } else {
            const next = freshId(used, generate);
            const at = node.item ? first.to : last.to;
            const followingBlank = node.endLine < doc.lines && !doc.line(node.endLine + 1).text.trim();
            const insert = simple ? ` ^${next}` : `\n\n^${next}` + (followingBlank || node.endLine === doc.lines ? "" : "\n");
            edits.push({ from: at, to: at, insert });
            ids.push(next);
        }
    }
    if (!ids.length) throw new TransferError("unsupportedReference");
    return { after: applyEdits(before, edits), ids, expanded };
}

export function createTransferPlan(source: DragSource, targetDoc: Text, target: DropTarget, mode: TransferMode, options: TransferOptions): TransferPlan {
    let sourceAfter = source.document.toString(), content = source.content, expanded = false;
    const ids = new Map<string, string>();
    if (mode === "link" || mode === "embed") {
        const references = createReferencePlan(source, options.newId);
        sourceAfter = references.after;
        expanded = references.expanded;
        content = references.ids.map(id => (mode === "embed" ? "!" : "") + options.blockLink(id)).join("\n");
    } else {
        const positions = idPositions(content), used = new Set(getBlockIds(targetDoc.toString()));
        if (target.mode !== "outside" && content.split("\n").some(line => STANDALONE_BLOCK_ID.test(line))) throw new TransferError("anchorContainer");
        for (const item of positions) {
            if (ids.has(item.id) || mode === "move" && used.has(item.id)) throw new TransferError("idConflict");
            ids.set(item.id, mode === "copy" ? freshId(used, options.newId) : item.id);
        }
        if (mode === "copy") content = applyEdits(content, positions.map(item => ({ ...item, insert: ids.get(item.id) ?? item.id })));
        content = options.rewriteLinks(content, ids);
        if (mode === "move") {
            const removal = getRemoveEdit(source.document, source);
            if (!removal) throw new TransferError("changed");
            sourceAfter = ChangeSet.of(removal.changes, source.document.length).apply(source.document).toString();
        }
    }
    const insertion = getInsertEdit(targetDoc, content, target);
    if (!insertion) throw new TransferError("changed");
    const targetAfter = ChangeSet.of(insertion.changes, targetDoc.length).apply(targetDoc).toString();
    return { sourceAfter, targetAfter, targetSelection: insertion.selection, expanded };
}

export interface LinkDestination { path: string; subpath: string }
export type ResolveLink = (path: string, subpath: string, markdown: boolean) => LinkDestination | null;

function relativePath(from: string, to: string): string {
    const parent = from.split("/").slice(0, -1), path = to.split("/");
    while (parent.length && path.length && parent[0] === path[0]) { parent.shift(); path.shift(); }
    return [...parent.map(() => ".."), ...path].join("/");
}

function splitLink(text: string): [string, string] {
    const at = text.indexOf("#");
    return at < 0 ? [text, ""] : [text.slice(0, at), text.slice(at)];
}

/** Rebase live wikilinks and Markdown links, leaving fenced/inline code untouched. */
export function rewriteContentLinks(text: string, destinationPath: string, resolve: ResolveLink, wikiPath: (path: string) => string): string {
    const rewrite = (segment: string): string => segment.replace(/(!?\[\[([^\]\n]+)\]\])|(!?\[([^\]\n]*)\]\((<[^>\n]*>|(?:\\.|[^\\()\s]|\([^()\n]*\))+)([ \t]+(?:"[^"\n]*"|'[^'\n]*'))?\))/g,
        (whole: string, wiki: string | undefined, body: string | undefined, markdown: string | undefined, label: string | undefined, url: string | undefined, title: string | undefined) => {
            if (wiki && body) {
                const separator = body.indexOf("|"), caption = separator < 0 ? "" : body.slice(separator);
                const [path, subpath] = splitLink(separator < 0 ? body : body.slice(0, separator));
                const file = resolve(path, subpath, false);
                return file ? `${wiki.startsWith("!") ? "!" : ""}[[${wikiPath(file.path)}${file.subpath}${caption}]]` : whole;
            }
            if (!markdown || !url) return whole;
            let decoded: string;
            try { decoded = decodeURIComponent(url.replace(/^<|>$/g, "").replace(/\\([()])/g, "$1")); } catch { return whole; }
            if (/^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)/.test(decoded)) return whole;
            const [path, subpath] = splitLink(decoded), file = resolve(path, subpath, true);
            if (!file) return whole;
            const fragment = file.subpath ? "#" + encodeURIComponent(file.subpath.slice(1)).replace(/%5E/g, "^") : "";
            const target = relativePath(destinationPath, file.path).split("/").map(part => encodeURIComponent(part)).join("/") + fragment;
            return `${markdown.startsWith("!") ? "!" : ""}[${label ?? ""}](${target}${title ?? ""})`;
        });
    return mapLiveLines(text, line => line.split(/(`+[^`]*`+)/).map(part => part.startsWith("`") ? part : rewrite(part)).join(""));
}

export function textChange(before: Text, after: string): { from: number; to: number; insert: string } {
    const old = before.toString();
    let from = 0, to = old.length, end = after.length;
    while (from < to && from < end && old[from] === after[from]) from++;
    while (to > from && end > from && old[to - 1] === after[end - 1]) { to--; end--; }
    return { from, to, insert: after.slice(from, end) };
}
