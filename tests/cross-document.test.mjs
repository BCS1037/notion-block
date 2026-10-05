import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';
import { build } from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url))), temp = await mkdtemp(join(tmpdir(), 'notion-cross-tests-'));
const bundle = await build({
    stdin: { contents: `export { EditorState, Text, Transaction, StateEffect } from '@codemirror/state';
        export { history, undo, redo } from '@codemirror/commands';
        export { editorInfoField, TFile, notices } from 'obsidian';
        export { getBlockSource, getDropTarget } from './src/blockDrag';
        export * from './src/blockTransfer'; export { CrossDocumentDrag } from './src/crossDocument';`, resolveDir: root },
    bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'host', setup(build) {
        build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'host' }));
        build.onLoad({ filter: /.*/, namespace: 'host' }, () => ({ resolveDir: root, contents: `
            import { StateField } from '@codemirror/state';
            export const editorInfoField = StateField.define({create: () => null, update: value => value});
            export class Component { addChild(c){return c} removeChild(c){c.onunload?.()} registerDomEvent(){} register(){} }
            export const notices = []; export class Notice { constructor(text){notices.push(text)} }
            export class TFile { constructor(path){this.path=path;this.extension='md';this.basename=path.split('/').pop().replace(/\.md$/,'')} }
            export const getLanguage = () => 'en'; export const setIcon = () => {};
            export const normalizePath = path => path;
            export const parseLinktext = text => {const at=text.indexOf('#');return {path:at<0?text:text.slice(0,at),subpath:at<0?'':text.slice(at)}};
        ` }));
    } }]
});
const path = join(temp, 'bundle.mjs'); await writeFile(path, bundle.outputFiles[0].contents);
const { EditorState, Text, Transaction, StateEffect, history, undo, redo, editorInfoField, TFile, notices,
    getBlockSource, getDropTarget, createReferencePlan, createTransferPlan, rewriteContentLinks, getBlockIds, CrossDocumentDrag } = await import(pathToFileURL(path));
let serial = 0;
const options = () => ({ newId: () => `new-${++serial}`, blockLink: id => `[[A#^${id}]]`, rewriteLinks: text => text });
const plan = (sourceText, targetText, mode, line = 1, selection, targetLine = 1, inside = false) => {
    const state = EditorState.create({ doc: sourceText, selection }), target = Text.of(targetText.split('\n'));
    return createTransferPlan(getBlockSource(state, line), target, getDropTarget(target, targetLine, false, inside), mode, options());
};

test('move deletes only source range and keeps destination blocks separate', () => {
    const result = plan('first\n\nkeep', 'dest', 'move');
    assert.equal(result.sourceAfter, '\nkeep'); assert.equal(result.targetAfter, 'first\n\ndest');
});
test('copy keeps source exact and handles empty destination', () => {
    const result = plan('a ^old', '', 'copy');
    assert.equal(result.sourceAfter, 'a ^old'); assert.match(result.targetAfter, /^a \^new-\d+$/);
});
test('source and target line numbers never cause false self-drop rejection', () => {
    assert.equal(plan('- a\n  - child\n- b', '- target', 'move', 1, undefined, 1, true).targetAfter, '- a\n  - child\n- target');
});
test('both lists renumber independently', () => {
    const result = plan('5. a\n6. b', '9. x\n10. y', 'move', 1, undefined, 2, true);
    assert.equal(result.sourceAfter, '5. b'); assert.equal(result.targetAfter, '9. x\n10. a\n11. y');
});
test('link reuses existing ID without source edits', () => {
    const result = plan('a ^stable', '', 'link');
    assert.equal(result.sourceAfter, 'a ^stable'); assert.equal(result.targetAfter, '[[A#^stable]]');
});
test('embed adds source ID and live reference', () => {
    const result = plan('a', '', 'embed'), id = getBlockIds(result.sourceAfter)[0];
    assert.equal(result.targetAfter, `![[A#^${id}]]`);
});
for (const body of ['> a\n> b', '> [!note]\n> a\n> b', '| a |\n| - |\n| b |', '```js\nx\n```', '$$\nx\n$$', 'Title\n===']) {
    test(`reference anchor sits outside complete structured block: ${body.split('\n')[0]}`, () => {
        const result = plan(body + '\nnext', '', 'link');
        assert.match(result.sourceAfter, /\n\n\^new-\d+\n\nnext$/);
    });
}
test('partial quote reference expands and reports full container', () => {
    const result = plan('> [!note]\n> a\n> b', '', 'link', 2);
    assert.equal(result.expanded, true); assert.equal((result.sourceAfter.match(/\^new-/g) ?? []).length, 1);
});
test('multiple native blocks receive ordered distinct references', () => {
    const result = plan('a\n\nb', '', 'link', 1, { anchor: 0, head: 4 });
    assert.equal(getBlockIds(result.sourceAfter).length, 2); assert.equal(result.targetAfter.split('\n').length, 2);
});
test('separate anchor follows quote on later move', () => {
    const text = '> a\n> b\n\n^stable\n\ntail';
    const result = plan(text, '', 'move', 1, { anchor: 0, head: 17 });
    assert.equal(result.targetAfter, '> a\n> b\n\n^stable'); assert.equal(result.sourceAfter, '\ntail');
});
test('ID collision prevents move and leaves copy independent', () => {
    assert.throws(() => plan('a ^same', 'b ^same', 'move'), /idConflict/);
    assert.match(plan('a ^same', 'b ^same', 'copy').targetAfter, /^a \^new-/);
});
test('duplicate source anchors cannot produce ambiguous references', () => {
    assert.throws(() => plan('a ^same\n\nb ^same', '', 'link'), /idConflict/);
});
test('fresh IDs retry collisions and bound failed generators', () => {
    const source = getBlockSource(EditorState.create({ doc: 'a\n\nb ^same' }), 1); let n = 0;
    assert.deepEqual(createReferencePlan(source, () => ++n === 1 ? 'same' : 'fresh').ids, ['fresh']);
    assert.throws(() => createReferencePlan(source, () => 'same'), /idConflict/);
});
test('structured anchor cannot be silently invalidated inside another container', () => {
    assert.throws(() => plan('> a\n\n^stable', '> target', 'copy', 1, { anchor: 0, head: 12 }, 1, true), /anchorContainer/);
});
test('code ID examples remain byte exact during copy', () => {
    assert.equal(plan('```\nexample ^id\n```', '', 'copy').targetAfter, '```\nexample ^id\n```');
});
test('literal math, YAML and comment contents are never treated as live block IDs', () => {
    for (const body of ['$$\nx ^power\n$$', '---\nvalue: ^example\n---', '%%\nexample ^id\n%%', '- $$\n  x ^power\n  $$']) {
        assert.equal(plan(body, '', 'copy').targetAfter, body);
        assert.deepEqual(getBlockIds(body), []);
    }
});
test('links inside literal containers stay byte exact while list continuation links rebase', () => {
    for (const body of ['$$\n[[A]]\n$$', '---\nvalue: "[[A]]"\n---', '%%\n[[A]]\n%%', '- ```\n  [[A]]\n  ```', '    [[A]]']) {
        assert.equal(rewriteContentLinks(body, 'B.md', () => ({ path: 'C.md', subpath: '' }), () => 'C'), body);
    }
    assert.equal(rewriteContentLinks('12. Item\n    [[A]]', 'B.md', () => ({ path: 'C.md', subpath: '' }), () => 'C'), '12. Item\n    [[C]]');
});
test('wikilinks, local anchors, Markdown images and captions rebase; code and external URLs stay exact', () => {
    const resolve = (path, subpath) => ({ path: path ? 'assets/pic space.png' : 'folder/A.md', subpath });
    const before = '[[#^id|caption]] ![pic](../pic%20space.png "title") `[[#^id]]` [site](https://example.com)\n```\n[[#^id]]\n```';
    const after = rewriteContentLinks(before, 'other/B.md', resolve, path => path.replace(/\.md$/, ''));
    assert.equal(after, '[[folder/A#^id|caption]] ![pic](../assets/pic%20space.png "title") `[[#^id]]` [site](https://example.com)\n```\n[[#^id]]\n```');
});
test('Markdown heading fragments stay URL encoded after rebasing', () => {
    const after = rewriteContentLinks('[heading](#Some%20heading) [block](#%5Estable)', 'B.md',
        (path, subpath) => ({ path: 'folder/A.md', subpath }), path => path);
    assert.equal(after, '[heading](folder/A.md#Some%20heading) [block](folder/A.md#^stable)');
});

function pair(source = 'first\n\nkeep', target = 'dest') {
    const files = [new TFile('A.md'), new TFile('B.md')];
    const app = { vault: { getMarkdownFiles: () => files, getAbstractFileByPath: path => files.find(file => file.path === path) }, metadataCache: {
        getFileCache: () => null, getFirstLinkpathDest: path => files.find(file => file.path.replace(/\.md$/, '') === path),
        fileToLinktext: file => file.path.replace(/\.md$/, '')
    } };
    const owner = new CrossDocumentDrag(app), extensions = owner.extension();
    const views = [source, target].map((doc, index) => ({
        state: EditorState.create({ doc, extensions: [history(), extensions, editorInfoField.init(() => ({ file: files[index] }))] }),
        dom: { isConnected: true, ownerDocument: { defaultView: { crypto: webcrypto, setTimeout, clearTimeout } } }, focus() {}, coordinator: owner,
        dispatch(spec) { const tr = spec instanceof Transaction ? spec : this.state.update(spec); this.state = tr.state; this.coordinator.onUpdate({ view: this, transactions: [tr] }); }
    }));
    views.forEach(view => { view.dispatch = view.dispatch.bind(view); owner.views.add(view); });
    const execute = mode => {
        owner.pending = { sourceView: views[0], source: getBlockSource(views[0].state, 1), targetView: views[1],
            target: getDropTarget(views[1].state.doc, 1, false, false), sourceFile: files[0], targetFile: files[1], sourcePath: 'A.md', targetPath: 'B.md', targetState: views[1].state };
        owner.execute(mode);
    };
    return { owner, views, execute, files, app, text: () => views.map(view => view.state.doc.toString()) };
}
for (const mode of ['move', 'copy', 'link', 'embed']) test(`native undo and redo preserve both notes: ${mode}`, () => {
    const fixture = pair(), before = fixture.text(); fixture.execute(mode); const after = fixture.text();
    assert.notDeepEqual(after, before); undo(fixture.views[1]); assert.deepEqual(fixture.text(), before);
    redo(fixture.views[0].state.doc.toString() === before[0] && mode !== 'copy' ? fixture.views[0] : fixture.views[1]);
    assert.deepEqual(fixture.text(), after);
});
test('undo from source also restores target', () => {
    const f = pair(), before = f.text(); f.execute('move'); undo(f.views[0]); assert.deepEqual(f.text(), before);
});
test('later peer edits block transfer undo until later edits are undone', () => {
    const f = pair(); f.execute('move'); f.views[0].dispatch({ changes: { from: 0, insert: 'later' }, userEvent: 'input.type' });
    const after = f.text(); f.owner.runHistory(f.views[1], 'undo'); assert.deepEqual(f.text(), after);
    undo(f.views[0]); undo(f.views[1]); assert.deepEqual(f.text(), ['first\n\nkeep', 'dest']);
});
test('closing peer blocks transfer undo without discarding history', () => {
    const f = pair(); f.execute('move'); const after = f.text(); f.owner.views.delete(f.views[0]);
    f.owner.runHistory(f.views[1], 'undo'); assert.deepEqual(f.text(), after); f.owner.views.add(f.views[0]);
    undo(f.views[1]); assert.deepEqual(f.text(), ['first\n\nkeep', 'dest']);
});
test('source dispatch failure rolls back target without deleting source', () => {
    const f = pair(), before = f.text(); f.views[0].dispatch = () => { throw new Error('write failed'); };
    f.execute('move'); assert.deepEqual(f.text(), before);
});
test('fresh references do not depend on metadata cache freshness', () => {
    const f = pair(); f.execute('link'); const source = f.views[0].state.doc.toString();
    f.execute('link'); assert.equal(f.views[0].state.doc.toString(), source); assert.equal(getBlockIds(source).length, 1);
});
test('existing inbound block link prevents destructive move', () => {
    const f = pair('first ^stable', '[[A#^stable]]'), before = f.text(); f.execute('move'); assert.deepEqual(f.text(), before);
});
test('new source text cancels pending transfer', () => {
    const f = pair(); f.owner.pending = { sourceView: f.views[0], source: getBlockSource(f.views[0].state, 1), targetView: f.views[1],
        sourceFile: f.files[0], targetFile: f.files[1], sourcePath: 'A.md', targetPath: 'B.md', targetState: f.views[1].state };
    f.views[0].dispatch({ changes: { from: 0, insert: 'later' } }); assert.equal(f.owner.pending, null);
});
test('programmatic native undo of changed peer restores initiator without touching later edits', async () => {
    const f = pair(); f.execute('move'); f.views[0].dispatch({ changes: { from: 0, insert: 'later' }, userEvent: 'input.type' });
    const before = f.text(); undo(f.views[1]); await new Promise(resolve => setTimeout(resolve, 5)); assert.deepEqual(f.text(), before);
});
test('paired native history survives coordinator reload', () => {
    const f = pair(), before = f.text(); f.execute('move'); const after = f.text(); f.owner.onunload();
    const next = new CrossDocumentDrag(f.app);
    f.views.forEach((view, index) => {
        view.coordinator = next; next.views.add(view);
        view.dispatch({ effects: StateEffect.reconfigure.of([history(), next.extension(), editorInfoField.init(() => ({ file: f.files[index] }))]) });
    });
    next.runHistory(f.views[1], 'undo'); assert.deepEqual(f.text(), before);
    next.runHistory(f.views[0], 'redo'); assert.deepEqual(f.text(), after);
});
test('live Markdown backlink blocks destructive move before cache refresh', () => {
    const f = pair('first ^stable', '[link](A.md#^stable)'), before = f.text(); f.execute('move'); assert.deepEqual(f.text(), before);
});
test('code examples are not mistaken for live inbound references', () => {
    const f = pair('first ^stable', '```\n[[A#^stable]]\n```'); f.execute('move'); assert.equal(f.text()[0], '', JSON.stringify(notices.slice(-3)));
});
test('copy preserves indented code and nested fenced code examples', () => {
    assert.equal(plan('    example ^id', '', 'copy').targetAfter, '    example ^id');
    assert.equal(plan('- ```\n  example ^id\n  ```', '', 'copy').targetAfter, '- ```\n  example ^id\n  ```');
});
test('missing note index prevents destructive moves with existing IDs', () => {
    const f = pair('first ^stable', 'Destination'); f.files.push(new TFile('Unindexed.md'));
    const before = f.text(); f.execute('move'); assert.deepEqual(f.text(), before);
});
