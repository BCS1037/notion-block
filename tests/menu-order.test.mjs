import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temp = await mkdtemp(join(tmpdir(), 'notion-menu-order-tests-'));
const bundle = await build({
    stdin: { contents: `export { MenuOrderDrag } from './src/menuOrder';`, resolveDir: root },
    bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'obsidian-host', setup(build) {
        build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'host' }));
        build.onLoad({ filter: /.*/, namespace: 'host' }, () => ({ contents: `
            export class Component {
                children = []; cleanups = [];
                addChild(child) { this.children.push(child); return child; }
                removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.unload(); }
                registerDomEvent(target, type, callback, options) {
                    target.addEventListener(type, callback, options);
                    this.cleanups.push(() => target.removeEventListener(type, callback, options));
                }
                unload() {
                    this.onunload?.();
                    this.children.splice(0).forEach(child => child.unload());
                    this.cleanups.splice(0).forEach(cleanup => cleanup());
                }
            }
            export const setIcon = () => {};
            export const getLanguage = () => 'en';
        ` }));
    } }],
});
const path = join(temp, 'menu-order.mjs');
await writeFile(path, bundle.outputFiles[0].contents);
const { MenuOrderDrag } = await import(pathToFileURL(path));
const event = (type, props = {}) => Object.assign(new Event(type, { cancelable: true }), props);

class Node extends EventTarget {
    constructor(doc, className = '') {
        super(); this.ownerDocument = doc; this.className = className;
        this.children = []; this.dataset = {}; this.parentElement = null;
    }
    hasClass(name) { return this.className.split(' ').includes(name); }
    addClass(name) { if (!this.hasClass(name)) this.className += ` ${name}`; }
    removeClass(name) { this.className = this.className.split(' ').filter(x => x !== name).join(' '); }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    get nextSibling() { const siblings = this.parentElement?.children ?? []; return siblings[siblings.indexOf(this) + 1] ?? null; }
    createEl(_tag, options = {}) { return this.appendChild(new Node(this.ownerDocument, options.cls)); }
    createSpan(options) { return this.createEl('span', options); }
    closest(selectors) {
        const names = selectors.split(',').map(selector => selector.trim().slice(1));
        for (let node = this; node; node = node.parentElement) if (names.some(name => node.hasClass(name))) return node;
        return null;
    }
    insertBefore(node, target) {
        // 浏览器移动捕获节点或其祖先时，下一次输入会报告丢失捕获。
        const captured = this.ownerDocument.capture;
        if (captured && node.contains(captured.node)) this.ownerDocument.pendingLost = captured;
        if (node.parentElement) {
            const siblings = node.parentElement.children;
            siblings.splice(siblings.indexOf(node), 1);
        }
        node.parentElement = this;
        const at = target ? this.children.indexOf(target) : this.children.length;
        this.children.splice(at, 0, node);
        return node;
    }
    appendChild(node) { return this.insertBefore(node, null); }
    getBoundingClientRect() {
        const row = this.closest('.wk-nb-order-row');
        if (row) {
            const top = 100 + row.parentElement.children.indexOf(row) * 40;
            return { left: 0, right: 200, top, bottom: top + 40, height: 40 };
        }
        return { left: 0, right: 200, top: 100, bottom: 100 + this.children.length * 40, height: this.children.length * 40 };
    }
    setPointerCapture(pointerId) { this.ownerDocument.capture = { node: this, pointerId }; }
    releasePointerCapture(pointerId) {
        if (this.ownerDocument.capture?.node === this && this.ownerDocument.capture.pointerId === pointerId) {
            this.ownerDocument.pendingLost = this.ownerDocument.capture;
            this.ownerDocument.capture = null;
        }
    }
}

class Document extends EventTarget {
    defaultView = new EventTarget();
    capture = null;
    pendingLost = null;
    dispatchEvent(input) {
        const lost = this.pendingLost;
        if (lost) {
            this.pendingLost = null; this.capture = null;
            lost.node.dispatchEvent(event('lostpointercapture', { pointerId: lost.pointerId }));
        }
        return super.dispatchEvent(input);
    }
    elementFromPoint(x, y) {
        if (x < 0 || x > 200) return null;
        return this.container.children.find(row => {
            const r = row.getBoundingClientRect(); return y >= r.top && y < r.bottom;
        }) ?? null;
    }
}

function fixture(pointerType = 'mouse') {
    const doc = new Document();
    const container = doc.container = new Node(doc, 'wk-nb-menu-command-list');
    const commits = [];
    const order = new MenuOrderDrag((_group, ids) => commits.push(ids));
    for (const id of ['a', 'b', 'c']) {
        const row = container.createEl('div');
        order.bindRow(row, 'transform', id);
    }
    const row = container.children[0], grip = row.children[0];
    const props = { pointerId: 1, pointerType, button: 0, clientX: 180 };
    const press = () => grip.dispatchEvent(event('pointerdown', { ...props, clientY: 120 }));
    const move = y => doc.dispatchEvent(event('pointermove', { ...props, clientY: y }));
    const release = (x = 180, y = 215) => doc.dispatchEvent(event('pointerup', { ...props, clientX: x, clientY: y }));
    const ids = () => container.children.map(row => row.dataset.itemId);
    const drag = () => { press(); for (const y of [148, 155, 172, 195, 215]) move(y); };
    return { doc, container, row, grip, order, commits, props, press, move, release, ids, drag };
}

for (const pointerType of ['mouse', 'touch']) test(`Continuous ${pointerType} movement keeps capture through DOM sorting`, () => {
    const f = fixture(pointerType);
    f.drag(); f.release();
    assert.equal(f.commits.length, 1);
    assert.deepEqual(f.ids(), ['b', 'c', 'a']);
    assert.deepEqual(f.commits[0], f.ids());
    assert.equal(f.order.hasPointer, false);
    f.order.unload();
});

test('Short press never saves or changes order', () => {
    const f = fixture(); f.press(); f.move(123); f.release(180, 123);
    assert.deepEqual(f.ids(), ['a', 'b', 'c']); assert.equal(f.commits.length, 0);
    f.order.unload();
});

for (const reason of ['outside', 'Escape', 'pointercancel', 'lostcapture', 'blur', 'unload']) test(`${reason} cancels preview without saving`, () => {
    const f = fixture(); f.drag();
    assert.notDeepEqual(f.ids(), ['a', 'b', 'c']);
    if (reason === 'outside') f.release(400, 215);
    if (reason === 'Escape') f.doc.dispatchEvent(event('keydown', { key: 'Escape' }));
    if (reason === 'pointercancel') f.doc.dispatchEvent(event('pointercancel', f.props));
    if (reason === 'lostcapture') {
        const captured = f.doc.capture;
        f.doc.capture = null;
        captured.node.dispatchEvent(event('lostpointercapture', f.props));
    }
    if (reason === 'blur') f.doc.defaultView.dispatchEvent(event('blur'));
    if (reason === 'unload') f.order.unload();
    assert.deepEqual(f.ids(), ['a', 'b', 'c']);
    assert.equal(f.commits.length, 0); assert.equal(f.order.hasPointer, false);
    f.doc.dispatchEvent(event('pointermove', { ...f.props, clientY: 200 }));
    assert.deepEqual(f.ids(), ['a', 'b', 'c']);
    f.order.unload();
});

test('Keyboard ordering retains its independent path', () => {
    const f = fixture();
    f.grip.dispatchEvent(event('keydown', { key: 'ArrowDown', altKey: true }));
    assert.deepEqual(f.ids(), ['b', 'a', 'c']); assert.deepEqual(f.commits, [['b', 'a', 'c']]);
    f.order.unload();
});
