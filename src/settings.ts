import { App, PluginSettingTab, Setting } from 'obsidian';
import NotionBlock from './main';
import { t } from './locale/helpers';

export interface BlockPluginSettings {
    enabled: boolean;
    dragGranularity: 'line' | 'paragraph';
    hoverDelay: number;
    hideDelay: number;
    dateFormat: string;
    timeFormat: string;
}

export const DEFAULT_SETTINGS: BlockPluginSettings = {
    enabled: true,
    dragGranularity: 'line',
    hoverDelay: 0,
    hideDelay: 200,
    dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm',
};

export class BlockPluginSettingTab extends PluginSettingTab {
    plugin: NotionBlock;

    constructor(app: App, plugin: NotionBlock) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

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
}

