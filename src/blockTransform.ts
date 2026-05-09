import { EditorView } from "@codemirror/view";
import { moment } from "obsidian";
import NotionBlock from "./main";

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
        .replace(/^> \[!\w+\]\n?> ?/, "")
        .replace(/^> /, "")
        .replace(/^%%(.*)%%$/, "$1")
        .trim();
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
            case "bullet": newText = "- " + content; break;
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
            case "bullet": insertText = "- "; break;
            case "numbered": insertText = "1. "; break;
            case "todo": insertText = "- [ ] "; break;
            case "blockquote": insertText = "> "; break;
            case "paragraph": insertText = ""; break;
            case "code": insertText = "```\n\n```"; cursorOffset = 4; break;
            case "math": insertText = "$$\n\n$$"; cursorOffset = 3; break;
            case "divider": insertText = "---\n"; break;
            
            // Step 7: Advanced types
            case "link": insertText = "[[]]"; cursorOffset = 2; break;
            case "ext-link": insertText = "[]()"; cursorOffset = 1; break;
            case "embed": insertText = "![[]]"; cursorOffset = 3; break;
            case "tag": insertText = "#"; cursorOffset = 1; break;
            case "comment": insertText = "%%  %%"; cursorOffset = 3; break;
            case "today": insertText = moment().format(settings.dateFormat); break;
            case "yesterday": insertText = moment().subtract(1, 'days').format(settings.dateFormat); break;
            case "tomorrow": insertText = moment().add(1, 'days').format(settings.dateFormat); break;
            case "time": insertText = moment().format(settings.timeFormat); break;
            case "table": 
                insertText = "| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |";
                cursorOffset = 23; // End of first cell
                break;
            case "frontmatter":
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
            case "footnote":
                const footnoteId = Math.floor(Math.random() * 1000);
                insertText = `[^${footnoteId}]`;
                const docEnd = view.state.doc.length;
                view.dispatch({
                    changes: { from: docEnd, insert: `\n\n[^${footnoteId}]: ` }
                });
                break;
            default: insertText = ""; break;
        }
    }

    const pos = customPos !== null ? customPos : line.to;
    const isNewLine = !isMetadata && !["link", "ext-link", "embed", "tag", "comment", "today", "yesterday", "tomorrow", "time"].includes(targetType);

    view.dispatch({
        changes: {
            from: pos,
            insert: (isNewLine && pos !== 0 ? "\n" : "") + insertText
        },
        selection: { anchor: (customPos !== null ? 0 : pos) + (isNewLine && pos !== 0 ? 1 : 0) + (cursorOffset || insertText.length) },
        scrollIntoView: true,
        userEvent: "insert.block"
    });
}
