import { Component, setIcon } from "obsidian";
import { t } from "./locale/helpers";
import { MenuGroup } from "./menuLayout";

interface DragState {
    group: MenuGroup;
    container: HTMLElement;
    row: HTMLElement;
    grip: HTMLButtonElement;
    rows: HTMLElement[];
    pointerId: number;
    x: number;
    y: number;
    started: boolean;
}

/** 菜单排序与文档拖拽独立，只使用当前窗口的 Pointer Events。 */
export class MenuOrderDrag extends Component {
    private drag: DragState | null = null;
    private dragEvents: Component | null = null;
    private suppressClick = false;

    constructor(
        private readonly onReorder: (group: MenuGroup, ids: string[], movedId: string) => void,
        private readonly onStart: () => void = () => {}
    ) { super(); }

    get isDragging(): boolean { return this.drag?.started ?? false; }
    get hasPointer(): boolean { return this.drag !== null; }

    bindRow(row: HTMLElement, group: MenuGroup, id: string): void {
        row.addClass("wk-nb-order-row");
        row.dataset.menuGroup = group;
        row.dataset.itemId = id;
        const grip = row.createEl("button", {
            cls: "wk-nb-order-grip clickable-icon",
            attr: { type: "button" }
        });
        setIcon(grip, "grip-vertical");
        grip.createSpan({ cls: "wk-nb-sr-only", text: t("menu.reorder") });
        this.registerDomEvent(row, "pointerdown", () => {
            if (!this.drag) this.suppressClick = false;
        }, true);
        this.registerDomEvent(grip, "click", event => {
            event.preventDefault();
            event.stopPropagation();
        });
        this.registerDomEvent(grip, "pointerdown", event => this.start(event, row, grip, group));
        this.registerDomEvent(grip, "lostpointercapture", event => {
            if (event.pointerId === this.drag?.pointerId) this.cancel();
        });
        this.registerDomEvent(grip, "keydown", event => {
            if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
            event.preventDefault();
            event.stopPropagation();
            if (this.drag) return;
            const container = row.parentElement;
            if (!container) return;
            const rows = this.getRows(container, group);
            const index = rows.indexOf(row);
            const target = rows[index + (event.key === "ArrowUp" ? -1 : 1)];
            if (!target) return;
            container.insertBefore(row, event.key === "ArrowUp" ? target : target.nextSibling);
            this.onReorder(group, this.getIds(container, group), id);
        });
        // 捕获拖拽后的合成 click，避免触发命令。
        this.registerDomEvent(row, "click", event => {
            if (!this.suppressClick) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            this.suppressClick = false;
        }, true);
    }

    cancel(): void { this.finish(false); }
    onunload(): void { this.cancel(); }

    private getRows(container: HTMLElement, group: MenuGroup): HTMLElement[] {
        return Array.from(container.children).filter((element): element is HTMLElement =>
            element.hasClass("wk-nb-order-row") && (element as HTMLElement).dataset.menuGroup === group);
    }

    private getIds(container: HTMLElement, group: MenuGroup): string[] {
        return this.getRows(container, group).map(row => row.dataset.itemId ?? "");
    }

    private start(event: PointerEvent, row: HTMLElement, grip: HTMLButtonElement, group: MenuGroup): void {
        if (event.button !== 0 || this.drag || !row.parentElement) return;
        event.preventDefault();
        event.stopPropagation();
        this.suppressClick = false;
        const container = row.parentElement;
        this.drag = {
            group, container, row, grip, rows: this.getRows(container, group),
            pointerId: event.pointerId, x: event.clientX, y: event.clientY, started: false
        };
        try { grip.setPointerCapture(event.pointerId); } catch { /* 合成事件可能没有活动指针。 */ }
        const doc = row.ownerDocument;
        this.dragEvents = this.addChild(new Component());
        this.dragEvents.registerDomEvent(doc, "pointermove", move => this.move(move), true);
        this.dragEvents.registerDomEvent(doc, "pointerup", up => {
            if (up.pointerId !== this.drag?.pointerId) return;
            if (this.drag.started) {
                up.preventDefault();
                up.stopPropagation();
            }
            const rect = container.getBoundingClientRect();
            this.finish(up.clientX >= rect.left && up.clientX <= rect.right && up.clientY >= rect.top && up.clientY <= rect.bottom);
        }, true);
        this.dragEvents.registerDomEvent(doc, "pointercancel", cancel => {
            if (cancel.pointerId === this.drag?.pointerId) this.cancel();
        }, true);
        const win = doc.defaultView;
        if (win) this.dragEvents.registerDomEvent(win, "blur", () => this.cancel());
        this.dragEvents.registerDomEvent(doc, "keydown", key => {
            if (key.key !== "Escape") return;
            key.preventDefault();
            key.stopImmediatePropagation();
            this.cancel();
        }, true);
    }

    private move(event: PointerEvent): void {
        const drag = this.drag;
        if (!drag || event.pointerId !== drag.pointerId) return;
        if (!drag.started && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
        if (!drag.started) {
            drag.started = true;
            drag.row.addClass("is-sorting");
            this.onStart();
        }
        event.preventDefault();
        event.stopPropagation();
        const scroller = drag.container.closest<HTMLElement>(".wk-nb-action-menu-list, .wk-nb-menu-settings-list");
        if (scroller) {
            const rect = scroller.getBoundingClientRect();
            if (event.clientY < rect.top + 24) scroller.scrollTop -= 14;
            if (event.clientY > rect.bottom - 24) scroller.scrollTop += 14;
        }
        const target = drag.row.ownerDocument.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(".wk-nb-order-row");
        if (!target || target === drag.row || target.parentElement !== drag.container || target.dataset.menuGroup !== drag.group) return;
        const rect = target.getBoundingClientRect();
        drag.container.insertBefore(drag.row, event.clientY < rect.top + rect.height / 2 ? target : target.nextSibling);
    }

    private finish(commit: boolean): void {
        const drag = this.drag;
        if (!drag) return;
        const ids = this.getIds(drag.container, drag.group);
        const changed = ids.some((id, index) => id !== drag.rows[index].dataset.itemId);
        this.drag = null;
        drag.row.removeClass("is-sorting");
        try { drag.grip.releasePointerCapture(drag.pointerId); } catch { /* 已释放或合成指针。 */ }
        if (this.dragEvents) this.removeChild(this.dragEvents);
        this.dragEvents = null;
        this.suppressClick = drag.started;
        if (!commit || !drag.started) {
            // 容器只含同组命令行，标题与「更多」入口位于容器外。
            drag.rows.forEach(row => drag.container.appendChild(row));
            return;
        }
        if (changed) this.onReorder(drag.group, ids, drag.row.dataset.itemId ?? "");
    }
}
