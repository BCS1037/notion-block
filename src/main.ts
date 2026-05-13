import { Plugin } from 'obsidian';
import { BlockPluginSettings, DEFAULT_SETTINGS, BlockPluginSettingTab } from './settings';
import { blockHandlesExtension } from './blockHandles';

export default class NotionBlock extends Plugin {
    settings: BlockPluginSettings;

    async onload() {
        await this.loadSettings();

        // Register the CodeMirror 6 extension for hover handles
        this.registerEditorExtension([blockHandlesExtension(this)]);

        // Add settings tab
        this.addSettingTab(new BlockPluginSettingTab(this.app, this));

    }

    onunload() {
    }

    async loadSettings() {
        const data = await this.loadData() as Partial<BlockPluginSettings> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Notify editor extensions that settings have changed
        this.app.workspace.updateOptions();
    }
}
