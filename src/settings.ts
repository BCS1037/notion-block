import { App, PluginSettingTab, Setting } from 'obsidian';
import NotionBlock from './main';

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
            .setName('Enable plugin')
            .setDesc('Enable or disable the block plugin.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enabled)
                .onChange(async (value) => {
                    this.plugin.settings.enabled = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Drag granularity')
            .setDesc('Switch between line mode and paragraph mode.')
            .addDropdown(dropdown => dropdown
                .addOption('line', 'Line mode')
                .addOption('paragraph', 'Paragraph mode')
                .setValue(this.plugin.settings.dragGranularity)
                .onChange(async (value: 'line' | 'paragraph') => {
                    this.plugin.settings.dragGranularity = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Button hover delay')
            .setDesc('Delay (ms) before showing handles.')
            .addSlider(slider => slider
                .setLimits(0, 500, 50)
                .setValue(this.plugin.settings.hoverDelay)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.hoverDelay = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Button hide delay')
            .setDesc('Delay (ms) before hiding handles.')
            .addSlider(slider => slider
                .setLimits(0, 1000, 50)
                .setValue(this.plugin.settings.hideDelay)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.hideDelay = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Date format')
            .setDesc('Format for today/yesterday/tomorrow.')
            .addText(text => text
                .setPlaceholder('YYYY-MM-DD')
                .setValue(this.plugin.settings.dateFormat)
                .onChange(async (value) => {
                    this.plugin.settings.dateFormat = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Time format')
            .setDesc('Format for current time.')
            .addText(text => text
                .setPlaceholder('HH:mm')
                .setValue(this.plugin.settings.timeFormat)
                .onChange(async (value) => {
                    this.plugin.settings.timeFormat = value;
                    await this.plugin.saveSettings();
                }));
    }
}
