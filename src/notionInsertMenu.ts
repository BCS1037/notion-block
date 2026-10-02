import { Component } from "obsidian";
import { EditorView } from "@codemirror/view";
import NotionBlock from "./main";
import { insertBlock, insertImageFiles } from "./blockTransform";
import { t } from "./locale/helpers";
import { MENU_COMMANDS } from "./menuLayout";

// TypeScript 4.7 的 DOM 声明尚未包含文件选择器 cancel 事件。
declare global {
    interface HTMLElementEventMap {
        cancel: Event;
    }
}

export interface InsertMenuItem {
    id: string;
    label: string;
    icon: string;
    page?: "callout";
    action?: () => boolean | void;
}

interface CalloutOption {
    type: string;
    label: string;
}

const CALLOUT_OPTIONS: CalloutOption[] = [
    { type: "note", label: "note" },
    { type: "info", label: "info" },
    { type: "todo", label: "todo" },
    { type: "tip", label: "tip" },
    { type: "success", label: "success" },
    { type: "question", label: "question" },
    { type: "warning", label: "warning" },
    { type: "failure", label: "failure" },
    { type: "danger", label: "danger" },
    { type: "bug", label: "bug" },
    { type: "example", label: "example" },
    { type: "quote", label: "quote" },
];

const CALLOUT_ICONS: Record<string, string> = {
    note: "pencil",
    abstract: "clipboard-list",
    summary: "clipboard-list",
    tldr: "clipboard-list",
    info: "info",
    todo: "check-circle",
    tip: "flame",
    hint: "flame",
    important: "flame",
    success: "check",
    check: "check",
    done: "check",
    question: "help-circle",
    help: "help-circle",
    faq: "help-circle",
    warning: "alert-triangle",
    caution: "alert-triangle",
    attention: "alert-triangle",
    failure: "x-circle",
    fail: "x-circle",
    missing: "x-circle",
    danger: "zap",
    error: "zap",
    bug: "bug",
    example: "list",
    quote: "quote",
    cite: "quote",
};

// 插入行为与块菜单共用一个弹窗，独立 + 按钮也使用此入口。
export class NotionBlockInsertActions extends Component {
    private imageInput: HTMLInputElement | null = null;
    private readonly ownerDocument: Document;

    constructor(
        private readonly plugin: NotionBlock,
        private readonly view: EditorView,
        private readonly lineNo: number,
        private readonly closeMenu: () => void
    ) {
        super();
        this.ownerDocument = view.dom.ownerDocument;
    }

    getItems(): InsertMenuItem[] {
        return MENU_COMMANDS.insert.map(command => ({
            id: command.id,
            label: t(command.labelKey),
            icon: command.icon,
            ...(command.id === "callout"
                ? { page: "callout" as const }
                : { action: () => command.id === "image" ? this.openImagePicker() : this.insert(command.id) })
        }));
    }

    getCalloutItems(): InsertMenuItem[] {
        return CALLOUT_OPTIONS.map((option): InsertMenuItem => ({
            id: `callout-${option.type}`,
            label: t(`callout.${option.type}`),
            icon: this.getCalloutIcon(option.type),
            action: () => this.insert(`callout-${option.type}`)
        }));
    }

    private insert(type: string): void {
        insertBlock(this.plugin, this.view, this.lineNo, type);
    }

    private openImagePicker(): boolean {
        this.imageInput?.remove();
        const input = this.ownerDocument.body.createEl("input", {
            cls: "wk-nb-hidden-file-input",
            attr: {
                type: "file",
                accept: ".avif,.bmp,.gif,.jpeg,.jpg,.png,.svg,.webp,image/avif,image/bmp,image/gif,image/jpeg,image/png,image/svg+xml,image/webp",
                multiple: "true",
            }
        });
        this.imageInput = input;

        const cleanup = (): void => {
            input.remove();
            this.imageInput = null;
            this.closeMenu();
        };

        this.registerDomEvent(input, "change", () => {
            const files = Array.from(input.files ?? []);
            void insertImageFiles(this.plugin, this.view, this.lineNo, files).finally(cleanup);
        }, { once: true });
        this.registerDomEvent(input, "cancel", cleanup, { once: true });
        input.click();
        return true;
    }

    private getCalloutIcon(type: string): string {
        return CALLOUT_ICONS[type.toLowerCase()] ?? CALLOUT_ICONS.note;
    }

    onunload(): void {
        this.imageInput?.remove();
        this.imageInput = null;
    }
}
