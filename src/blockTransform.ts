import { EditorView } from "@codemirror/view";
import { moment, Notice } from "obsidian";
import type { TFile } from "obsidian";
import NotionBlock from "./main";
import { t } from "./locale/helpers";

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
    return lineText
        .replace(/^#{1,6} /, "")
        .replace(/^[-*+] \[[ x]\] /, "")
        .replace(/^[-*+] /, "")
        .replace(/^\d+\. /, "")
        .replace(/^> \[![^\]]+\][+-]?\n?> ?/, "")
        .replace(/^> /, "")
        .replace(/^%%(.*)%%$/, "$1")
        .trim();
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

export function transformLine(view: EditorView, lineNo: number, targetType: string) {
    const line = view.state.doc.line(lineNo);
    const lineText = line.text;
    const content = stripPrefix(lineText);
    
    let newText = "";
    
    if (targetType.startsWith("callout-")) {
        const type = targetType.replace("callout-", "");
        newText = `> [!${type}]\n> ${content}`;
    } else {
        switch (targetType) {
            case "h1": newText = "# " + content; break;
            case "h2": newText = "## " + content; break;
            case "h3": newText = "### " + content; break;
            case "bullet": 
            case "toggle": newText = "- " + content; break;
            case "numbered": newText = "1. " + content; break;
            case "todo": newText = "- [ ] " + content; break;
            case "blockquote": newText = "> " + content; break;
            case "paragraph": newText = content; break;
            case "code": newText = "```\n" + content + "\n```"; break;
            case "math": newText = "$$\n" + content + "\n$$"; break;
            case "divider": newText = "---"; break;
            default: newText = content; break;
        }
    }
    
    view.dispatch({
        changes: {
            from: line.from,
            to: line.to,
            insert: newText
        }
    });
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
