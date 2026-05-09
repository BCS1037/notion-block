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

        console.log('Block Plugin loaded');
    }

    onunload() {
        console.log('Block Plugin unloaded');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Notify editor extensions that settings have changed
        this.app.workspace.updateOptions();
    }
}
