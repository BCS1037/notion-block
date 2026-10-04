import type { Text } from "@codemirror/state";

export type MarkdownBlockType = "paragraph" | "heading" | "bullet" | "numbered" | "todo"
    | "blockquote" | "callout" | "code" | "math" | "divider" | "table"
    | "frontmatter" | "comment" | "embed" | "footnote";

export interface BlockRange {
    from: number;
    to: number;
    startLine: number;
    endLine: number;
    type: MarkdownBlockType;
}

export const CALLOUT_HEADER = /^ {0,3}>[ \t]?\[!([^\]]+)\]([+-]?)(?:[ \t]+(.*))?$/;
const QUOTE_PREFIX = /^ {0,3}>[ \t]?/;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const DIVIDER = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const SETEXT = /^ {0,3}(?:=+|-+)[ \t]*$/;
const cache = new WeakMap<Text, readonly BlockRange[]>();

function indentation(text: string): number {
    return (text.match(/^[ \t]*/)?.[0] ?? "").replace(/\t/g, "    ").length;
}

function listMarker(text: string): { type: "bullet" | "numbered" | "todo"; indent: number } | null {
    const match = text.match(/^([ \t]*)(?:[-+*]|(\d+[.)]))[ \t]+(?:\[([^\]])\](?:[ \t]+|$))?/);
    if (!match) return null;
    return { type: match[3] !== undefined ? "todo" : match[2] ? "numbered" : "bullet", indent: indentation(text) };
}

function isTableDelimiter(text: string): boolean {
    if (!text.includes("|")) return false;
    const cells = text.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
    return cells.length > 0 && cells.every(cell => /^:?-+:?$/.test(cell.trim()));
}

function standaloneType(doc: Text, lineNo: number): MarkdownBlockType {
    const text = doc.line(lineNo).text;
    if (FENCE.test(text) || text.trim() && indentation(text) >= 4) return "code";
    if (/^ {0,3}\$\$/.test(text)) return "math";
    if (/^ {0,3}%%/.test(text)) return "comment";
    if (CALLOUT_HEADER.test(text)) return "callout";
    if (QUOTE_PREFIX.test(text)) return "blockquote";
    if (DIVIDER.test(text)) return "divider";
    const list = listMarker(text);
    if (list) return list.type;
    if (/^ {0,3}#{1,6}(?:[ \t]+|$)/.test(text)) return "heading";
    if (lineNo < doc.lines && text.includes("|") && isTableDelimiter(doc.line(lineNo + 1).text)) return "table";
    if (/^ {0,3}!\s*(?:\[\[.*\]\]|\[.*\]\(.*\))[ \t]*$/.test(text)) return "embed";
    if (/^ {0,3}\[\^[^\]]+\]:/.test(text)) return "footnote";
    return "paragraph";
}

function range(doc: Text, startLine: number, endLine: number, type: MarkdownBlockType): BlockRange {
    return { from: doc.line(startLine).from, to: doc.line(endLine).to, startLine, endLine, type };
}

/** 按 Markdown 容器及块标记分段；围栏、列表子项和带引用前缀的空行归属其容器。 */
export function getBlockRanges(doc: Text): readonly BlockRange[] {
    const cached = cache.get(doc);
    if (cached) return cached;
    const blocks: BlockRange[] = [];
    for (let start = 1; start <= doc.lines;) {
        const first = doc.line(start).text;
        let type = standaloneType(doc, start);
        let end = start;
        const fence = first.match(FENCE);
        if (start === 1 && first === "---") {
            let closing = start + 1;
            while (closing <= doc.lines && !/^(?:---|\.\.\.)[ \t]*$/.test(doc.line(closing).text)) closing++;
            if (closing <= doc.lines) {
                type = "frontmatter";
                end = closing;
            }
        } else if (fence) {
            while (end < doc.lines) {
                end++;
                const close = doc.line(end).text.match(FENCE);
                if (close && close[1][0] === fence[1][0] && close[1].length >= fence[1].length && !close[2].trim()) break;
            }
        } else if (type === "math") {
            if (!first.trim().slice(2).includes("$$")) {
                while (end < doc.lines) {
                    end++;
                    if (/\$\$[ \t]*$/.test(doc.line(end).text)) break;
                }
            }
        } else if (type === "comment") {
            if (!first.slice(first.indexOf("%%") + 2).includes("%%")) {
                while (end < doc.lines) {
                    end++;
                    if (doc.line(end).text.includes("%%")) break;
                }
            }
        } else if (type === "callout" || type === "blockquote") {
            while (end < doc.lines && QUOTE_PREFIX.test(doc.line(end + 1).text) && !CALLOUT_HEADER.test(doc.line(end + 1).text)) end++;
        } else if (type === "bullet" || type === "numbered" || type === "todo" || type === "footnote") {
            const baseIndent = indentation(first);
            while (end < doc.lines) {
                const next = doc.line(end + 1).text;
                const marker = listMarker(next);
                if (next.trim() && (indentation(next) > baseIndent || marker?.indent === baseIndent && marker.type === type)) {
                    end++;
                } else if (!next.trim()) {
                    let following = end + 2;
                    while (following <= doc.lines && !doc.line(following).text.trim()) following++;
                    if (following > doc.lines || indentation(doc.line(following).text) <= baseIndent) break;
                    end = following;
                } else break;
            }
        } else if (type === "table") {
            end++;
            while (end < doc.lines && doc.line(end + 1).text.includes("|") && standaloneType(doc, end + 1) === "paragraph") end++;
        } else if (type === "code") {
            while (end < doc.lines) {
                let next = end + 1;
                while (next <= doc.lines && !doc.line(next).text.trim()) next++;
                if (next > doc.lines || indentation(doc.line(next).text) < 4) break;
                end = next;
            }
        } else if (type === "paragraph" && first.trim()) {
            while (end < doc.lines) {
                const next = doc.line(end + 1).text;
                if (SETEXT.test(next)) {
                    end++;
                    type = "heading";
                    break;
                }
                if (!next.trim() || standaloneType(doc, end + 1) !== "paragraph") break;
                end++;
            }
        }
        blocks.push(range(doc, start, end, type));
        start = end + 1;
    }
    cache.set(doc, blocks);
    return blocks;
}

export function getBlockRange(doc: Text, lineNo: number): BlockRange {
    return getBlockRanges(doc).find(block => block.startLine <= lineNo && block.endLine >= lineNo)
        ?? range(doc, lineNo, lineNo, "paragraph");
}
