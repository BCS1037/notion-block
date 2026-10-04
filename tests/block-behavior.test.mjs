import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temp = await mkdtemp(join(tmpdir(), 'notion-block-tests-'));
const bundle = await build({
    stdin: {
        contents: `export { EditorState } from '@codemirror/state';
            export { selectWholeBlock, transformLine } from './src/blockTransform';
            export { DragManager } from './src/dragDrop';
            export { getBlockSource, getDragPath, getDropTarget, getDropEdit, canDrop } from './src/blockDrag';`,
        resolveDir: root,
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    plugins: [{
        name: 'obsidian-host',
        setup(build) {
            build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'host' }));
            build.onLoad({ filter: /.*/, namespace: 'host' }, () => ({ contents: `
                export class Component {
                    addChild(child) { return child; }
                    removeChild(child) { child.onunload?.(); }
                    registerDomEvent() {}
                }
                export class Notice {}
                export const moment = () => {};
                export const getLanguage = () => 'en';
            ` }));
        },
    }],
});
const modulePath = join(temp, 'blocks.mjs');
await writeFile(modulePath, bundle.outputFiles[0].contents);
const { EditorState, selectWholeBlock, transformLine, DragManager, getBlockSource, getDragPath, getDropTarget, getDropEdit, canDrop } = await import(pathToFileURL(modulePath));
function editor(doc, selection) {
    return {
        state: EditorState.create({ doc, selection }),
        dispatch(spec) { this.state = this.state.update(spec).state; },
    };
}

function dragFixture(doc) {
    const view = editor(doc);
    const element = () => ({ setCssStyles() {}, remove() {}, createSpan: element, setText() {}, toggleClass() {}, offsetWidth: 100, offsetHeight: 20 });
    const ownerDocument = {
        defaultView: { getSelection: () => null, innerWidth: 800, innerHeight: 600 },
        body: { createDiv: element, addClass() {}, removeClass() {} },
    };
    view.dom = { ownerDocument };
    view.contentDOM = { clientWidth: 400, getBoundingClientRect: () => ({ left: 0, right: 400 }) };
    view.scrollDOM = { getBoundingClientRect: () => ({ left: 0, right: 400, top: 0, bottom: 600 }) };
    view.defaultCharacterWidth = 8;
    view.defaultLineHeight = 20;
    view.viewport = { from: 0, to: view.state.doc.length };
    view.domAtPos = () => ({ node: { childNodes: [], parentElement: null }, offset: 0 });
    view.coordsAtPos = pos => {
        const number = view.state.doc.lineAt(pos).number;
        return { top: (number - 1) * 20, bottom: number * 20, left: (pos - view.state.doc.line(number).from) * 8 };
    };
    const manager = new DragManager(view);
    return { view, manager };
}

function draggedText(doc, lineNo) {
    const { manager } = dragFixture(doc);
    manager.startDrag(lineNo, { clientX: 0, clientY: 0 });
    const text = manager.startBlock.text;
    manager.onunload();
    return text;
}

test('三行列表选区整体进入同一 callout，保留列表内容', () => {
    const doc = '- 第一项\n- 第二项\n- 第三项';
    const view = editor(doc, { anchor: 0, head: doc.length });
    transformLine(view, 1, 'callout-note');
    assert.equal(view.state.doc.toString(), '> [!note]\n> - 第一项\n> - 第二项\n> - 第三项');
});

test('相邻 callout、列表、引用分别拖拽', () => {
    const callout = '> [!note]\n> 提示内容';
    const bullet = '- 第一项\n- 第二项';
    const quote = '> 引用内容';
    const doc = [callout, bullet, quote].join('\n');
    assert.equal(draggedText(doc, 1), callout);
    assert.equal(draggedText(doc, 3), '- 第一项');
    assert.equal(draggedText(doc, 5), quote);
});

test('callout 转引用去掉标记，保留标题和全部正文', () => {
    const view = editor('> [!note] 自定义标题\n> 第一行\n> - 第二行');
    transformLine(view, 1, 'blockquote');
    assert.equal(view.state.doc.toString(), '> 自定义标题\n> 第一行\n> - 第二行');
});

test('引用转 callout 包含完整引用，不重复嵌套', () => {
    const view = editor('> 第一行\n> 第二行');
    selectWholeBlock(view, 2);
    transformLine(view, 2, 'callout-tip');
    assert.equal(view.state.doc.toString(), '> [!tip]\n> 第一行\n> 第二行');
});

const boundaries = [
    ['标题与正文', '# 标题\n普通正文\n下一行\n## 后续标题', 1, '# 标题'],
    ['普通段落边界', '# 标题\n普通正文\n下一行\n- 项目', 3, '普通正文\n下一行'],
    ['相邻标题', '# 标题一\n## 标题二\n正文', 2, '## 标题二'],
    ['不同列表类型', '- 项目\n1. 编号\n2. 编号二\n- [x] 任务\n> 引用', 2, '1. 编号'],
    ['任务列表首项边界', '- 项目\n- [x] 已完成\n- [ ] 待办\n普通正文', 2, '- [x] 已完成'],
    ['嵌套列表与续行', '- 父项\n  1. 子项\n     子项续行\n- 父项二\n> 引用', 2, '  1. 子项\n     子项续行'],
    ['列表项内空行与续段', '- 父项\n\n  续段\n- 父项二\n\n普通正文', 3, '- 父项\n\n  续段'],
    ['代码围栏及空行', '段落\n```md\n# 字面标题\n\n- 字面列表\n```\n- 真列表', 3, '```md\n# 字面标题\n\n- 字面列表\n```'],
    ['波浪线围栏', '段落\n~~~~js\n> 字面引用\n~~~\n~~~~\n# 标题', 3, '~~~~js\n> 字面引用\n~~~\n~~~~'],
    ['相邻公式', '段落\n$$\nx+y\n\nz\n$$\n- 项目', 4, '$$\nx+y\n\nz\n$$'],
    ['单行公式', '$$x+y$$\n正文', 1, '$$x+y$$'],
    ['表格', '# 标题\n| A | B |\n| --- | :---: |\n| x | y |\n> 引用', 4, '| A | B |\n| --- | :---: |\n| x | y |'],
    ['短表格分隔符', '正文\nA | B\n- | :-:\nx | y\n> 引用', 3, 'A | B\n- | :-:\nx | y'],
    ['缩进代码与空行', '正文\n    # 字面标题\n\n      续行\n- 真列表', 2, '    # 字面标题\n\n      续行'],
    ['frontmatter', '---\ntitle: 测试\n\nflags: []\n---\n# 标题', 3, '---\ntitle: 测试\n\nflags: []\n---'],
    ['顶部分隔线', '---\n# 标题\n正文', 1, '---'],
    ['分隔线', '正文\n***\n- 项目', 2, '***'],
    ['setext 标题', '标题\n===\n正文', 1, '标题\n==='],
    ['多行注释', '段落\n%%\n# 隐藏标题\n\n- 隐藏列表\n%%\n> 引用', 3, '%%\n# 隐藏标题\n\n- 隐藏列表\n%%'],
    ['嵌入与正文', '段落\n![[image.png]]\n后续正文', 2, '![[image.png]]'],
    ['脚注定义', '段落\n[^1]: 说明\n    续行\n# 标题', 3, '[^1]: 说明\n    续行'],
    ['callout 标题控制整个容器', '> [!note]\n> 内容\n>\n> - 列表\n- 外部列表', 1, '> [!note]\n> 内容\n>\n> - 列表'],
    ['相邻 callout', '> [!note]\n> 内容一\n> [!tip]\n> 内容二\n- 项目', 3, '> [!tip]\n> 内容二'],
];
for (const [name, doc, line, expected] of boundaries) {
    test(`块拖拽：${name}`, () => assert.equal(draggedText(doc, line), expected));
}

const transforms = [
    ['反向选区', '- a\n- b\n- c', 2, 'callout-note', '> [!note]\n> - a\n> - b\n> - c', 'reverse'],
    ['选区排除下一行行首', '- a\n- b\n尾行', 1, 'callout-note', '> [!note]\n> - a\n> - b\n尾行', 'next-line'],
    ['句柄在选区外', '- a\n- b\n尾行', 3, 'h1', '- a\n- b\n# 尾行', 'next-line'],
    ['选区转引用保留列表', '- a\n- b', 1, 'blockquote', '> - a\n> - b', 'all'],
    ['选区逐行换编号', '- a\n- b\n- c', 2, 'numbered', '1. a\n2. b\n3. c', 'all'],
    ['选区列表转普通文本', '- a\n- b', 1, 'paragraph', 'a\nb', 'all'],
    ['无选区列表只改当前项', '- a\n- b', 2, 'h2', '- a\n## b'],
    ['折叠 callout 标题入口换类型', '> [!note]- 标题\n> - 列表\n> > 嵌套引用', 1, 'callout-tip', '> [!tip]- 标题\n> - 列表\n> > 嵌套引用'],
    ['无标题 callout 标题入口转引用', '> [!note]\n> 内容一\n> 内容二', 1, 'blockquote', '> 内容一\n> 内容二'],
    ['callout 标题入口转文本保留内层 Markdown', '> [!note] 标题\n> - 列表\n> > 内层引用', 1, 'paragraph', '标题\n- 列表\n> 内层引用'],
    ['完整引用选区转 callout', '> - a\n> - b\n>\n> > 内层引用', 2, 'callout-warning', '> [!warning]\n> - a\n> - b\n>\n> > 内层引用', 'all'],
    ['嵌套围栏包装', '```md\n# 标题\n```', 2, 'callout-note', '> [!note]\n> ```md\n> # 标题\n> ```'],
    ['代码转文本保留字面标记', '```md\n# 字面标题\n- 字面列表\n```', 2, 'paragraph', '# 字面标题\n- 字面列表'],
    ['缩进代码解包', '    # 字面标题\n      续行\n- 外部列表', 2, 'paragraph', '# 字面标题\n  续行\n- 外部列表'],
    ['未闭合代码保留较短围栏正文', '````md\n正文\n```', 2, 'paragraph', '正文\n```'],
    ['公式转文本', '$$\nx+y\n$$', 2, 'paragraph', 'x+y'],
    ['setext 转 ATX', '标题\n===\n正文', 1, 'h2', '## 标题\n正文'],
    ['任务保留完成状态', '- [x] 完成\n- [ ] 待办', 1, 'todo', '- [x] 完成\n- [ ] 待办', 'all'],
    ['多行注释转换', 'a\nb', 1, 'comment', '%%\na\nb\n%%', 'all'],
];
for (const [name, doc, line, target, expected, selectionMode] of transforms) {
    test(`块转换：${name}`, () => {
        let selection;
        if (selectionMode === 'all') selection = { anchor: 0, head: doc.length };
        if (selectionMode === 'reverse') selection = { anchor: doc.length, head: 0 };
        if (selectionMode === 'next-line') selection = { anchor: 0, head: doc.lastIndexOf('\n') + 1 };
        const view = editor(doc, selection);
        transformLine(view, line, target);
        assert.equal(view.state.doc.toString(), expected);
    });
}

test('callout 正文默认当前源行', () => {
    assert.equal(draggedText('> [!note]\n> 内容\n> 后续行\n- 项目', 2), '> 内容');
});

test('落点不插入代码围栏内部', () => {
    const { manager } = dragFixture('开头\n```md\n内容\n```\n结尾');
    manager.startDrag(1, { clientX: 0, clientY: 0 });
    manager.updateIndicator(3, 41);
    assert.equal(manager.currentTargetLine, 2);
    manager.updateIndicator(3, 59);
    assert.equal(manager.currentTargetLine, 5);
    manager.onunload();
});

for (const [name, doc, source, target, expected, whole] of [
    ['选择末尾引用整块移到开头', '> [!note]\n> 内容\n- 项目\n> 引用', 4, 1, '> 引用\n> [!note]\n> 内容\n- 项目', true],
    ['末块放回末尾无变化', '开头\n- 项目', 2, 3, '开头\n- 项目'],
    ['选择整段列表放回末尾无变化', '- 项目\n- 项目二', 1, 3, '- 项目\n- 项目二', true],
    ['callout 移到末尾', '> [!note]\n> 内容\n- 项目\n正文', 1, 5, '- 项目\n正文\n> [!note]\n> 内容'],
]) {
    test(`块移动：${name}`, () => {
        const { view, manager } = dragFixture(doc);
        if (whole) selectWholeBlock(view, source);
        manager.startDrag(source, { clientX: 0, clientY: 0 });
        manager.moveBlock(manager.startBlock, target);
        assert.equal(view.state.doc.toString(), expected);
        manager.onunload();
    });
}

for (const [name, doc, target, expected] of [
    ['空行转标题', '', 'h1', '# '],
    ['空行转任务', '', 'todo', '- [ ] '],
    ['正文标记只移除一层', '# - 保留字面列表', 'bullet', '- - 保留字面列表'],
    ['列表内注释标记保留', '- %%注释标记%%', 'paragraph', '%%注释标记%%'],
    ['空行不消耗列表编号', 'a\n\nb', 'numbered', '1. a\n\n2. b'],
    ['重复代码转换保留语言', '```js\nconst a = 1;\n```', 'code', '```js\nconst a = 1;\n```'],
]) {
    test(`转换内容：${name}`, () => {
        const view = editor(doc, doc ? { anchor: 0, head: doc.length } : undefined);
        transformLine(view, 1, target);
        assert.equal(view.state.doc.toString(), expected);
    });
}

function structuredMove(text, sourceLine, targetLine, { after = true, inside = true, indent = 0, quoteOnly = false, selection } = {}) {
    const view = editor(text, selection);
    const source = getBlockSource(view.state, sourceLine);
    const target = getDropTarget(view.state.doc, targetLine, after, inside, indent, quoteOnly);
    const edit = getDropEdit(view.state.doc, source, target);
    if (edit) view.dispatch(edit);
    return { text: view.state.doc.toString(), view, source, target, edit };
}

for (const [name, text, source, target, options, expected] of [
    ['引用中间后插入不增加空行', '正文\n\n> a\n> b\n> c', 1, 4, {}, '\n> a\n> b\n> 正文\n> c'],
    ['引用中间前插入不增加空行', '正文\n\n> a\n> b\n> c', 1, 4, { after: false }, '\n> a\n> 正文\n> b\n> c'],
    ['引用开头插入不增加空行', '正文\n\n> a\n> b', 1, 3, { after: false }, '\n> 正文\n> a\n> b'],
    ['引用末尾插入不增加空行', '正文\n\n> a\n> b', 1, 4, {}, '\n> a\n> b\n> 正文'],
    ['callout 中间插入不增加空行', '正文\n\n> [!note]\n> a\n> b\n> c', 1, 5, {}, '\n> [!note]\n> a\n> b\n> 正文\n> c'],
    ['嵌套引用插入不增加空行', '正文\n\n> [!note]\n> > a\n> > b\n> > c', 1, 5, {}, '\n> [!note]\n> > a\n> > b\n> > 正文\n> > c'],
    ['目标原有后空行保留', '正文\n\n> a\n>\n> b', 1, 3, {}, '\n> a\n> 正文\n>\n> b'],
    ['目标原有前空行保留', '正文\n\n> a\n>\n> b', 1, 4, {}, '\n> a\n>\n> 正文\n> b'],
    ['源选区内空行保留', '第一段\n\n第二段\n\n> a\n> b', 1, 5, { selection: { anchor: 0, head: 8 } }, '\n> a\n> 第一段\n> \n> 第二段\n> b'],
    ['代码拖入保留围栏且不补空行', '```js\nx\n```\n\n> a\n> b', 2, 5, {}, '\n> a\n> ```js\n> x\n> ```\n> b'],
    ['公式拖入保留整块且不补空行', '$$\nx\n$$\n\n> a\n> b', 2, 5, {}, '\n> a\n> $$\n> x\n> $$\n> b'],
]) {
    test(`引用间距回归：${name}`, () => {
        const result = structuredMove(text, source, target, options);
        assert.equal(result.text, expected);
    });
}

for (const [name, text, source, target, options, expected] of [
    ['引用非首行只拖当前行', '> a\n> b\n> c\n\n尾段', 2, 5, { inside: false }, '> a\n> c\n\n尾段\nb'],
    ['两行引用拖出第二行保留首行', '> a\n> b\n\n尾段', 2, 4, { inside: false }, '> a\n\n尾段\nb'],
    ['引用中间插入', '正文\n\n> a\n> b\n> c', 1, 4, {}, '\n> a\n> b\n> 正文\n> c'],
    ['callout 中间插入', '正文\n\n> [!note]\n> a\n> b\n> c', 1, 5, {}, '\n> [!note]\n> a\n> b\n> 正文\n> c'],
    ['callout 中间行前插入', '正文\n\n> [!note]\n> a\n> b\n> c', 1, 5, { after: false }, '\n> [!note]\n> a\n> 正文\n> b\n> c'],
    ['列表中间插入同级项', '正文\n\n- a\n- b\n- c\n- d', 1, 4, {}, '\n- a\n- b\n- 正文\n- c\n- d'],
    ['callout 列表中间插入引用内容', '正文\n\n> [!note]\n> - a\n> - b\n> - c', 1, 5, { quoteOnly: true }, '\n> [!note]\n> - a\n> - b\n> 正文\n> - c'],
]) {
    test(`行拖拽回归：${name}`, () => {
        const result = structuredMove(text, source, target, options);
        assert.equal(result.text, expected);
    });
}

for (const [name, doc, line, expected, selected] of [
    ['首项只拖当前项', '- a\n- b\n  - c', 1, '- a'],
    ['其他项带走续行和子树', '- a\n- b\n  续行\n  - c\n    - d\n- e', 2, '- b\n  续行\n  - c\n    - d'],
    ['续行拖所属逻辑项', '- a\n- b\n  续行\n  - c\n- d', 3, '- b\n  续行\n  - c'],
    ['首项选区可单独拖', '- a\n- b\n- c', 1, '- a', [0, 3]],
    ['多项选区保留子树', '- a\n- b\n  - c\n- d', 1, '- a\n- b\n  - c', [0, 7]],
    ['反向选区同样接管', '- a\n- b\n- c', 2, '- a\n- b', [7, 0]],
    ['选区排除下一行行首', '- a\n- b\n- c', 1, '- a', [0, 4]],
    ['引用首行只拖当前正文', '> a\n> b\n> c', 1, 'a'],
    ['引用正文当前行去外层前缀', '> a\n> b\n> c', 2, 'b'],
    ['callout 正文当前行去外层前缀', '> [!note]\n> a\n> b\n>\n> - c', 3, 'b'],
    ['callout 首个正文行独立于标题', '> [!note]\n> a\n> b', 2, 'a'],
    ['嵌套引用正文当前行', '> [!note]\n> > a\n> > b\n> > c', 3, 'b'],
    ['引用部分选区只带选中行', '> a\n> b\n> c\n> d', 2, 'b\nc', [4, 11]],
    ['引用首行选区优先于整块', '> a\n> b\n> c', 1, 'a', [0, 3]],
    ['引用代码仍保持整块', '> a\n> ```js\n> x\n> y\n> ```\n> b', 4, '```js\nx\ny\n```'],
    ['callout 中列表首项只拖当前项', '> [!note]\n> - a\n> - b\n> 末段', 2, '- a'],
    ['callout 中其他列表项', '> [!note]\n> - a\n> - b\n>   - c', 3, '- b\n  - c'],
    ['嵌套引用首行只拖当前正文', '> [!note]\n> > a\n> > b', 2, 'a'],
    ['列表中的代码保持整块', '- a\n- b\n  ```md\n  - literal\n  ```\n- c', 4, '```md\n- literal\n```'],
    ['callout 中表格保持整块', '> [!note]\n> | a |\n> | - |\n> | b |', 3, '| a |\n| - |\n| b |'],
    ['多项选区去除共同引用外层', '> [!note]\n> - a\n> - b\n> - c', 2, '- a\n- b', [10, 22]],
    ['代码作为列表项首内容时带上后续子树', '- a\n- ```js\n  x\n  ```\n  - c\n- d', 3, '- ```js\n  x\n  ```\n  - c'],
    ['列表中 callout 正文优先最近容器', '- a\n- > [!note]\n  > p\n  >\n  > q\n- b', 3, 'p'],
    ['列表项首 callout 带走后续子项', '- a\n- > [!note]\n  > p\n  - c\n- d', 2, '- > [!note]\n  > p\n  - c'],
]) {
    test(`结构化源：${name}`, () => {
        const selection = selected ? { anchor: selected[0], head: selected[1] } : undefined;
        const source = getBlockSource(editor(doc, selection).state, line);
        assert.equal(source.content, expected);
    });
}

for (const [name, text, source, target, options, expected] of [
    ['列表中调换行', '- a\n- b\n- c', 3, 1, {}, '- a\n- c\n- b'],
    ['第一项选区移至尾部', '- a\n- b\n- c', 1, 3, { selection: { anchor: 0, head: 3 } }, '- b\n- c\n- a'],
    ['跨列表换型保留子树', '- a\n- b\n  - child\n\n5. x\n6. y', 2, 5, {}, '- a\n\n5. x\n6. b\n   - child\n7. y'],
    ['普通段落成为同级项', '正文\n第二行\n\n- a\n- b', 1, 4, {}, '\n- a\n- 正文\n  第二行\n- b'],
    ['右移成为子项', '- a\n- b\n  - c\n- d', 2, 1, { indent: 1 }, '- a\n  - b\n    - c\n- d'],
    ['普通块成为列表子项', '正文\n\n- a\n- b', 1, 3, { indent: 1 }, '\n- a\n  - 正文\n- b'],
    ['子项左移一层', '- a\n  - b\n  - c\n- d', 3, 2, { indent: -1 }, '- a\n  - b\n- c\n- d'],
    ['父项移动带上全部后代', '- a\n- b\n  - c\n    - d\n- e', 2, 1, { after: false }, '- b\n  - c\n    - d\n- a\n- e'],
    ['编号列表保留起始编号', '5. a\n6. b\n7. c', 3, 1, {}, '5. a\n6. c\n7. b'],
    ['移除首项后保持起始编号', '5. a\n6. b\n7. c\n\n尾段', 1, 5, { selection: { anchor: 0, head: 4 }, inside: false }, '5. b\n6. c\n\n尾段\n5. a'],
    ['编号跨位数调整续行缩进', '- b\n  - child\n\n9. a\n10. z', 1, 4, {}, '\n9. a\n10. b\n    - child\n11. z'],
    ['编号括号样式保持', '3) a\n4) b\n5) c', 3, 1, {}, '3) a\n4) c\n5) b'],
    ['checkbox 状态进入编号仍保留', '- [x] 完成\n\n4. a\n5. b', 1, 3, {}, '\n4. a\n5. [x] 完成\n6. b'],
    ['普通块进入任务列表默认未完成', '正文\n\n- [x] a\n- [ ] b', 1, 3, {}, '\n- [x] a\n- [ ] 正文\n- [ ] b'],
    ['拖入 callout', '正文\n\n> [!note]\n> a\n>\n> b', 1, 4, {}, '\n> [!note]\n> a\n> 正文\n>\n> b'],
    ['完整列表选区拖入引用保留结构', '- a\n- b\n\n> x\n>\n> y', 1, 4, { selection: { anchor: 0, head: 7 } }, '\n> x\n> - a\n> - b\n>\n> y'],
    ['代码进入列表保持围栏', '```js\nconst x = 1;\n```\n\n- a\n- b', 2, 5, {}, '\n- a\n- ```js\n  const x = 1;\n  ```\n- b'],
    ['表格进入列表保持一个逻辑项', '| a |\n| - |\n| b |\n\n- a\n- b', 2, 5, {}, '\n- a\n- | a |\n  | - |\n  | b |\n- b'],
    ['公式进入 callout 完整', '$$\nx+y\n$$\n\n> [!note]\n> a', 2, 6, {}, '\n> [!note]\n> a\n> $$\n> x+y\n> $$'],
    ['拖出 callout 去除包装', '> [!note]\n> - a\n> - b\n\n尾段', 3, 5, { inside: false }, '> [!note]\n> - a\n\n尾段\n- b'],
    ['callout 内容进入列表同级', '> [!note]\n> 内容\n\n- a\n- b', 2, 4, {}, '> [!note]\n\n- a\n- 内容\n- b'],
    ['列表项进入 callout 内列表', '- a\n- b\n\n> [!note]\n> 3. x\n> 4. y', 2, 5, {}, '- a\n\n> [!note]\n> 3. x\n> 4. b\n> 5. y'],
    ['整个 callout 嵌入另一 callout', '> [!tip]- 标题\n> 内容\n\n> [!note]\n> a', 1, 5, {}, '\n> [!note]\n> a\n> > [!tip]- 标题\n> > 内容'],
    ['代码拖出列表去除缩进', '- a\n- b\n  ```js\n  x\n  ```\n\n尾段', 4, 7, { inside: false }, '- a\n- b\n\n尾段\n```js\nx\n```'],
    ['列表外侧保持原块类型并阻止懒续行', '正文\n\n- a\n- b', 1, 4, { inside: false }, '\n- a\n- b\n\n正文'],
    ['完整引用选区外侧保持独立引用', '> a\n\n> b\n> c', 1, 4, { inside: false, selection: { anchor: 0, head: 3 } }, '\n> b\n> c\n\n> a'],
    ['未变动的嵌套编号保持原样', '- a\n- b\n  8. child\n  10. gap\n- c', 2, 1, {}, '- a\n- b\n  8. child\n  10. gap\n- c'],
    ['新子编号从一开始', '5. a\n6. b\n7. c', 3, 1, { indent: 1 }, '5. a\n   1. c\n6. b'],
    ['加入已有子列表沿用该列表类型和编号', '- a\n  4. child\n  5. next\n- b\n- c', 5, 1, { indent: 1 }, '- a\n  4. child\n  5. next\n  6. c\n- b'],
    ['普通列表进入已完成任务仍默认未完成', '- a\n\n- [x] done\n- [ ] next', 1, 3, {}, '\n- [x] done\n- [ ] a\n- [ ] next'],
    ['空行可成为空列表项', '\n- a\n- b', 1, 2, {}, '- a\n- \n- b'],
    ['引用无空格前缀的编号跨位数保持层级', '- b\n  - child\n\n>[!note]\n>9. a\n>10. z', 1, 5, {}, '\n>[!note]\n>9. a\n> 10. b\n>     - child\n>11. z'],
]) {
    test(`结构化落点：${name}`, () => {
        const actual = structuredMove(text, source, target, options);
        assert.equal(actual.text, expected);
        if (actual.edit) assert.equal(actual.view.state.doc.sliceString(actual.view.state.selection.main.from, actual.view.state.selection.main.to)
            .includes(actual.source.content.split('\n')[0].replace(/^(?:[-+*]|\d+[.)])\s+(?:\[[^\]]\]\s+)?/, '')), true);
    });
}

test('禁止整段列表拖入自身或父项拖入子项', () => {
    for (const [line, target] of [[1, 2], [2, 3]]) {
        const view = editor('- a\n- b\n  - c\n- d');
        if (line === 1) selectWholeBlock(view, line);
        const state = view.state;
        const source = getBlockSource(state, line);
        const drop = getDropTarget(state.doc, target, true, true, 1);
        assert.equal(canDrop(source, drop), false);
        assert.equal(getDropEdit(state.doc, source, drop), null);
    }
});

test('拖动期间文档改变则取消，防止使用过期范围', () => {
    const state = editor('- a\n- b\n\n尾段').state;
    const source = getBlockSource(state, 2), drop = getDropTarget(state.doc, 4, true, false);
    const changed = state.update({ changes: { from: 0, insert: 'x' } }).state;
    assert.equal(getDropEdit(changed.doc, source, drop), null);
});

test('围栏中看似容器的内容不是容器落点', () => {
    const doc = editor('```md\n> [!note]\n- a\n```\n末段').state.doc;
    assert.equal(getDropTarget(doc, 3, true, true, 1).mode, 'outside');
    assert.equal(getDragPath(doc, 3).length, 1);
});

for (const [name, text, line, selected, expected] of [
    ['列表首项只带当前项', '- a\n- b\n- c', 1, null, '- a'],
    ['引用首行只带当前正文', '> a\n> b\n> c', 1, null, 'a'],
    ['嵌套引用首行只带当前正文', '> [!note]\n> > a\n> > b', 2, null, 'a'],
    ['完整引用选区保留容器', '> a\n> b\n> c', 2, [0, 11], '> a\n> b\n> c'],
    ['普通段落选区不扩到未选行', 'a\nb\nc', 2, [2, 3], 'b'],
    ['原子块部分选区扩到整块', '```js\nx\ny\n```\n尾段', 3, [8, 9], '```js\nx\ny\n```'],
]) {
    test(`统一范围：${name}`, () => {
        const selection = selected ? { anchor: selected[0], head: selected[1] } : undefined;
        assert.equal(getBlockSource(editor(text, selection).state, line).content, expected);
    });
}

for (const [name, text, line, target, selection, expected] of [
    ['引用首行只转换正文并保留外层', '> a\n> b\n> c', 1, 'h2', null, '> ## a\n> b\n> c'],
    ['callout 中间正文只转换当前行', '> [!note]\n> a\n> b\n> c', 3, 'bullet', null, '> [!note]\n> a\n> - b\n> c'],
    ['普通段落与拖拽范围一致', 'a\nb\n- c', 2, 'blockquote', null, '> a\n> b\n- c'],
    ['完整引用选区转换整个容器', '> a\n> b', 2, 'callout-tip', { anchor: 0, head: 7 }, '> [!tip]\n> a\n> b'],
    ['引用内列表转换保留容器', '> - a\n> - b\n> - c', 2, 'numbered', null, '> - a\n> 1. b\n> - c'],
]) {
    test(`统一转换：${name}`, () => {
        const view = editor(text, selection ?? undefined);
        transformLine(view, line, target);
        assert.equal(view.state.doc.toString(), expected);
    });
}

for (const [name, text, line, expected] of [
    ['列表中任意项选择整段列表', '- a\n- b\n  - child\n- c\n\n尾段', 2, '- a\n- b\n  - child\n- c'],
    ['callout 正文选择标题和全部内容', '> [!note]- 标题\n> a\n> b\n\n尾段', 3, '> [!note]- 标题\n> a\n> b'],
    ['引用正文选择完整引用', '> a\n> b\n\n尾段', 2, '> a\n> b'],
    ['嵌套列表选择最近列表', '- a\n  - b\n  - c\n- d', 3, '  - b\n  - c'],
    ['嵌套引用选择最近容器', '> [!note]\n> > a\n> > b\n> 尾行', 3, '> > a\n> > b'],
    ['列表首内容为 callout 时选择依赖该项的子树', '- a\n- > [!note]\n  > p\n  - child\n- b', 3, '- > [!note]\n  > p\n  - child'],
    ['代码块选择完整围栏', '```js\nx\n```\n尾段', 2, '```js\nx\n```'],
]) {
    test(`选择整个块：${name}`, () => {
        const view = editor(text);
        selectWholeBlock(view, line);
        const selected = view.state.selection.main;
        assert.equal(view.state.doc.sliceString(selected.from, selected.to), expected);
        assert.equal(view.state.doc.toString(), text);
        assert.equal(getBlockSource(view.state, line).text, expected);
    });
}

test('选择整个列表后，首项与其他项都移动完整容器', () => {
    const view = editor('- a\n- b\n\n> x\n> y');
    selectWholeBlock(view, 2);
    const source = getBlockSource(view.state, 1);
    assert.equal(getBlockSource(view.state, 2).content, source.content);
    const edit = getDropEdit(view.state.doc, source, getDropTarget(view.state.doc, 4, true, true));
    view.dispatch(edit);
    assert.equal(view.state.doc.toString(), '\n> x\n> - a\n> - b\n> y');
});

test('选区内的列表续段仍携带所属项及子树', () => {
    const text = '- a\n\n  续段\n  - child\n- b';
    const view = editor(text, { anchor: 7, head: 9 });
    assert.equal(getBlockSource(view.state, 3).content, '- a\n\n  续段\n  - child');
});

for (const [name, text, line, target, selected, expected] of [
    ['列表换型保留代码与子树并调整缩进', '- a\n  ```js\n  - literal\n  ```\n  - child\n- b', 1, 'numbered', null, '1. a\n   ```js\n   - literal\n   ```\n   - child\n- b'],
    ['父项转标题保留后代内容', '- a\n  - child\n- b', 1, 'h2', null, '## a\n- child\n- b'],
    ['引用中的父项换型保留子代码', '> - a\n>   ```js\n>   x\n>   ```\n> - b', 1, 'numbered', null, '> 1. a\n>    ```js\n>    x\n>    ```\n> - b'],
    ['部分代码选区转文本不留下围栏', '```js\nx\ny\n```\n尾段', 3, 'paragraph', { anchor: 8, head: 9 }, 'x\ny\n尾段'],
    ['正文部分选区只转换选中源行', 'a\nb\nc', 2, 'bullet', { anchor: 2, head: 3 }, 'a\n- b\nc'],
    ['callout 标题部分选区保护整个容器', '> [!note]- 标题\n> a\n> b', 1, 'callout-tip', { anchor: 2, head: 7 }, '> [!tip]- 标题\n> a\n> b'],
    ['嵌套 callout 改类型保留外层引用', '> [!note]\n> > [!tip]- 内层\n> > a\n> 尾行', 2, 'callout-warning', null, '> [!note]\n> > [!warning]- 内层\n> > a\n> 尾行'],
    ['无选区的项首注释保留字面标记', '- %%注释标记%%', 1, 'paragraph', null, '%%注释标记%%'],
]) {
    test(`结构保护转换：${name}`, () => {
        const view = editor(text, selected ?? undefined);
        transformLine(view, line, target);
        assert.equal(view.state.doc.toString(), expected);
    });
}

for (const [name, text, line, expected] of [
    ['首项注释仍归属列表项', '- %%literal%%\n- next', 1, '- %%literal%%'],
    ['其他项注释仍归属列表项', '- first\n- %%literal%%\n- next', 2, '- %%literal%%'],
    ['项首完整代码不丢列表标记', '- ```js\n  x\n  ```\n- next', 2, '- ```js\n  x\n  ```'],
    ['项首标题仍归属列表项', '- # heading\n- next', 1, '- # heading'],
]) {
    test(`首内容结构归属：${name}`, () => assert.equal(getBlockSource(editor(text).state, line).content, expected));
}
