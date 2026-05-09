var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => NotionBlock
});
module.exports = __toCommonJS(main_exports);
var import_obsidian5 = require("obsidian");

// src/settings.ts
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  enabled: true,
  dragGranularity: "line",
  hoverDelay: 0,
  hideDelay: 200,
  dateFormat: "YYYY-MM-DD",
  timeFormat: "HH:mm"
};
var BlockPluginSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Enable plugin").setDesc("Enable or disable the block plugin.").addToggle((toggle) => toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
      this.plugin.settings.enabled = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Drag granularity").setDesc("Switch between line mode and paragraph mode.").addDropdown((dropdown) => dropdown.addOption("line", "Line mode").addOption("paragraph", "Paragraph mode").setValue(this.plugin.settings.dragGranularity).onChange(async (value) => {
      this.plugin.settings.dragGranularity = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Button hover delay").setDesc("Delay (ms) before showing handles.").addSlider((slider) => slider.setLimits(0, 500, 50).setValue(this.plugin.settings.hoverDelay).setDynamicTooltip().onChange(async (value) => {
      this.plugin.settings.hoverDelay = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Button hide delay").setDesc("Delay (ms) before hiding handles.").addSlider((slider) => slider.setLimits(0, 1e3, 50).setValue(this.plugin.settings.hideDelay).setDynamicTooltip().onChange(async (value) => {
      this.plugin.settings.hideDelay = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Date format").setDesc("Format for Today/Yesterday/Tomorrow.").addText((text) => text.setPlaceholder("YYYY-MM-DD").setValue(this.plugin.settings.dateFormat).onChange(async (value) => {
      this.plugin.settings.dateFormat = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Time format").setDesc("Format for Current time.").addText((text) => text.setPlaceholder("HH:mm").setValue(this.plugin.settings.timeFormat).onChange(async (value) => {
      this.plugin.settings.timeFormat = value;
      await this.plugin.saveSettings();
    }));
  }
};

// src/blockHandles.ts
var import_view = require("@codemirror/view");
var import_obsidian4 = require("obsidian");

// src/blockMenu.ts
var import_obsidian3 = require("obsidian");

// src/blockTransform.ts
var import_obsidian2 = require("obsidian");
function stripPrefix(lineText) {
  return lineText.replace(/^#{1,6} /, "").replace(/^[-*+] \[[ x]\] /, "").replace(/^[-*+] /, "").replace(/^\d+\. /, "").replace(/^> \[!\w+\]\n?> ?/, "").replace(/^> /, "").replace(/^%%(.*)%%$/, "$1").trim();
}
function transformLine(view, lineNo, targetType) {
  const line = view.state.doc.line(lineNo);
  const lineText = line.text;
  const content = stripPrefix(lineText);
  let newText = "";
  if (targetType.startsWith("callout-")) {
    const type = targetType.replace("callout-", "");
    newText = `> [!${type}]
> ${content}`;
  } else {
    switch (targetType) {
      case "h1":
        newText = "# " + content;
        break;
      case "h2":
        newText = "## " + content;
        break;
      case "h3":
        newText = "### " + content;
        break;
      case "bullet":
        newText = "- " + content;
        break;
      case "numbered":
        newText = "1. " + content;
        break;
      case "todo":
        newText = "- [ ] " + content;
        break;
      case "blockquote":
        newText = "> " + content;
        break;
      case "paragraph":
        newText = content;
        break;
      case "code":
        newText = "```\n" + content + "\n```";
        break;
      case "math":
        newText = "$$\n" + content + "\n$$";
        break;
      case "divider":
        newText = "---";
        break;
      default:
        newText = content;
        break;
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
function insertBlock(plugin, view, lineNo, targetType) {
  const line = view.state.doc.line(lineNo);
  const settings = plugin.settings;
  let insertText = "";
  let cursorOffset = 0;
  let isMetadata = false;
  let customPos = null;
  if (targetType.startsWith("callout-")) {
    const type = targetType.replace("callout-", "");
    insertText = `> [!${type}]
> `;
    cursorOffset = insertText.length;
  } else {
    switch (targetType) {
      case "h1":
        insertText = "# ";
        break;
      case "h2":
        insertText = "## ";
        break;
      case "h3":
        insertText = "### ";
        break;
      case "bullet":
        insertText = "- ";
        break;
      case "numbered":
        insertText = "1. ";
        break;
      case "todo":
        insertText = "- [ ] ";
        break;
      case "blockquote":
        insertText = "> ";
        break;
      case "paragraph":
        insertText = "";
        break;
      case "code":
        insertText = "```\n\n```";
        cursorOffset = 4;
        break;
      case "math":
        insertText = "$$\n\n$$";
        cursorOffset = 3;
        break;
      case "divider":
        insertText = "---\n";
        break;
      case "link":
        insertText = "[[]]";
        cursorOffset = 2;
        break;
      case "ext-link":
        insertText = "[]()";
        cursorOffset = 1;
        break;
      case "embed":
        insertText = "![[]]";
        cursorOffset = 3;
        break;
      case "tag":
        insertText = "#";
        cursorOffset = 1;
        break;
      case "comment":
        insertText = "%%  %%";
        cursorOffset = 3;
        break;
      case "today":
        insertText = (0, import_obsidian2.moment)().format(settings.dateFormat);
        break;
      case "yesterday":
        insertText = (0, import_obsidian2.moment)().subtract(1, "days").format(settings.dateFormat);
        break;
      case "tomorrow":
        insertText = (0, import_obsidian2.moment)().add(1, "days").format(settings.dateFormat);
        break;
      case "time":
        insertText = (0, import_obsidian2.moment)().format(settings.timeFormat);
        break;
      case "table":
        insertText = "| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |";
        cursorOffset = 23;
        break;
      case "frontmatter":
        isMetadata = true;
        const firstLine = view.state.doc.line(1);
        if (firstLine.text === "---") {
          return;
        }
        insertText = "---\n\n---\n";
        customPos = 0;
        cursorOffset = 4;
        break;
      case "footnote":
        const footnoteId = Math.floor(Math.random() * 1e3);
        insertText = `[^${footnoteId}]`;
        const docEnd = view.state.doc.length;
        view.dispatch({
          changes: { from: docEnd, insert: `

[^${footnoteId}]: ` }
        });
        break;
      default:
        insertText = "";
        break;
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

// src/blockMenu.ts
function showTransformMenu(app, view, lineNo, event) {
  const menu = new import_obsidian3.Menu();
  menu.addItem(
    (item) => item.setTitle("Text").setIcon("pilcrow").onClick(() => transformLine(view, lineNo, "paragraph"))
  );
  menu.addSeparator();
  menu.addItem(
    (item) => item.setTitle("Heading 1").setIcon("heading-1").onClick(() => transformLine(view, lineNo, "h1"))
  );
  menu.addItem(
    (item) => item.setTitle("Heading 2").setIcon("heading-2").onClick(() => transformLine(view, lineNo, "h2"))
  );
  menu.addItem(
    (item) => item.setTitle("Heading 3").setIcon("heading-3").onClick(() => transformLine(view, lineNo, "h3"))
  );
  menu.addSeparator();
  menu.addItem(
    (item) => item.setTitle("Bullet list").setIcon("list").onClick(() => transformLine(view, lineNo, "bullet"))
  );
  menu.addItem(
    (item) => item.setTitle("Numbered list").setIcon("list-ordered").onClick(() => transformLine(view, lineNo, "numbered"))
  );
  menu.addItem(
    (item) => item.setTitle("Todo list").setIcon("check-square").onClick(() => transformLine(view, lineNo, "todo"))
  );
  menu.addItem(
    (item) => item.setTitle("Quote").setIcon("quote").onClick(() => transformLine(view, lineNo, "blockquote"))
  );
  menu.addItem(
    (item) => item.setTitle("Code block").setIcon("code").onClick(() => transformLine(view, lineNo, "code"))
  );
  menu.addItem(
    (item) => item.setTitle("Math block").setIcon("sigma").onClick(() => transformLine(view, lineNo, "math"))
  );
  menu.addItem(
    (item) => item.setTitle("Divider").setIcon("minus").onClick(() => transformLine(view, lineNo, "divider"))
  );
  menu.addSeparator();
  menu.addItem((item) => {
    const sub = item.setSubmenu();
    item.setTitle("Callout").setIcon("megaphone");
    const calloutTypes = ["note", "info", "todo", "tip", "success", "question", "warning", "failure", "danger", "bug", "example", "quote"];
    calloutTypes.forEach((type) => {
      sub.addItem((subItem) => {
        subItem.setTitle(type.charAt(0).toUpperCase() + type.slice(1)).onClick(() => transformLine(view, lineNo, `callout-${type}`));
      });
    });
  });
  menu.showAtMouseEvent(event);
}
var ALL_BLOCKS = [
  { type: "paragraph", label: "Text", icon: "pilcrow" },
  { type: "h1", label: "Heading 1", icon: "heading-1" },
  { type: "h2", label: "Heading 2", icon: "heading-2" },
  { type: "h3", label: "Heading 3", icon: "heading-3" },
  { type: "bullet", label: "Bullet list", icon: "list" },
  { type: "numbered", label: "Numbered list", icon: "list-ordered" },
  { type: "todo", label: "Todo list", icon: "check-square" },
  { type: "blockquote", label: "Quote", icon: "quote" },
  { type: "code", label: "Code block", icon: "code" },
  { type: "math", label: "Math block", icon: "sigma" },
  { type: "divider", label: "Divider", icon: "minus" },
  { type: "callout-note", label: "Callout: Note", icon: "megaphone" },
  { type: "callout-info", label: "Callout: Info", icon: "info" },
  { type: "callout-tip", label: "Callout: Tip", icon: "sparkles" },
  { type: "callout-warning", label: "Callout: Warning", icon: "alert-triangle" },
  { type: "link", label: "Internal link", icon: "link" },
  { type: "ext-link", label: "External link", icon: "link-2" },
  { type: "embed", label: "Embed / Attachment", icon: "image" },
  { type: "tag", label: "Tag", icon: "tag" },
  { type: "footnote", label: "Footnote", icon: "hash" },
  { type: "comment", label: "Comment", icon: "message-square" },
  { type: "today", label: "Today", icon: "calendar" },
  { type: "time", label: "Current time", icon: "clock" },
  { type: "table", label: "Table", icon: "table" },
  { type: "frontmatter", label: "Frontmatter / Properties", icon: "settings" }
];
var BlockInsertModal = class extends import_obsidian3.FuzzySuggestModal {
  constructor(plugin, view, lineNo) {
    super(plugin.app);
    this.plugin = plugin;
    this.view = view;
    this.lineNo = lineNo;
    this.setPlaceholder("Type a block type...");
  }
  getItems() {
    return ALL_BLOCKS;
  }
  getItemText(item) {
    return item.label;
  }
  onChooseItem(item, evt) {
    insertBlock(this.plugin, this.view, this.lineNo, item.type);
  }
  renderSuggestion(match, el) {
    el.createDiv({ cls: "block-suggest-item" }, (div) => {
      div.createSpan({ cls: "block-suggest-icon" }).innerText = "\u2022";
      div.createSpan({ cls: "block-suggest-label" }).innerText = match.item.label;
    });
  }
};
function showInsertMenu(plugin, view, lineNo) {
  const modal = new BlockInsertModal(plugin, view, lineNo);
  modal.open();
}

// src/dragDrop.ts
var DragManager = class {
  constructor(plugin, view) {
    this.plugin = plugin;
    this.view = view;
    this.ghostEl = null;
    this.indicatorEl = null;
    this.isDragging = false;
    this.startBlock = null;
    this.currentTargetLine = null;
    this.onMouseMove = (event) => {
      if (!this.isDragging)
        return;
      this.updateGhostPosition(event.clientX, event.clientY);
      const pos = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos !== null) {
        const line = this.view.state.doc.lineAt(pos);
        this.currentTargetLine = line.number;
        this.updateIndicator(line.number, event.clientY);
      }
    };
    this.onMouseUp = (event) => {
      this.stopDrag();
    };
  }
  startDrag(lineNo, event) {
    this.isDragging = true;
    const doc = this.view.state.doc;
    let fromPos, toPos, text;
    if (this.plugin.settings.dragGranularity === "paragraph") {
      let startLine = lineNo;
      while (startLine > 1 && doc.line(startLine - 1).text.trim() !== "") {
        startLine--;
      }
      let endLine = lineNo;
      while (endLine < doc.lines && doc.line(endLine + 1).text.trim() !== "") {
        endLine++;
      }
      const startL = doc.line(startLine);
      const endL = doc.line(endLine);
      fromPos = startL.from;
      toPos = endL.to;
      text = doc.sliceString(fromPos, toPos);
    } else {
      const line = doc.line(lineNo);
      fromPos = line.from;
      toPos = line.to;
      text = line.text;
    }
    this.startBlock = { from: fromPos, to: toPos, text };
    this.ghostEl = document.body.createEl("div", {
      cls: "block-drag-ghost",
      text: text.slice(0, 50) + (text.length > 50 ? "..." : "")
    });
    this.updateGhostPosition(event.clientX, event.clientY);
    this.indicatorEl = document.body.createEl("div", {
      cls: "block-drag-indicator"
    });
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mouseup", this.onMouseUp);
    document.body.addClass("is-dragging-block");
  }
  stopDrag() {
    if (!this.isDragging)
      return;
    if (this.startBlock !== null && this.currentTargetLine !== null) {
      this.moveBlock(this.startBlock, this.currentTargetLine);
    }
    this.isDragging = false;
    this.startBlock = null;
    this.currentTargetLine = null;
    if (this.ghostEl) {
      this.ghostEl.remove();
      this.ghostEl = null;
    }
    if (this.indicatorEl) {
      this.indicatorEl.remove();
      this.indicatorEl = null;
    }
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mouseup", this.onMouseUp);
    document.body.removeClass("is-dragging-block");
  }
  updateGhostPosition(x, y) {
    if (this.ghostEl) {
      this.ghostEl.setCssStyles({
        left: `${x + 10}px`,
        top: `${y + 10}px`
      });
    }
  }
  updateIndicator(lineNo, mouseY) {
    if (!this.indicatorEl)
      return;
    const line = this.view.state.doc.line(lineNo);
    const coords = this.view.coordsAtPos(line.from);
    if (coords) {
      this.indicatorEl.setCssStyles({
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        width: `${this.view.contentDOM.clientWidth}px`,
        display: "block"
      });
    }
  }
  moveBlock(startBlock, toLineNo) {
    const doc = this.view.state.doc;
    const toLine = doc.line(toLineNo);
    if (toLine.from >= startBlock.from && toLine.to <= startBlock.to)
      return;
    const textToMove = startBlock.text;
    if (startBlock.from < toLine.from) {
      this.view.dispatch({
        changes: [
          { from: toLine.to, insert: "\n" + textToMove },
          { from: startBlock.from, to: Math.min(startBlock.to + 1, doc.length) }
        ],
        scrollIntoView: true,
        userEvent: "move.block"
      });
    } else {
      this.view.dispatch({
        changes: [
          { from: toLine.from, insert: textToMove + "\n" },
          { from: startBlock.from, to: Math.min(startBlock.to + 1, doc.length) }
        ],
        scrollIntoView: true,
        userEvent: "move.block"
      });
    }
  }
};

// src/blockHandles.ts
var BlockHandleWidget = class extends import_view.WidgetType {
  constructor(plugin, lineNo) {
    super();
    this.plugin = plugin;
    this.lineNo = lineNo;
  }
  toDOM(view) {
    const wrap = document.createElement("div");
    wrap.className = "block-handle-wrap";
    const addButton = wrap.createEl("div", { cls: "block-handle-button add-button", attr: { "aria-label": "Add block below" } });
    (0, import_obsidian4.setIcon)(addButton, "plus");
    const dragButton = wrap.createEl("div", { cls: "block-handle-button drag-button", attr: { "aria-label": "Drag to reorder" } });
    (0, import_obsidian4.setIcon)(dragButton, "grip-vertical");
    let dragTimeout = null;
    let isDragging = false;
    dragButton.onmousedown = (e) => {
      isDragging = false;
      dragTimeout = setTimeout(() => {
        isDragging = true;
        if (!this.dragManager) {
          this.dragManager = new DragManager(this.plugin, view);
        }
        this.dragManager.startDrag(this.lineNo, e);
      }, 150);
    };
    dragButton.onmouseup = (e) => {
      clearTimeout(dragTimeout);
      if (!isDragging) {
        showTransformMenu(this.plugin.app, view, this.lineNo, e);
      }
    };
    dragButton.onclick = (e) => {
      e.stopPropagation();
    };
    dragButton.oncontextmenu = (e) => {
      const menu = new import_obsidian4.Menu();
      menu.addItem((item) => {
        item.setTitle(this.plugin.settings.dragGranularity === "line" ? "Switch to paragraph mode" : "Switch to line mode").setIcon("layers").onClick(async () => {
          this.plugin.settings.dragGranularity = this.plugin.settings.dragGranularity === "line" ? "paragraph" : "line";
          await this.plugin.saveSettings();
        });
      });
      menu.showAtMouseEvent(e);
      e.preventDefault();
    };
    addButton.onclick = (e) => {
      showInsertMenu(this.plugin, view, this.lineNo);
    };
    return wrap;
  }
  ignoreEvent() {
    return false;
  }
};
var blockHandlesExtension = (plugin) => import_view.ViewPlugin.fromClass(class {
  constructor(view) {
    this.hoveredLine = null;
    this.hideTimeout = null;
    this.decorations = import_view.Decoration.none;
  }
  update(update) {
    if (update.docChanged || update.viewportChanged) {
      this.updateDecorations(update.view);
    }
  }
  updateDecorations(view) {
    if (this.hoveredLine === null) {
      this.decorations = import_view.Decoration.none;
      return;
    }
    const widgets = [];
    try {
      const line = view.state.doc.line(this.hoveredLine);
      widgets.push(import_view.Decoration.widget({
        widget: new BlockHandleWidget(plugin, line.number),
        side: -1
        // Place before the line
      }).range(line.from));
    } catch (e) {
    }
    this.decorations = import_view.Decoration.set(widgets);
  }
  handleMouseMove(view, event) {
    if (event.target.closest(".block-handle-wrap")) {
      if (this.hideTimeout) {
        clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }
      return;
    }
    const rect = view.contentDOM.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;
    if (x < rect.left - 100 || x > rect.right + 100 || y < rect.top || y > rect.bottom) {
      this.handleMouseLeave(view);
      return;
    }
    const targetX = Math.max(rect.left + 5, x);
    const pos = view.posAtCoords({ x: targetX, y });
    if (pos === null)
      return;
    try {
      const line = view.state.doc.lineAt(pos);
      if (this.hoveredLine !== line.number) {
        this.hoveredLine = line.number;
        this.updateDecorations(view);
        view.requestMeasure();
      }
      if (this.hideTimeout) {
        clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }
    } catch (e) {
    }
  }
  handleMouseLeave(view) {
    this.hideTimeout = setTimeout(() => {
      this.hoveredLine = null;
      this.updateDecorations(view);
      view.requestMeasure();
    }, plugin.settings.hideDelay);
  }
}, {
  decorations: (v) => v.decorations,
  eventHandlers: {
    mousemove(event, view) {
      this.handleMouseMove(view, event);
    },
    mouseleave(event, view) {
      this.handleMouseLeave(view);
    }
  }
});

// src/main.ts
var NotionBlock = class extends import_obsidian5.Plugin {
  async onload() {
    await this.loadSettings();
    this.registerEditorExtension([blockHandlesExtension(this)]);
    this.addSettingTab(new BlockPluginSettingTab(this.app, this));
    console.log("Block Plugin loaded");
  }
  onunload() {
    console.log("Block Plugin unloaded");
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.app.workspace.updateOptions();
  }
};
