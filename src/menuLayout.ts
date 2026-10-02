export type MenuGroup = "insert" | "transform";

export interface MenuCommand {
    id: string;
    labelKey: string;
    icon: string;
}

export interface MenuGroupLayout {
    order: string[];
    expanded: string[];
    collapsed: boolean;
}

export type MenuLayout = Record<MenuGroup, MenuGroupLayout>;

// 菜单与设置共用命令目录，持久化只保存稳定 ID。
export const MENU_COMMANDS: Record<MenuGroup, readonly MenuCommand[]> = {
    insert: [
        { id: "code", labelKey: "menu.code", icon: "code" },
        { id: "math", labelKey: "menu.math", icon: "sigma" },
        { id: "callout", labelKey: "menu.callout", icon: "pencil" },
        { id: "link", labelKey: "menu.link", icon: "link" },
        { id: "ext-link", labelKey: "menu.extLink", icon: "link-2" },
        { id: "image", labelKey: "menu.image", icon: "image" },
        { id: "table", labelKey: "menu.table", icon: "table" },
        { id: "today", labelKey: "menu.today", icon: "calendar" },
        { id: "time", labelKey: "menu.time", icon: "clock" },
        { id: "footnote", labelKey: "menu.footnote", icon: "hash" },
        { id: "comment", labelKey: "menu.comment", icon: "message-square" },
    ],
    transform: [
        { id: "paragraph", labelKey: "menu.paragraph", icon: "text" },
        { id: "h1", labelKey: "menu.h1", icon: "heading1" },
        { id: "h2", labelKey: "menu.h2", icon: "heading2" },
        { id: "h3", labelKey: "menu.h3", icon: "heading3" },
        { id: "todo", labelKey: "menu.todo", icon: "check-square" },
        { id: "bullet", labelKey: "menu.bullet", icon: "list" },
        { id: "numbered", labelKey: "menu.numbered", icon: "list-ordered" },
        { id: "blockquote", labelKey: "menu.blockquote", icon: "quote" },
        { id: "code", labelKey: "menu.code", icon: "code" },
        { id: "math", labelKey: "menu.math", icon: "sigma" },
        { id: "divider", labelKey: "menu.divider", icon: "minus" },
        { id: "callout", labelKey: "menu.callout", icon: "pencil" },
    ],
};

function asRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown> : {};
}

function knownIds(value: unknown, valid: string[]): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((id, index): id is string =>
        typeof id === "string" && valid.includes(id) && value.indexOf(id) === index);
}

export function normalizeMenuLayout(value?: unknown): MenuLayout {
    const source = asRecord(value);
    const normalizeGroup = (group: MenuGroup): MenuGroupLayout => {
        const valid = MENU_COMMANDS[group].map(command => command.id);
        const saved = asRecord(source[group]);
        const savedOrder = knownIds(saved.order, valid);
        const added = valid.filter(id => !savedOrder.includes(id));
        const expanded = Array.isArray(saved.expanded) ? knownIds(saved.expanded, valid) : [...valid];
        // 升级新增的命令默认展开；显式空 expanded 则允许整组收起。
        if (Array.isArray(saved.order) && savedOrder.length > 0) {
            added.forEach(id => { if (!expanded.includes(id)) expanded.push(id); });
        }
        return { order: [...savedOrder, ...added], expanded, collapsed: saved.collapsed === true };
    };
    return { insert: normalizeGroup("insert"), transform: normalizeGroup("transform") };
}

export function setMenuGroupCollapsed(layout: MenuLayout, group: MenuGroup, collapsed: boolean): MenuLayout {
    const next = normalizeMenuLayout(layout);
    next[group].collapsed = collapsed;
    return next;
}

export function setMenuCommandExpanded(layout: MenuLayout, group: MenuGroup, id: string, expanded: boolean): MenuLayout {
    const next = normalizeMenuLayout(layout);
    if (!next[group].order.includes(id)) return next;
    const direct = next[group].expanded.filter(command => command !== id);
    if (expanded) direct.push(id);
    next[group].expanded = direct;
    return next;
}

export function reorderMenuCommands(layout: MenuLayout, group: MenuGroup, visibleOrder: string[]): MenuLayout {
    const next = normalizeMenuLayout(layout);
    const valid = next[group].order;
    if (visibleOrder.some((id, index) => !valid.includes(id) || visibleOrder.indexOf(id) !== index)) return next;
    // 只重排当前可见的子集，隐藏项和另一组不受拖拽影响。
    let index = 0;
    next[group].order = valid.map(id => visibleOrder.includes(id) ? visibleOrder[index++] : id);
    return next;
}
