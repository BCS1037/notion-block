import { EditorView, WidgetType } from '@codemirror/view';

// ============================================================
// Widget — 自定义内联小部件
// ============================================================

export class ExampleWidget extends WidgetType {
	toDOM(view: EditorView): HTMLElement {
		const ownerDocument = view.dom.ownerDocument as Document & {
			win: Window & { createSpan: () => HTMLSpanElement };
		};
		const span = ownerDocument.win.createSpan();
		span.innerText = '\u{1F449}'; // 👉
		span.className = '{{PLUGIN_ID}}-widget';
		return span;
	}

	/**
	 * 比较两个 widget 是否相同，避免不必要的 DOM 重建。
	 */
	eq(_other: ExampleWidget): boolean {
		return true;
	}
}
