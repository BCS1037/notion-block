import {
	ViewUpdate,
	PluginValue,
	EditorView,
	ViewPlugin,
	Decoration,
	DecorationSet,
	PluginSpec,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNodeRef } from '@lezer/common';
import { ExampleWidget } from './widget';

// ============================================================
// View Plugin — 基于语法树的装饰
// ============================================================

class HighlightPlugin implements PluginValue {
	decorations: DecorationSet;

	constructor(view: EditorView) {
		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate) {
		if (update.docChanged || update.viewportChanged) {
			this.decorations = this.buildDecorations(update.view);
		}
	}

	/**
	 * 遍历可见范围内的语法树节点，为列表项添加装饰。
	 * 可根据需求替换为其他节点类型的匹配逻辑。
	 */
	buildDecorations(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();

		for (const { from, to } of view.visibleRanges) {
			syntaxTree(view.state).iterate({
				from,
				to,
				enter(node: SyntaxNodeRef) {
					// 示例：为列表标记符号添加 widget 装饰
					if (node.type.name.startsWith('list')) {
						const listCharFrom = node.from - 2;
						if (listCharFrom >= 0) {
							builder.add(
								listCharFrom,
								listCharFrom + 1,
								Decoration.replace({
									widget: new ExampleWidget(),
								})
							);
						}
					}
				},
			});
		}

		return builder.finish();
	}

	destroy() {
		// 清理资源
	}
}

// ============================================================
// 导出扩展
// ============================================================

const pluginSpec: PluginSpec<HighlightPlugin> = {
	decorations: (value: HighlightPlugin) => value.decorations,
};

export const highlightExtension = ViewPlugin.fromClass(HighlightPlugin, pluginSpec);
