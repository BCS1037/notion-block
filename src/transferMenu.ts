import { Component, setIcon } from "obsidian";
import type { TransferMode } from "./blockTransfer";
import { t } from "./locale/helpers";

export class TransferMenu extends Component {
    private root: HTMLElement | null = null;
    private buttons: HTMLButtonElement[] = [];
    constructor(private doc: Document, private position: { x: number; y: number }, private title: string, private paths: string,
        private disabled: Partial<Record<TransferMode, string>>, private expanded: boolean,
        private choose: (mode: TransferMode) => void, private cancel: (focus: boolean) => void) { super(); }

    open(): void {
        const win = this.doc.defaultView;
        if (!win) return;
        this.root = this.doc.body.createDiv({ cls: "wk-nb-action-menu wk-nb-transfer-menu", attr: { role: "menu" } });
        this.root.createDiv({ cls: "wk-nb-transfer-title", text: this.title, attr: { title: this.paths } });
        const icons = { move: "scissors", copy: "copy", link: "link", embed: "panel-top" };
        for (const mode of ["move", "copy", "link", "embed"] as const) {
            const button = this.root.createEl("button", { cls: "wk-nb-transfer-option", attr: { role: "menuitem", "data-action": mode } });
            setIcon(button.createSpan({ cls: "wk-nb-transfer-icon" }), icons[mode]);
            const text = button.createSpan({ cls: "wk-nb-transfer-text" });
            text.createSpan({ text: t(`transfer.${mode}`) });
            if (this.disabled[mode]) {
                button.disabled = true;
                text.createSpan({ cls: "wk-nb-transfer-description", text: this.disabled[mode] });
            }
            this.buttons.push(button);
            this.registerDomEvent(button, "click", () => this.choose(mode));
        }
        if (this.expanded) this.root.createDiv({ cls: "wk-nb-transfer-hint", text: t("transfer.expanded") });
        this.root.createDiv({ cls: "wk-nb-transfer-hint", text: t("transfer.cancelHint") });
        this.root.setCssStyles({ left: `${Math.max(8, Math.min(this.position.x, win.innerWidth - this.root.offsetWidth - 8))}px`,
            top: `${Math.max(8, Math.min(this.position.y, win.innerHeight - this.root.offsetHeight - 8))}px` });
        this.buttons.find(button => !button.disabled)?.focus();
        this.registerDomEvent(this.doc, "pointerdown", event => {
            const target = event.targetNode;
            if (target && !this.root?.contains(target)) this.cancel(false);
        }, true);
        this.registerDomEvent(this.doc, "keydown", event => {
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.cancel(true); }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault(); event.stopPropagation();
                const enabled = this.buttons.filter(button => !button.disabled), at = enabled.findIndex(button => button === this.doc.activeElement);
                enabled[(at + (event.key === "ArrowDown" ? 1 : enabled.length - 1) + enabled.length) % enabled.length]?.focus();
            }
            if (event.key === "Tab") { event.preventDefault(); this.cancel(true); }
        }, true);
        this.registerDomEvent(win, "resize", () => this.cancel(false));
        this.registerDomEvent(win, "blur", () => this.cancel(false));
    }

    onunload(): void { this.root?.remove(); this.root = null; this.buttons = []; }
}
