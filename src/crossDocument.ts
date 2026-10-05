import { Annotation, EditorState, Prec, StateEffect, Transaction } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate, keymap } from "@codemirror/view";
import { invertedEffects, isolateHistory, redo, undo } from "@codemirror/commands";
import { App, Component, Notice, TFile, editorInfoField, normalizePath, parseLinktext } from "obsidian";
import { createReferencePlan, createTransferPlan, getBlockIds, rewriteContentLinks, textChange, TransferError } from "./blockTransfer";
import type { TransferMode } from "./blockTransfer";
import type { DragSource, DropTarget } from "./blockDrag";
import { TransferMenu } from "./transferMenu";
import { t } from "./locale/helpers";

interface HistoryEntry { path: string; before: string; after: string }
interface HistoryRecord { id: string; entries: HistoryEntry[] }
interface HistorySignal { kind: "notion-block.transfer"; record: HistoryRecord; direction: "undo" | "redo" }
const historySignal = StateEffect.define<HistorySignal>();
const applyingTransfer = Annotation.define<boolean>();

// Shape matching also recognizes markers left in native history across plugin reloads.
function signalValue(value: unknown): HistorySignal | null {
    if (typeof value !== "object" || value === null || !("kind" in value) || value.kind !== "notion-block.transfer"
        || !("direction" in value) || (value.direction !== "undo" && value.direction !== "redo")
        || !("record" in value) || typeof value.record !== "object" || value.record === null) return null;
    const record = value.record;
    if (!("id" in record) || typeof record.id !== "string" || !("entries" in record) || !Array.isArray(record.entries)
        || record.entries.length < 1 || record.entries.length > 2) return null;
    const entries: unknown[] = record.entries;
    if (!entries.every(entry => typeof entry === "object" && entry !== null && "path" in entry && typeof entry.path === "string"
        && "before" in entry && typeof entry.before === "string" && "after" in entry && typeof entry.after === "string")) return null;
    return value as HistorySignal;
}

function signals(tr: Transaction): HistorySignal[] {
    return tr.effects.map(effect => signalValue(effect.value)).filter((value): value is HistorySignal => value !== null);
}

function fileOf(view: EditorView): TFile | null { return view.state.field(editorInfoField, false)?.file ?? null; }

interface PendingDrop {
    sourceView: EditorView; source: DragSource; targetView: EditorView; target: DropTarget;
    sourceFile: TFile; targetFile: TFile; sourcePath: string; targetPath: string; targetState: EditorState;
}
interface HistoryReplay { view: EditorView; transaction: Transaction }

export class CrossDocumentDrag extends Component {
    readonly views = new Set<EditorView>();
    private menu: TransferMenu | null = null;
    private pending: PendingDrop | null = null;
    private preparingHistory = false;
    private replayingHistory = false;
    private replays = new Map<string, HistoryReplay[]>();
    private denied = new Set<string>();
    private repairs = new Map<number, { win: Window; restore: () => void }>();
    private serial = 0;

    constructor(private app: App) {
        super();
        this.register(() => {
            for (const [timer, repair] of this.repairs) { repair.win.clearTimeout(timer); repair.restore(); }
            this.repairs.clear();
        });
    }

    extension(): Extension {
        const attach = (view: EditorView): void => { this.views.add(view); };
        const update = (value: ViewUpdate): void => this.onUpdate(value);
        const detach = (view: EditorView): void => {
            this.views.delete(view);
            this.replays.clear();
            if (this.pending?.sourceView === view || this.pending?.targetView === view) this.closeMenu(false);
        };
        return [
            ViewPlugin.fromClass(class {
                constructor(readonly view: EditorView) { attach(view); }
                update(value: ViewUpdate): void { update(value); }
                destroy(): void { detach(this.view); }
            }),
            Prec.highest(keymap.of([
                { key: "Mod-z", run: view => this.runHistory(view, "undo") },
                { key: "Mod-Shift-z", run: view => this.runHistory(view, "redo") },
                { key: "Mod-y", run: view => this.runHistory(view, "redo") }
            ])),
            Prec.highest(EditorView.domEventHandlers({ beforeinput: (event, view) => {
                const direction = event.inputType === "historyUndo" ? "undo" : event.inputType === "historyRedo" ? "redo" : null;
                if (!direction || !this.runHistory(view, direction)) return false;
                event.preventDefault(); return true;
            } })),
            // Native history uses filter:false, but extenders still observe its markers.
            EditorState.transactionExtender.of(tr => { this.prepareHistory(tr); return null; }),
            invertedEffects.of(tr => signals(tr).map(signal => historySignal.of({ ...signal, direction: signal.direction === "undo" ? "redo" : "undo" })))
        ];
    }

    sameFile(a: EditorView, b: EditorView): boolean { return a === b || fileOf(a) !== null && fileOf(a)?.path === fileOf(b)?.path; }
    nameOf(view: EditorView): string { return fileOf(view)?.basename ?? ""; }

    targetAt(source: EditorView, x: number, y: number): EditorView | null {
        const doc = source.dom.ownerDocument, hit = doc.elementFromPoint(x, y);
        for (const view of this.views) {
            if (view.dom.ownerDocument !== doc || !view.dom.isConnected || view.state.readOnly || view !== source && fileOf(view)?.extension !== "md") continue;
            const rect = view.scrollDOM.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1 || x < rect.left - 80 || x > rect.right || y < rect.top || y > rect.bottom) continue;
            if (hit && !view.dom.contains(hit)) continue;
            return view;
        }
        return null;
    }

    offer(sourceView: EditorView, source: DragSource, targetView: EditorView, target: DropTarget, point: { x: number; y: number }): void {
        this.closeMenu(false);
        const sourceFile = fileOf(sourceView), targetFile = fileOf(targetView);
        if (!sourceFile || !targetFile || this.sameFile(sourceView, targetView) || source.document !== sourceView.state.doc || targetView.state.readOnly) return;
        this.pending = { sourceView, source, targetView, target, sourceFile, targetFile, sourcePath: sourceFile.path, targetPath: targetFile.path, targetState: targetView.state };
        const disabled: Partial<Record<TransferMode, string>> = {};
        const incoming = this.incomingReferenceReason(sourceFile, source);
        if (incoming) disabled.move = t(`transfer.${incoming}`);
        let expanded = false;
        try { expanded = createReferencePlan(source, () => this.newId(sourceView)).expanded; }
        catch (error) { disabled.link = disabled.embed = t(`transfer.${error instanceof TransferError ? error.message : "unsupportedReference"}`); }
        if (target.mode !== "outside" && source.content.split("\n").some(line => /^\^[A-Za-z0-9-]+[ \t]*$/.test(line))) disabled.move = disabled.copy = t("transfer.anchorContainer");
        this.menu = this.addChild(new TransferMenu(targetView.dom.ownerDocument, point, `${sourceFile.basename} → ${targetFile.basename}`,
            `${sourceFile.path} → ${targetFile.path}`, disabled, expanded,
            mode => this.execute(mode), focus => this.closeMenu(focus)));
        this.menu.open();
    }

    private valid(drop: PendingDrop): boolean {
        return this.views.has(drop.sourceView) && this.views.has(drop.targetView) && drop.sourceView.dom.isConnected && drop.targetView.dom.isConnected
            && fileOf(drop.sourceView) === drop.sourceFile && fileOf(drop.targetView) === drop.targetFile
            && drop.sourceFile.path === drop.sourcePath && drop.targetFile.path === drop.targetPath
            && drop.sourceView.state.doc === drop.source.document && drop.targetView.state.doc === drop.targetState.doc
            && !drop.sourceView.state.readOnly && !drop.targetView.state.readOnly;
    }

    private execute(mode: TransferMode): void {
        const drop = this.pending;
        if (!drop || !this.valid(drop)) { this.closeMenu(false); new Notice(t("transfer.changed")); return; }
        try {
            const incoming = mode === "move" ? this.incomingReferenceReason(drop.sourceFile, drop.source) : null;
            if (incoming) throw new TransferError(incoming);
            const movedHeadings = new Set(drop.source.content.split("\n").map(line => line.match(/^#{1,6}\s+(.+?)(?:\s+#+)?$/)?.[1]).filter((value): value is string => !!value));
            const plan = createTransferPlan(drop.source, drop.targetState.doc, drop.target, mode, {
                newId: () => this.newId(drop.sourceView),
                blockLink: id => `[[${this.app.metadataCache.fileToLinktext(drop.sourceFile, drop.targetFile.path, true)}#^${id}]]`,
                rewriteLinks: (text, ids) => rewriteContentLinks(text, drop.targetFile.path, (path, subpath, markdown) => {
                    const file = this.resolveFile(path, drop.sourceFile, markdown);
                    if (!file) return null;
                    const id = subpath.startsWith("#^") ? subpath.slice(2) : null;
                    if (file === drop.sourceFile && (id !== null && ids.has(id) || movedHeadings.has(subpath.slice(1)))) {
                        return { path: drop.targetFile.path, subpath: id === null ? subpath : `#^${ids.get(id) ?? id}` };
                    }
                    return { path: file.path, subpath };
                }, path => {
                    const file = this.app.vault.getAbstractFileByPath(path);
                    return file instanceof TFile ? this.app.metadataCache.fileToLinktext(file, drop.targetFile.path, true) : path;
                })
            });
            const changes = [
                { view: drop.targetView, path: drop.targetFile.path, before: drop.targetState.doc.toString(), after: plan.targetAfter, selection: plan.targetSelection },
                { view: drop.sourceView, path: drop.sourceFile.path, before: drop.source.document.toString(), after: plan.sourceAfter, selection: undefined }
            ].filter(entry => entry.before !== entry.after);
            const record: HistoryRecord = { id: `${Date.now()}-${++this.serial}`, entries: changes.map(({ path, before, after }) => ({ path, before, after })) };
            const signal: HistorySignal = { kind: "notion-block.transfer", record, direction: "redo" };
            // Prepare both transactions before any write; target is applied before source deletion.
            const prepared = changes.map(entry => ({ ...entry, transaction: entry.view.state.update({ changes: textChange(entry.view.state.doc, entry.after),
                selection: entry.selection, effects: historySignal.of(signal),
                annotations: [applyingTransfer.of(true), isolateHistory.of("full")], userEvent: "move.block.cross-document" }) }));
            if (prepared.some(entry => entry.transaction.newDoc.toString() !== entry.after)) throw new TransferError("changed");
            this.closeMenu(false);
            const applied: typeof prepared = [];
            try {
                for (const entry of prepared) {
                    if (entry.view.state !== entry.transaction.startState) throw new TransferError("changed");
                    try { entry.view.dispatch(entry.transaction); }
                    catch (error) { if (entry.view.state.doc.toString() === entry.after) applied.push(entry); throw error; }
                    if (entry.view.state.doc.toString() !== entry.after) throw new TransferError("changed");
                    applied.push(entry);
                }
            } catch (error) {
                this.replayingHistory = true;
                try { for (const entry of applied.reverse()) undo(entry.view); } finally { this.replayingHistory = false; }
                throw error;
            }
            drop.targetView.focus();
            if (plan.expanded) new Notice(t("transfer.expanded"));
        } catch (error) {
            this.closeMenu(false);
            new Notice(t(`transfer.${error instanceof TransferError ? error.message : "failed"}`));
        }
    }

    private resolveFile(path: string, source: TFile, markdown: boolean): TFile | null {
        if (!path) return source;
        if (markdown) {
            const parts = path.startsWith("/") ? [] : source.path.split("/").slice(0, -1);
            for (const part of path.split("/")) { if (part === "..") parts.pop(); else if (part && part !== ".") parts.push(part); }
            const file = this.app.vault.getAbstractFileByPath(normalizePath(parts.join("/")));
            if (file instanceof TFile) return file;
        }
        return this.app.metadataCache.getFirstLinkpathDest(path, source.path);
    }

    private incomingReferenceReason(file: TFile, source: DragSource): "referenced" | "indexPending" | null {
        const ids = new Set(getBlockIds(source.text));
        if (!ids.size) return null;
        for (const note of this.app.vault.getMarkdownFiles()) {
            const live = [...this.views].filter(view => fileOf(view) === note);
            if (live.length) {
                let referenced = false;
                for (const view of live) {
                    const doc = view.state.doc;
                    const text = note === file ? doc.sliceString(0, source.from) + "\n" + doc.sliceString(source.to) : doc.toString();
                    rewriteContentLinks(text, note.path, (path, subpath, markdown) => {
                        if (subpath.startsWith("#^") && ids.has(subpath.slice(2)) && this.resolveFile(path, note, markdown) === file) referenced = true;
                        return null;
                    }, path => path);
                }
                if (referenced) return "referenced";
                continue;
            }
            const cache = this.app.metadataCache.getFileCache(note);
            if (!cache) return "indexPending";
            for (const link of [...cache?.links ?? [], ...cache?.embeds ?? []]) {
                if (note === file && link.position.start.offset >= source.from && link.position.end.offset <= source.to) continue;
                const { path, subpath } = parseLinktext(link.link);
                if (subpath.startsWith("#^") && ids.has(subpath.slice(2)) && this.resolveFile(path, note, false) === file) return "referenced";
                let referenced = false;
                rewriteContentLinks(link.original, note.path, (path, subpath, markdown) => {
                    if (subpath.startsWith("#^") && ids.has(subpath.slice(2)) && this.resolveFile(path, note, markdown) === file) referenced = true;
                    return null;
                }, path => path);
                if (referenced) return "referenced";
            }
        }
        return null;
    }

    private newId(view: EditorView): string {
        const bytes = new Uint32Array(2);
        view.dom.ownerDocument.defaultView?.crypto.getRandomValues(bytes);
        return `nb-${bytes[0].toString(36)}${bytes[1].toString(36)}`;
    }

    runHistory(view: EditorView, direction: "undo" | "redo"): boolean {
        let predicted: Transaction | null = null;
        this.preparingHistory = true;
        try { (direction === "undo" ? undo : redo)({ state: view.state, dispatch: value => { predicted = value; } }); }
        finally { this.preparingHistory = false; }
        const transaction = predicted as Transaction | null;
        if (!transaction) return false;
        if (this.prepareHistory(transaction, false)) view.dispatch(transaction);
        return true;
    }

    private prepareHistory(tr: Transaction, markDenied = true): boolean {
        if (this.preparingHistory || this.replayingHistory || tr.annotation(applyingTransfer)) return true;
        const signal = signals(tr)[0];
        if (!signal || !tr.isUserEvent(signal.direction)) return true;
        const path = tr.startState.field(editorInfoField, false)?.file?.path;
        const own = signal.record.entries.find(entry => entry.path === path);
        const expected = (entry: HistoryEntry): string => signal.direction === "undo" ? entry.after : entry.before;
        const result = (entry: HistoryEntry): string => signal.direction === "undo" ? entry.before : entry.after;
        const replay: HistoryReplay[] = [];
        let valid = own && tr.startState.doc.toString() === expected(own) && tr.newDoc.toString() === result(own);
        if (valid) for (const entry of signal.record.entries.filter(entry => entry !== own)) {
            let peer: HistoryReplay | null = null;
            for (const view of this.views) {
                if (fileOf(view)?.path !== entry.path || !view.dom.isConnected || view.state.readOnly || view.state.doc.toString() !== expected(entry)) continue;
                let predicted: Transaction | null = null;
                this.preparingHistory = true;
                try { (signal.direction === "undo" ? undo : redo)({ state: view.state, dispatch: value => { predicted = value; } }); }
                finally { this.preparingHistory = false; }
                const transaction = predicted as Transaction | null;
                if (transaction && transaction.newDoc.toString() === result(entry)
                    && signals(transaction).some(other => other.record.id === signal.record.id && other.direction === signal.direction)) { peer = { view, transaction }; break; }
            }
            if (!peer) { valid = false; break; }
            replay.push(peer);
        }
        if (!valid) {
            if (markDenied) this.denied.add(signal.record.id + signal.direction);
            new Notice(t("transfer.historyBlocked")); return false;
        }
        this.denied.delete(signal.record.id + signal.direction);
        this.replays.set(signal.record.id + signal.direction, replay);
        return true;
    }

    private onUpdate(update: ViewUpdate): void {
        if (this.pending && !this.valid(this.pending)) this.closeMenu(false);
        if (this.replayingHistory) return;
        for (const tr of update.transactions) {
            if (tr.annotation(applyingTransfer)) continue;
            for (const signal of signals(tr)) {
                const key = signal.record.id + signal.direction;
                if (this.denied.delete(key)) {
                    // Programmatic Editor.undo() bypasses keyboard handlers. Restore it before
                    // the next paint, without dispatching into a view while it is updating.
                    const win = update.view.dom.ownerDocument.defaultView;
                    if (win) {
                        const restore = (): void => {
                            if (update.view.state.doc !== tr.newDoc) return;
                            this.replayingHistory = true;
                            try { (signal.direction === "undo" ? redo : undo)(update.view); }
                            finally { this.replayingHistory = false; }
                        };
                        const timer = win.setTimeout(() => { this.repairs.delete(timer); restore(); }, 0);
                        this.repairs.set(timer, { win, restore });
                    }
                    continue;
                }
                const replay = this.replays.get(key);
                if (!replay) continue;
                this.replays.delete(key);
                this.replayingHistory = true;
                try { for (const entry of replay) entry.view.dispatch(entry.transaction); }
                finally { this.replayingHistory = false; }
            }
        }
    }

    private closeMenu(focus: boolean): void {
        const target = this.pending?.targetView;
        this.pending = null;
        if (this.menu) this.removeChild(this.menu);
        this.menu = null;
        if (focus && target?.dom.isConnected) target.focus();
    }

    onunload(): void {
        this.closeMenu(false);
        this.views.clear(); this.replays.clear(); this.denied.clear();
    }
}
