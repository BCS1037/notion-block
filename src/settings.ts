import { App, Component, Notice, PluginSettingTab, Setting } from 'obsidian';
import NotionBlock from './main';
import { t } from './locale/helpers';
import { MENU_COMMANDS, MenuGroup, MenuLayout, normalizeMenuLayout, reorderMenuCommands, setMenuCommandExpanded } from './menuLayout';
import { MenuOrderDrag } from './menuOrder';

// Moment format tokens are case-sensitive, so these are technical patterns rather than sentence-case labels.
const DATE_FORMAT_PLACEHOLDER = 'YYYY-MM-DD';
const TIME_FORMAT_PLACEHOLDER = 'HH:mm';

export interface BlockPluginSettings {
    hoverDelay: number;
    hideDelay: number;
    dateFormat: string;
    timeFormat: string;
    menuLayout: MenuLayout;
}

export const DEFAULT_SETTINGS: BlockPluginSettings = {
    hoverDelay: 0,
    hideDelay: 200,
    dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm',
    menuLayout: normalizeMenuLayout(),
};

type DeclarativeControl =
    | { type: 'slider'; key: 'hoverDelay' | 'hideDelay'; defaultValue: number; min: number; max: number; step: number }
    | { type: 'text'; key: 'dateFormat' | 'timeFormat'; defaultValue: string; placeholder: string };

type DeclarativeSettingDefinition = {
    name: string;
    desc?: string;
    aliases?: string[];
} & (
    | { control: DeclarativeControl }
    | { render: (setting: Setting) => void | (() => void) }
);

export class BlockPluginSettingTab extends PluginSettingTab {
    plugin: NotionBlock;
    private settingsEvents: Component | null = null;
    private groupEvents: Partial<Record<MenuGroup, Component>> = {};

    constructor(app: App, plugin: NotionBlock) {
        super(app, plugin);
        this.plugin = plugin;
    }

    getSettingDefinitions(): DeclarativeSettingDefinition[] {
        const commandAliases = [
            ...Object.values(MENU_COMMANDS).flatMap(commands => commands.map(command => t(command.labelKey))),
        ];
        return [
            {
                name: t('settings.menuLayout.name'),
                desc: t('settings.menuLayout.desc'),
                aliases: commandAliases,
                render: setting => this.renderDeclarativeMenuLayout(setting),
            },
            {
                name: t('settings.hoverDelay.name'),
                desc: t('settings.hoverDelay.desc'),
                control: { type: 'slider', key: 'hoverDelay', defaultValue: DEFAULT_SETTINGS.hoverDelay, min: 0, max: 500, step: 50 },
            },
            {
                name: t('settings.hideDelay.name'),
                desc: t('settings.hideDelay.desc'),
                control: { type: 'slider', key: 'hideDelay', defaultValue: DEFAULT_SETTINGS.hideDelay, min: 0, max: 1000, step: 50 },
            },
            {
                name: t('settings.dateFormat.name'),
                desc: t('settings.dateFormat.desc'),
                control: { type: 'text', key: 'dateFormat', defaultValue: DEFAULT_SETTINGS.dateFormat, placeholder: DATE_FORMAT_PLACEHOLDER },
            },
            {
                name: t('settings.timeFormat.name'),
                desc: t('settings.timeFormat.desc'),
                control: { type: 'text', key: 'timeFormat', defaultValue: DEFAULT_SETTINGS.timeFormat, placeholder: TIME_FORMAT_PLACEHOLDER },
            },
        ];
    }

    getControlValue(key: string): unknown {
        switch (key) {
            case 'hoverDelay': return this.plugin.settings.hoverDelay;
            case 'hideDelay': return this.plugin.settings.hideDelay;
            case 'dateFormat': return this.plugin.settings.dateFormat;
            case 'timeFormat': return this.plugin.settings.timeFormat;
            default: return undefined;
        }
    }

    async setControlValue(key: string, value: unknown): Promise<void> {
        switch (key) {
            case 'hoverDelay':
                if (typeof value !== 'number' || !Number.isFinite(value)) return;
                this.plugin.settings.hoverDelay = Math.min(500, Math.max(0, Math.round(value / 50) * 50));
                break;
            case 'hideDelay':
                if (typeof value !== 'number' || !Number.isFinite(value)) return;
                this.plugin.settings.hideDelay = Math.min(1000, Math.max(0, Math.round(value / 50) * 50));
                break;
            case 'dateFormat':
            case 'timeFormat':
                if (typeof value !== 'string') return;
                this.plugin.settings[key] = value;
                break;
            default:
                return;
        }
        await this.plugin.saveSettings();
    }

    display(): void {
        const { containerEl } = this;

        this.hide();
        containerEl.empty();
        this.settingsEvents = this.plugin.addChild(new Component());

        new Setting(containerEl)
            .setName(t('settings.menuLayout.name'))
            .setDesc(t('settings.menuLayout.desc'));
        this.renderMenuGroups(containerEl);

        new Setting(containerEl)
            .setName(t('settings.hoverDelay.name'))
            .setDesc(t('settings.hoverDelay.desc'))
            .addSlider(slider => slider
                .setLimits(0, 500, 50)
                .setValue(this.plugin.settings.hoverDelay)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.hoverDelay = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.hideDelay.name'))
            .setDesc(t('settings.hideDelay.desc'))
            .addSlider(slider => slider
                .setLimits(0, 1000, 50)
                .setValue(this.plugin.settings.hideDelay)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.hideDelay = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.dateFormat.name'))
            .setDesc(t('settings.dateFormat.desc'))
            .addText(text => text
                .setPlaceholder(DATE_FORMAT_PLACEHOLDER)
                .setValue(this.plugin.settings.dateFormat)
                .onChange(async (value) => {
                    this.plugin.settings.dateFormat = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.timeFormat.name'))
            .setDesc(t('settings.timeFormat.desc'))
            .addText(text => text
                .setPlaceholder(TIME_FORMAT_PLACEHOLDER)
                .setValue(this.plugin.settings.timeFormat)
                .onChange(async (value) => {
                    this.plugin.settings.timeFormat = value;
                    await this.plugin.saveSettings();
                }));
    }

    hide(): void {
        this.clearSettingsLifetime();
    }

    private renderDeclarativeMenuLayout(setting: Setting): () => void {
        this.clearSettingsLifetime();
        const lifetime = this.plugin.addChild(new Component());
        this.settingsEvents = lifetime;
        setting.settingEl.addClass('wk-nb-menu-settings-declarative');
        setting.controlEl.empty();
        this.renderMenuGroups(setting.controlEl);
        return () => this.clearSettingsLifetime(lifetime);
    }

    private renderMenuGroups(containerEl: HTMLElement): void {
        const lifetime = this.settingsEvents;
        if (!lifetime) return;
        (["insert", "transform"] as MenuGroup[]).forEach(group => {
            const section = containerEl.createEl('details', { cls: 'wk-nb-menu-settings-group' });
            section.createEl('summary', { text: t(group === 'insert' ? 'menu.addInsert' : 'menu.turnInto') });
            new Setting(section)
                .setName(t('settings.menuLayout.position'))
                .addExtraButton(button => {
                    button.setIcon('rotate-ccw').onClick(async () => {
                        const layout = normalizeMenuLayout(this.plugin.settings.menuLayout);
                        layout[group] = normalizeMenuLayout()[group];
                        if (await this.persistMenuLayout(layout) && this.settingsEvents === lifetime && list.isConnected) this.renderMenuGroup(group, list);
                    });
                    button.extraSettingsEl.createSpan({ cls: 'wk-nb-sr-only', text: t('settings.menuLayout.reset') });
                });
            const list = section.createDiv({ cls: 'wk-nb-menu-settings-list' });
            this.renderMenuGroup(group, list);
        });
    }

    private clearSettingsLifetime(expected?: Component): void {
        if (expected && this.settingsEvents !== expected) return;
        if (this.settingsEvents) this.plugin.removeChild(this.settingsEvents);
        this.settingsEvents = null;
        this.groupEvents = {};
    }

    private renderMenuGroup(group: MenuGroup, list: HTMLElement, focusId?: string): void {
        if (!this.settingsEvents) return;
        const lifetime = this.settingsEvents;
        const previous = this.groupEvents[group];
        if (previous) this.settingsEvents.removeChild(previous);
        const events = this.settingsEvents.addChild(new Component());
        this.groupEvents[group] = events;
        const orderDrag = events.addChild(new MenuOrderDrag((currentGroup, ids, movedId) => {
            void this.persistMenuLayout(reorderMenuCommands(this.plugin.settings.menuLayout, currentGroup, ids))
                .then(() => {
                    if (this.settingsEvents === lifetime && list.isConnected) this.renderMenuGroup(group, list, movedId);
                });
        }));
        list.empty();
        const layout = this.plugin.settings.menuLayout[group];
        layout.order.forEach(id => {
            const command = MENU_COMMANDS[group].find(item => item.id === id);
            if (!command) return;
            const setting = new Setting(list)
                .setName(t(command.labelKey))
                .addDropdown(dropdown => dropdown
                    .addOption('expanded', t('settings.menuLayout.expanded'))
                    .addOption('collapsed', t('settings.menuLayout.collapsed'))
                    .setValue(layout.expanded.includes(id) ? 'expanded' : 'collapsed')
                    .onChange(async value => {
                        const next = setMenuCommandExpanded(this.plugin.settings.menuLayout, group, id, value === 'expanded');
                        if (!await this.persistMenuLayout(next)) {
                            dropdown.setValue(this.plugin.settings.menuLayout[group].expanded.includes(id) ? 'expanded' : 'collapsed');
                            if (this.settingsEvents === lifetime && list.isConnected) {
                                this.renderMenuGroup(group, list);
                                list.querySelector<HTMLSelectElement>(`[data-item-id="${id}"] select`)?.focus();
                            }
                        }
                    }));
            orderDrag.bindRow(setting.settingEl, group, id);
            if (id === focusId) setting.settingEl.querySelector<HTMLButtonElement>('.wk-nb-order-grip')?.focus();
        });
    }

    private async persistMenuLayout(layout: MenuLayout): Promise<boolean> {
        try {
            await this.plugin.saveMenuLayout(layout);
            return true;
        } catch {
            new Notice(t('notice.menuLayoutSaveFailed'));
            return false;
        }
    }
}
