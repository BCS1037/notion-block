import { EditorView } from "@codemirror/view";
import { Text } from "@codemirror/state";
import { moment, Notice } from "obsidian";
import type { TFile } from "obsidian";
import NotionBlock from "./main";
import { t } from "./locale/helpers";
import { CALLOUT_HEADER, getBlockRanges } from "./blockRange";
import { getBlockSource, getDragStructure, getWholeBlockRange, isDragList } from "./blockDrag";
import { getBlockIds } from "./blockTransfer";

const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"]);

export function detectBlockType(lineText: string): string {
    if (/^#{1,6} /.test(lineText)) return "heading";
    if (/^[-*+] \[[ x]\] /.test(lineText)) return "todo";
    if (/^[-*+] /.test(lineText)) return "bullet";
    if (/^\d+\. /.test(lineText)) return "numbered";
    if (/^> \[!/.test(lineText)) return "callout";
    if (/^> /.test(lineText)) return "blockquote";
    if (/^%%/.test(lineText)) return "comment";
    return "paragraph";
}

export function stripPrefix(lineText: string): string {
    const callout = lineText.match(CALLOUT_HEADER);
    if (callout) return callout[3] ?? "";
    const comment = lineText.match(/^%%(.*)%%$/);
    if (comment) return comment[1];
    return lineText.replace(/^([ \t]*)(?:#{1,6}(?:[ \t]+|$)|[-*+][ \t]+(?:\[[^\]]\](?:[ \t]+|$))?|\d+[.)][ \t]+|>[ \t]?)/, "$1");
}

export async function insertImageFiles(plugin: NotionBlock, view: EditorView, lineNo: number, files: File[]): Promise<void> {
    const imageFiles = files.filter(isImageFile);
    if (imageFiles.length === 0) {
        new Notice(t("notice.selectImage"));
        return;
    }

    try {
        const sourcePath = plugin.app.workspace.getActiveFile()?.path ?? "";
        const links: string[] = [];

        for (const file of imageFiles) {
            const safeName = sanitizeAttachmentName(file.name);
            const targetPath = await plugin.app.fileManager.getAvailablePathForAttachment(safeName, sourcePath);
            const savedFile = await plugin.app.vault.createBinary(targetPath, await file.arrayBuffer());
            links.push(toEmbedLink(plugin, savedFile, sourcePath));
        }

        insertTextAtLineEnd(view, lineNo, links.join("\n"), true);
    } catch {
        new Notice(t("notice.insertImageFailed"));
    }
}

function insertTextAtLineEnd(view: EditorView, lineNo: number, insertText: string, insertAsBlock: boolean): void {
    const line = view.state.doc.line(lineNo);
    const needsNewLine = insertAsBlock && line.text.trim().length > 0;
    const prefix = needsNewLine ? "\n" : "";
    const pos = line.to;

    view.dispatch({
        changes: {
            from: pos,
            insert: prefix + insertText
        },
        selection: { anchor: pos + prefix.length + insertText.length },
        scrollIntoView: true,
        userEvent: "insert.block"
    });
}

function isImageFile(file: File): boolean {
    const ext = getFileExtension(file.name);
    return IMAGE_EXTENSIONS.has(ext);
}

function sanitizeAttachmentName(name: string): string {
    return name.replace(/[\\/\r\n\t]/g, "-").trim() || "image.png";
}

function getFileExtension(name: string): string {
    const index = name.lastIndexOf(".");
    if (index < 0) return "";
    return name.slice(index + 1).toLowerCase();
}

function toEmbedLink(plugin: NotionBlock, file: TFile, sourcePath: string): string {
    return `!${plugin.app.fileManager.generateMarkdownLink(file, sourcePath)}`;
}

interface ContentLine {
    text: string;
    preservePrefix: boolean;
}

function reindentContinuation(text: string, oldWidth: number, newWidth: number): string {
    if (!text.trim()) return text;
    let at = 0, width = 0;
    while (at < text.length && width < oldWidth && /[ \t]/.test(text[at])) {
        width += text[at] === "\t" ? 4 - width % 4 : 1;
        at++;
    }
    return " ".repeat(newWidth + Math.max(0, width - oldWidth)) + text.slice(at);
}

function transformContent(doc: Text, unwrapFences: boolean): ContentLine[] {
    const result: ContentLine[] = [];
    for (const block of getBlockRanges(doc)) {
        const start = block.startLine, end = block.endLine;
        const lines = Array.from({ length: end - start + 1 }, (_, i) => doc.line(start + i).text);
        const preservePrefix = !["bullet", "numbered", "todo", "heading"].includes(block.type);
        if (block.type === "callout" || block.type === "blockquote") {
            for (const line of lines) {
                const header = line.match(CALLOUT_HEADER);
                if (header) {
                    if (header[3]) result.push({ text: header[3], preservePrefix: true });
                } else result.push({ text: line.replace(/^ {0,3}>[ \t]?/, ""), preservePrefix: true });
            }
        } else if (unwrapFences && start === block.startLine && end === block.endLine) {
            const openingFence = block.type === "code" ? lines[0].match(/^ {0,3}(`{3,}|~{3,})/) : null;
            if (openingFence) {
                lines.shift();
                const closingFence = (lines[lines.length - 1] ?? "").match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
                if (closingFence && closingFence[1][0] === openingFence[1][0]
                    && closingFence[1].length >= openingFence[1].length) lines.pop();
            } else if (block.type === "code") {
                for (let i = 0; i < lines.length; i++) lines[i] = lines[i].replace(/^(?: {4}| {0,3}\t)/, "");
            } else if (block.type === "math") {
                lines[0] = lines[0].replace(/^ {0,3}\$\$[ \t]*/, "");
                const last = lines.length - 1;
                lines[last] = lines[last].replace(/[ \t]*\$\$[ \t]*$/, "");
                if (lines.length > 1 && !lines[0]) lines.shift();
                if (lines.length > 1 && !lines[lines.length - 1]) lines.pop();
            } else if (block.type === "comment") {
                lines[0] = lines[0].replace(/^ {0,3}%%[ \t]?/, "");
                const last = lines.length - 1;
                lines[last] = lines[last].replace(/[ \t]?%%[ \t]*$/, "");
                if (lines.length > 1 && !lines[0]) lines.shift();
                if (lines.length > 1 && !lines[lines.length - 1]) lines.pop();
            } else if (block.type === "heading" && lines.length > 1) lines.pop();
            result.push(...lines.map(text => ({ text, preservePrefix })));
        } else result.push(...lines.map(text => ({ text, preservePrefix })));
    }
    return result.length ? result : [{ text: "", preservePrefix: true }];
}

export function transformLine(view: EditorView, lineNo: number, targetType: string): void {
    const selected = getBlockSource(view.state, lineNo);
    const selectedContent: unknown = selected.content;
    if (typeof selectedContent !== "string") return;
    let original = selectedContent;
    const anchored = getBlockIds(original);
    const listTarget = ["bullet", "numbered", "todo", "toggle"].includes(targetType);
    if (anchored.length && (["comment", "divider"].includes(targetType) || anchored.length > 1 && !listTarget)) {
        new Notice(t("transfer.anchorTransform")); return;
    }
    let anchor: string | null = null;
    const separate = selected.nodes.length === 1 ? original.match(/\n[ \t\n]*\^([A-Za-z0-9-]+)[ \t]*$/) : null;
    if (separate) { anchor = separate[1]; original = original.slice(0, separate.index); }
    else if (selected.nodes.length === 1) {
        const node = selected.nodes[0];
        const item = node.item || isDragList(node) && node.children.length === 1;
        const lines = original.split("\n"), at = item ? 0 : lines.length - 1;
        const selectedType: unknown = selected.type;
        if (item || selectedType === "paragraph" || selectedType === "heading" || selectedType === "embed") {
            const sourceLine = lines[at];
            if (typeof sourceLine !== "string") return;
            const inline = /[ \t]+\^([A-Za-z0-9-]+)[ \t]*$/.exec(sourceLine);
            if (inline) {
                const blockId = inline[1];
                if (typeof blockId !== "string") return;
                anchor = blockId;
                lines[at] = sourceLine.slice(0, inline.index);
                original = lines.join("\n");
            }
        }
    }
    if (anchored.length && !anchor && (targetType.startsWith("callout-")
        || ["blockquote", "code", "math"].includes(targetType))) {
        new Notice(t("transfer.anchorTransform")); return;
    }
    const contentDoc = Text.of(original.split("\n"));
    const block = getBlockRanges(contentDoc).find(block => block.from === 0 && block.to === contentDoc.length);
    if (block?.type === targetType && (targetType === "math" || targetType === "comment"
        || targetType === "code" && /^ {0,3}(?:`{3,}|~{3,})/.test(original))) return;
    const callout = targetType.startsWith("callout-") ? targetType.slice(8) : null;
    const wrap = callout !== null || targetType === "blockquote";
    const contentLines = transformContent(contentDoc, !wrap);
    const lines = contentLines.map(line => line.text);
    let newText: string;
    if (callout !== null) {
        // 仅换 callout 类型时保留折叠状态、标题、正文及嵌套 Markdown。
        const header = original.split("\n")[0].match(CALLOUT_HEADER);
        if (header && block?.type === "callout") {
            const sourceLines = original.split("\n");
            sourceLines[0] = `> [!${callout}]${header[2]}${header[3] !== undefined ? ` ${header[3]}` : ""}`;
            newText = sourceLines.join("\n");
        } else newText = `> [!${callout}]\n` + lines.map(line => line ? `> ${line}` : ">").join("\n");
    } else if (targetType === "blockquote") {
        newText = lines.map(line => line ? `> ${line}` : ">").join("\n");
    } else if (targetType === "code") {
        const content = lines.join("\n");
        const runs = content.match(/`{3,}/g) ?? [];
        const fence = "`".repeat(Math.max(3, ...runs.map(run => run.length + 1)));
        newText = `${fence}\n${content}\n${fence}`;
    } else if (targetType === "math") {
        newText = `$$\n${lines.join("\n")}\n$$`;
    } else if (targetType === "comment") {
        newText = `%%\n${lines.join("\n")}\n%%`;
    } else if (targetType === "divider") {
        newText = "---";
    } else {
        let number = 0;
        const convertLine = ({ text: line, preservePrefix }: ContentLine): string => {
            const content = preservePrefix ? line : stripPrefix(line);
            const indent = content.match(/^[ \t]*/)?.[0] ?? "";
            const body = content.slice(indent.length);
            if (!body && contentLines.length > 1) return content;
            switch (targetType) {
                case "h1": return `${indent}# ${body}`;
                case "h2": return `${indent}## ${body}`;
                case "h3": return `${indent}### ${body}`;
                case "bullet":
                case "toggle": return `${indent}- ${body}`;
                case "numbered": return `${indent}${++number}. ${body}`;
                case "todo": {
                    const status = line.match(/^[ \t]*[-*+][ \t]+\[([^\]])\]/)?.[1] ?? " ";
                    return `${indent}- [${status}] ${body}`;
                }
                default: return content;
            }
        };
        const convertedLines: string[] = [];
        for (const node of getDragStructure(contentDoc)) {
            if (!isDragList(node)) {
                for (const line of transformContent(Text.of(node.lines), true)) convertedLines.push(convertLine(line));
                continue;
            }
            for (const item of node.children) {
                const first = convertLine({ text: item.lines[0], preservePrefix: false });
                const head = first.match(/^([ \t]*(?:[-+*]|\d+[.)])[ \t]+)/)?.[1] ?? "";
                const width = head.replace(/\t/g, "    ").length;
                // 只改当前项标记；子列表和字面量块保留原有语法。
                convertedLines.push(first);
                for (const line of item.lines.slice(1)) {
                    convertedLines.push(reindentContinuation(line, item.marker?.width ?? 0, width));
                }
            }
        }
        newText = convertedLines.join("\n");
    }
    if (anchor) {
        const output = Text.of(newText.split("\n")), first = getBlockRanges(output).find(range => output.sliceString(range.from, range.to).trim());
        if (first) {
            const item = selected.nodes[0]?.item && listTarget;
            const simple = item || first.type === "paragraph" || first.type === "heading" && /^ {0,3}#{1,6}[ \t]/.test(output.line(first.startLine).text);
            const at = item ? output.line(first.startLine).to : output.line(first.endLine).to;
            const tail = newText.slice(at);
            newText = newText.slice(0, at) + (simple ? ` ^${anchor}` : `\n\n^${anchor}` + (tail && !tail.startsWith("\n\n") ? "\n" : "")) + tail;
        }
    }
    newText = newText.split("\n").map(line => selected.prefix + line).join("\n");
    if (newText === selected.text) return;
    view.dispatch({
        changes: { from: selected.from, to: selected.to, insert: newText },
        selection: { anchor: selected.from, head: selected.from + newText.length },
        scrollIntoView: true,
        userEvent: "transform.block"
    });
}

export function selectWholeBlock(view: EditorView, lineNo: number): void {
    const block = getWholeBlockRange(view.state.doc, lineNo);
    view.dispatch({ selection: { anchor: block.from, head: block.to }, scrollIntoView: true, userEvent: "select.block" });
}

export function insertBlock(plugin: NotionBlock, view: EditorView, lineNo: number, targetType: string) {
    const line = view.state.doc.line(lineNo);
    const settings = plugin.settings;
    
    let insertText = "";
    let cursorOffset = 0;
    let isMetadata = false;
    let customPos: number | null = null;

    if (targetType.startsWith("callout-")) {
        const type = targetType.replace("callout-", "");
        insertText = `> [!${type}]\n> `;
        cursorOffset = insertText.length;
    } else {
        switch (targetType) {
            case "h1": insertText = "# "; break;
            case "h2": insertText = "## "; break;
            case "h3": insertText = "### "; break;
            case "todo": insertText = "- [ ] "; break;
            case "toggle":
            case "bullet": insertText = "- "; break;
            case "numbered": insertText = "1. "; break;
            case "blockquote": insertText = "> "; break;
            case "paragraph": insertText = ""; break;
            case "code": insertText = "```\n\n```"; cursorOffset = 4; break;
            case "math": insertText = "$$\n\n$$"; cursorOffset = 3; break;
            case "divider": insertText = "---\n"; break;
            
            // Advanced types
            case "link": insertText = "[[]]"; cursorOffset = 2; break;
            case "ext-link": insertText = "[]()"; cursorOffset = 1; break;
            case "embed": insertText = "![[]]"; cursorOffset = 3; break;
            case "tag": insertText = "#"; cursorOffset = 1; break;
            case "comment": insertText = "%%  %%"; cursorOffset = 3; break;
            case "today": insertText = moment().format(settings.dateFormat); break;
            case "yesterday": insertText = moment().subtract(1, 'days').format(settings.dateFormat); break;
            case "tomorrow": insertText = moment().add(1, 'days').format(settings.dateFormat); break;
            case "time": insertText = moment().format(settings.timeFormat); break;
            case "table": {
                const col1 = `${t("table.column")} 1`;
                const col2 = `${t("table.column")} 2`;
                const col3 = `${t("table.column")} 3`;
                insertText = `| ${col1} | ${col2} | ${col3} |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |`;
                cursorOffset = 7 + col1.length + col2.length;
                break;
            }
            case "frontmatter": {
                isMetadata = true;
                const firstLine = view.state.doc.line(1);
                if (firstLine.text === "---") {
                    // Already exists
                    return;
                }
                insertText = "---\n\n---\n";
                customPos = 0;
                cursorOffset = 4;
                break;
            }
            case "footnote": {
                const footnoteId = Math.floor(Math.random() * 1000);
                insertText = `[^${footnoteId}]`;
                const docEnd = view.state.doc.length;
                view.dispatch({
                    changes: { from: docEnd, insert: `\n\n[^${footnoteId}]: ` }
                });
                break;
            }
            default: insertText = ""; break;
        }
    }

    const pos = customPos !== null ? customPos : line.to;
    const isNewLine = !isMetadata && !["link", "ext-link", "embed", "tag", "comment", "today", "yesterday", "tomorrow", "time"].includes(targetType);

    // Only insert newline if current line is not empty
    const needsNewLine = isNewLine && line.text.trim().length > 0;

    view.dispatch({
        changes: {
            from: pos,
            insert: (needsNewLine ? "\n" : "") + insertText
        },
        selection: { anchor: (customPos !== null ? 0 : pos) + (needsNewLine ? 1 : 0) + (cursorOffset || insertText.length) },
        scrollIntoView: true,
        userEvent: "insert.block"
    });
}
