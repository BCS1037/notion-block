import { Plugin } from 'obsidian';
import { BlockPluginSettings, DEFAULT_SETTINGS, BlockPluginSettingTab } from './settings';
import { blockHandlesExtension } from './blockHandles';
import { MenuLayout, normalizeMenuLayout } from './menuLayout';
import { CrossDocumentDrag } from './crossDocument';

export default class NotionBlock extends Plugin {
    settings: BlockPluginSettings;
    transfers: CrossDocumentDrag;
    private settingsSaveQueue: Promise<void> = Promise.resolve();
    private savedMenuLayout: MenuLayout = normalizeMenuLayout();

    async onload() {
        await this.loadSettings();

        // Register the CodeMirror 6 extension for hover handles
        this.transfers = this.addChild(new CrossDocumentDrag(this.app));
        this.registerEditorExtension([blockHandlesExtension(this), this.transfers.extension()]);

        // Add settings tab
        this.addSettingTab(new BlockPluginSettingTab(this.app, this));

    }

    onunload() {
    }

    async loadSettings() {
        const data: unknown = await this.loadData();
        const saved = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {};
        // 忽略旧模式，加载时不改写用户存储的设置。
        const { dragGranularity: _retiredMode, ...current } = saved;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, current);
        this.settings.menuLayout = normalizeMenuLayout(saved.menuLayout);
        this.savedMenuLayout = normalizeMenuLayout(this.settings.menuLayout);
    }

    async saveSettings(refreshEditor = true) {
        const snapshot = { ...this.settings, menuLayout: normalizeMenuLayout(this.settings.menuLayout) };
        const write = this.settingsSaveQueue.then(async () => {
            await this.saveData(snapshot);
            this.savedMenuLayout = snapshot.menuLayout;
        });
        this.settingsSaveQueue = write.catch(() => {});
        await write;
        // Notify editor extensions that settings have changed
        if (refreshEditor) this.app.workspace.updateOptions();
    }

    async saveMenuLayout(layout: MenuLayout): Promise<void> {
        const next = normalizeMenuLayout(layout);
        this.settings.menuLayout = next;
        try {
            // 排序无需重建编辑器，保持当前菜单与输入焦点。
            await this.saveSettings(false);
        } catch (error) {
            if (this.settings.menuLayout === next) this.settings.menuLayout = normalizeMenuLayout(this.savedMenuLayout);
            throw error;
        }
    }
}
