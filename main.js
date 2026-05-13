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
    new import_obsidian.Setting(containerEl).setName("Date format").setDesc("Format for today/yesterday/tomorrow.").addText((text) => text.setPlaceholder("YYYY-MM-DD").setValue(this.plugin.settings.dateFormat).onChange(async (value) => {
      this.plugin.settings.dateFormat = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Time format").setDesc("Format for current time.").addText((text) => text.setPlaceholder("HH:mm").setValue(this.plugin.settings.timeFormat).onChange(async (value) => {
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
      case "toggle":
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
      case "todo":
        insertText = "- [ ] ";
        break;
      case "toggle":
      case "bullet":
        insertText = "- ";
        break;
      case "numbered":
        insertText = "1. ";
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
      case "frontmatter": {
        isMetadata = true;
        const firstLine = view.state.doc.line(1);
        if (firstLine.text === "---") {
          return;
        }
        insertText = "---\n\n---\n";
        customPos = 0;
        cursorOffset = 4;
        break;
      }
      case "footnote": {
        const footnoteId = Math.floor(Math.random() * 1e3);
        insertText = `[^${footnoteId}]`;
        const docEnd = view.state.doc.length;
        view.dispatch({
          changes: { from: docEnd, insert: `

[^${footnoteId}]: ` }
        });
        break;
      }
      default:
        insertText = "";
        break;
    }
  }
  const pos = customPos !== null ? customPos : line.to;
  const isNewLine = !isMetadata && !["link", "ext-link", "embed", "tag", "comment", "today", "yesterday", "tomorrow", "time"].includes(targetType);
  const needsNewLine = isNewLine && line.text.trim().length > 0;
  view.dispatch({
    changes: {
      from: pos,
      insert: (needsNewLine ? "\n" : "") + insertText
    },
    selection: { anchor: (customPos !== null ? 0 : pos) + (needsNewLine ? 1 : 0) + (cursorOffset || insertText.length) },
    scrollIntoView: true,
    userEvent: "insert.block"
  });
}

// src/blockMenu.ts
var BASIC_BLOCKS = [
  { type: "paragraph", label: "Text", icon: "text" },
  { type: "h1", label: "Heading 1", icon: "heading1" },
  { type: "h2", label: "Heading 2", icon: "heading2" },
  { type: "h3", label: "Heading 3", icon: "heading3" },
  { type: "todo", label: "To-do list", icon: "check-square" },
  { type: "bullet", label: "Bulleted list", icon: "list" },
  { type: "numbered", label: "Numbered list", icon: "list-ordered" },
  { type: "toggle", label: "Toggle list", icon: "chevron-right" },
  { type: "blockquote", label: "Quote", icon: "quote" },
  { type: "code", label: "Code block", icon: "code" },
  { type: "math", label: "Math block", icon: "sigma" },
  { type: "divider", label: "Divider", icon: "minus" }
];
var ADVANCED_BLOCKS = [
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
var CALLOUT_TYPES = ["note", "info", "todo", "tip", "success", "question", "warning", "failure", "danger", "bug", "example", "quote"];
var CALLOUT_ICONS = {
  note: "pencil",
  info: "info",
  todo: "check-square",
  tip: "flame",
  success: "check",
  question: "help-circle",
  warning: "alert-triangle",
  failure: "x-circle",
  danger: "zap",
  bug: "bug",
  example: "list",
  quote: "quote"
};
function addMenuItemWithIcon(menu, label, icon, onClick) {
  let itemRef;
  menu.addItem((item) => {
    item.setTitle(label).setIcon(icon).onClick(onClick);
    itemRef = item;
  });
  return itemRef;
}
function addCalloutSubmenu(menu, view, lineNo, mode, _plugin) {
  menu.addItem((item) => {
    const sub = item.setSubmenu();
    item.setTitle("Callout").setIcon("megaphone");
    CALLOUT_TYPES.forEach((type) => {
      addMenuItemWithIcon(sub, type.charAt(0).toUpperCase() + type.slice(1), CALLOUT_ICONS[type] || "megaphone", () => {
        if (mode === "transform") {
          transformLine(view, lineNo, `callout-${type}`);
        } else if (_plugin) {
          insertBlock(_plugin, view, lineNo, `callout-${type}`);
        }
      });
    });
  });
}
function showTransformMenu(_plugin, view, lineNo, pos) {
  const menu = new import_obsidian3.Menu();
  BASIC_BLOCKS.forEach((block, index) => {
    if (index === 1 || index === 4 || index === 8)
      menu.addSeparator();
    addMenuItemWithIcon(menu, block.label, block.icon, () => transformLine(view, lineNo, block.type));
  });
  menu.addSeparator();
  addCalloutSubmenu(menu, view, lineNo, "transform");
  addMenuItemWithIcon(menu, "Comment", "message-square", () => transformLine(view, lineNo, "comment"));
  if (pos instanceof MouseEvent) {
    menu.showAtMouseEvent(pos);
  } else {
    menu.showAtPosition(pos);
  }
}
function showInsertMenu(plugin, view, lineNo, pos) {
  const menu = new import_obsidian3.Menu();
  BASIC_BLOCKS.forEach((block, index) => {
    if (index === 1 || index === 4 || index === 8)
      menu.addSeparator();
    addMenuItemWithIcon(menu, block.label, block.icon, () => insertBlock(plugin, view, lineNo, block.type));
  });
  menu.addSeparator();
  addCalloutSubmenu(menu, view, lineNo, "insert", plugin);
  menu.addSeparator();
  ADVANCED_BLOCKS.forEach((block) => {
    addMenuItemWithIcon(menu, block.label, block.icon, () => insertBlock(plugin, view, lineNo, block.type));
  });
  menu.showAtPosition(pos);
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
        this.updateIndicator(line.number, event.clientY);
      }
    };
    this.onMouseUp = (_event) => {
      this.stopDrag();
    };
  }
  startDrag(lineNo, event) {
    var _a;
    this.isDragging = true;
    (_a = activeWindow.getSelection()) == null ? void 0 : _a.removeAllRanges();
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
    this.ghostEl = activeDocument.body.createDiv({
      cls: "block-drag-ghost",
      text: text.slice(0, 50) + (text.length > 50 ? "..." : "")
    });
    this.updateGhostPosition(event.clientX, event.clientY);
    this.indicatorEl = activeDocument.body.createDiv({
      cls: "block-drag-indicator"
    });
    activeDocument.addEventListener("mousemove", this.onMouseMove);
    activeDocument.addEventListener("mouseup", this.onMouseUp);
    activeDocument.body.addClass("is-dragging-block");
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
    activeDocument.removeEventListener("mousemove", this.onMouseMove);
    activeDocument.removeEventListener("mouseup", this.onMouseUp);
    activeDocument.body.removeClass("is-dragging-block");
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
    try {
      const line = this.view.state.doc.line(lineNo);
      const coords = this.view.coordsAtPos(line.from);
      if (coords) {
        const endCoords = this.view.coordsAtPos(line.to);
        let top = coords.top;
        let targetLine = lineNo;
        if (endCoords) {
          const lineBottom = endCoords.bottom;
          const midPoint = coords.top + (lineBottom - coords.top) / 2;
          if (mouseY > midPoint) {
            top = lineBottom;
            targetLine = lineNo + 1;
          } else {
            top = coords.top;
            targetLine = lineNo;
          }
        }
        this.currentTargetLine = targetLine;
        this.indicatorEl.setCssStyles({
          top: `${top}px`,
          left: `${coords.left}px`,
          width: `${this.view.contentDOM.clientWidth}px`,
          display: "block"
        });
      }
    } catch (e) {
    }
  }
  moveBlock(startBlock, toLineNo) {
    const doc = this.view.state.doc;
    const textToMove = startBlock.text;
    if (toLineNo > doc.lines) {
      this.view.dispatch({
        changes: [
          { from: doc.length, insert: "\n" + textToMove },
          { from: startBlock.from, to: Math.min(startBlock.to + 1, doc.length) }
        ],
        scrollIntoView: true,
        userEvent: "move.block"
      });
      return;
    }
    const toLine = doc.line(toLineNo);
    if (toLine.from >= startBlock.from && toLine.to <= startBlock.to)
      return;
    if (startBlock.from < toLine.from) {
      this.view.dispatch({
        changes: [
          { from: toLine.from, insert: textToMove + "\n" },
          // Insert before the target line
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
var blockHandlesExtension = (plugin) => import_view.ViewPlugin.fromClass(class {
  constructor(_view) {
    this.handleEl = null;
    this.addButton = null;
    this.dragButton = null;
    this.hoveredLine = null;
    this.hideTimeout = null;
    this.dragManager = null;
    this.createHandle(_view);
  }
  createHandle(view) {
    this.handleEl = view.scrollDOM.createDiv();
    this.handleEl.className = "block-handle-wrap is-hidden";
    this.addButton = this.handleEl.createDiv({
      cls: "block-handle-button add-button",
      attr: { "aria-label": "Add block below" }
    });
    (0, import_obsidian4.setIcon)(this.addButton, "plus");
    this.dragButton = this.handleEl.createDiv({
      cls: "block-handle-button drag-button",
      attr: { "aria-label": "Drag to reorder" }
    });
    (0, import_obsidian4.setIcon)(this.dragButton, "grip-vertical");
    let dragTimeout = null;
    let isDragging = false;
    this.dragButton.onmousedown = (e) => {
      if (this.hoveredLine === null)
        return;
      if (this.hideTimeout) {
        window.clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }
      e.preventDefault();
      e.stopPropagation();
      isDragging = false;
      dragTimeout = window.setTimeout(() => {
        isDragging = true;
        if (!this.dragManager) {
          this.dragManager = new DragManager(plugin, view);
        }
        this.dragManager.startDrag(this.hoveredLine, e);
      }, 150);
    };
    this.dragButton.onmouseup = (_e) => {
      window.clearTimeout(dragTimeout);
      if (!isDragging && this.hoveredLine !== null) {
        const rect = this.dragButton.getBoundingClientRect();
        showTransformMenu(plugin, view, this.hoveredLine, {
          x: rect.left,
          y: rect.bottom
        });
      }
    };
    this.dragButton.onclick = (e) => e.stopPropagation();
    this.dragButton.oncontextmenu = (e) => {
      const menu = new import_obsidian4.Menu();
      menu.addItem((item) => {
        item.setTitle(plugin.settings.dragGranularity === "line" ? "Switch to paragraph mode" : "Switch to line mode").setIcon("layers").onClick(async () => {
          plugin.settings.dragGranularity = plugin.settings.dragGranularity === "line" ? "paragraph" : "line";
          await plugin.saveSettings();
        });
      });
      menu.showAtMouseEvent(e);
      e.preventDefault();
    };
    this.addButton.onclick = (e) => {
      if (this.hoveredLine === null)
        return;
      if (this.hideTimeout) {
        window.clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }
      e.stopPropagation();
      const rect = this.addButton.getBoundingClientRect();
      const pos = { x: rect.left, y: rect.bottom };
      showInsertMenu(plugin, view, this.hoveredLine, pos);
    };
  }
  update(update) {
    if ((update.docChanged || update.viewportChanged) && this.hoveredLine !== null) {
      this.updatePosition(update.view);
    }
  }
  updatePosition(view) {
    if (this.hoveredLine === null || !this.handleEl)
      return;
    try {
      const line = view.state.doc.line(this.hoveredLine);
      const coords = view.coordsAtPos(line.from);
      if (!coords)
        return;
      const scrollerRect = view.scrollDOM.getBoundingClientRect();
      let top = coords.top - scrollerRect.top + view.scrollDOM.scrollTop;
      const lineHeight = coords.bottom - coords.top;
      const handleHeight = this.handleEl.offsetHeight || 24;
      top += (lineHeight - handleHeight) / 2;
      const left = view.contentDOM.offsetLeft - 52;
      this.handleEl.style.transform = `translate3d(${left}px, ${Math.round(top)}px, 0)`;
    } catch (e) {
      this.hideHandle();
    }
  }
  handleMouseMove(view, event) {
    var _a, _b;
    const rect = view.dom.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < -100 || x > rect.width + 100 || y < 0 || y > rect.height) {
      this.handleMouseLeave();
      return;
    }
    if (event.target.closest(".block-handle-wrap")) {
      if (this.hideTimeout) {
        window.clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }
      if ((_a = this.handleEl) == null ? void 0 : _a.classList.contains("is-hidden")) {
        this.handleEl.classList.remove("is-hidden");
        if (this.hoveredLine === null) {
          const contentRect2 = view.contentDOM.getBoundingClientRect();
          const targetX2 = contentRect2.left + 5;
          const pos2 = view.posAtCoords({ x: targetX2, y: event.clientY });
          if (pos2 !== null) {
            try {
              this.hoveredLine = view.state.doc.lineAt(pos2).number;
            } catch (e) {
            }
          }
        }
        this.updatePosition(view);
      }
      return;
    }
    const contentRect = view.contentDOM.getBoundingClientRect();
    const targetX = contentRect.left + 5;
    const pos = view.posAtCoords({ x: targetX, y: event.clientY });
    if (pos === null)
      return;
    try {
      const line = view.state.doc.lineAt(pos);
      if (this.hoveredLine !== line.number) {
        this.hoveredLine = line.number;
        (_b = this.handleEl) == null ? void 0 : _b.classList.remove("is-hidden");
        this.updatePosition(view);
      }
      if (this.hideTimeout) {
        window.clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }
    } catch (e) {
    }
  }
  handleMouseLeave() {
    if (this.hideTimeout)
      window.clearTimeout(this.hideTimeout);
    this.hideTimeout = window.setTimeout(() => {
      var _a, _b;
      if ((_a = this.handleEl) == null ? void 0 : _a.matches(":hover")) {
        return;
      }
      this.hoveredLine = null;
      (_b = this.handleEl) == null ? void 0 : _b.classList.add("is-hidden");
    }, plugin.settings.hideDelay);
  }
  hideHandle() {
    this.hoveredLine = null;
    if (this.handleEl) {
      this.handleEl.classList.add("is-hidden");
    }
    if (this.hideTimeout) {
      window.clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }
  destroy() {
    if (this.handleEl) {
      this.handleEl.remove();
    }
  }
}, {
  eventHandlers: {
    mousemove(event, _view) {
      this.handleMouseMove(_view, event);
    },
    mouseleave(_event, _view) {
      this.handleMouseLeave();
    }
  }
});

// src/main.ts
var NotionBlock = class extends import_obsidian5.Plugin {
  async onload() {
    await this.loadSettings();
    this.registerEditorExtension([blockHandlesExtension(this)]);
    this.addSettingTab(new BlockPluginSettingTab(this.app, this));
  }
  onunload() {
  }
  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.app.workspace.updateOptions();
  }
};
