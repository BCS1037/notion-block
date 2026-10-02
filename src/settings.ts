import { App, Component, Notice, PluginSettingTab, Setting } from 'obsidian';
import NotionBlock from './main';
import { t } from './locale/helpers';
import { MENU_COMMANDS, MenuGroup, MenuLayout, normalizeMenuLayout, reorderMenuCommands, setMenuCommandExpanded } from './menuLayout';
import { MenuOrderDrag } from './menuOrder';

export interface BlockPluginSettings {
    enabled: boolean;
    showAddButton: boolean;
    dragGranularity: 'line' | 'paragraph';
    hoverDelay: number;
    hideDelay: number;
    dateFormat: string;
    timeFormat: string;
    menuLayout: MenuLayout;
}

export const DEFAULT_SETTINGS: BlockPluginSettings = {
    enabled: true,
    showAddButton: false,
    dragGranularity: 'line',
    hoverDelay: 0,
    hideDelay: 200,
    dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm',
    menuLayout: normalizeMenuLayout(),
};

export class BlockPluginSettingTab extends PluginSettingTab {
    plugin: NotionBlock;
    private settingsEvents: Component | null = null;
    private groupEvents: Partial<Record<MenuGroup, Component>> = {};

    constructor(app: App, plugin: NotionBlock) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        this.hide();
        containerEl.empty();
        this.settingsEvents = this.plugin.addChild(new Component());
        const lifetime = this.settingsEvents;

        new Setting(containerEl)
            .setName(t('settings.enablePlugin.name'))
            .setDesc(t('settings.enablePlugin.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enabled)
                .onChange(async (value) => {
                    this.plugin.settings.enabled = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.showAddButton.name'))
            .setDesc(t('settings.showAddButton.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showAddButton)
                .onChange(async (value) => {
                    this.plugin.settings.showAddButton = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.dragGranularity.name'))
            .setDesc(t('settings.dragGranularity.desc'))
            .addDropdown(dropdown => dropdown
                .addOption('line', t('settings.dragGranularity.line'))
                .addOption('paragraph', t('settings.dragGranularity.paragraph'))
                .setValue(this.plugin.settings.dragGranularity)
                .onChange(async (value: 'line' | 'paragraph') => {
                    this.plugin.settings.dragGranularity = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.menuLayout.name'))
            .setDesc(t('settings.menuLayout.desc'));
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
                .setPlaceholder('YYYY-MM-DD')
                .setValue(this.plugin.settings.dateFormat)
                .onChange(async (value) => {
                    this.plugin.settings.dateFormat = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.timeFormat.name'))
            .setDesc(t('settings.timeFormat.desc'))
            .addText(text => text
                .setPlaceholder('HH:mm')
                .setValue(this.plugin.settings.timeFormat)
                .onChange(async (value) => {
                    this.plugin.settings.timeFormat = value;
                    await this.plugin.saveSettings();
                }));
    }

    hide(): void {
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
