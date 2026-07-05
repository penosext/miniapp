// Copyright (C) 2025 Langning Chen
//
// This file is part of miniapp.
//
// miniapp is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// miniapp is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with miniapp.  If not, see <https://www.gnu.org/licenses/>.

import { defineComponent } from 'vue';
import { Shell } from 'langningchen';
import { showError, showSuccess, showInfo, showWarning } from '../../components/ToastMessage';
import { hideLoading, showLoading } from '../../components/Loading';

export type StoreOptions = {};

const STORE_BASE_URL = 'https://store.posc.net';
const SYS_CONFIG_PATH = '/userdata/cfg/sys_config.conf';

interface SoftwareItem {
    appid: string;
    app_name: string;
    latest_version: string;
    icon_url: string;
    software_description: string;
    category?: string;
    developer?: string;
}

interface SoftwareDetail {
    appid: string;
    app_name: string;
    latest_version: string;
    update_description: string;
    icon_url: string;
    software_description: string;
    checksum: string;
    size: number;
    download_url: string;
}

const CATEGORIES = [
    { key: 'all', label: '全部' },
    { key: 'tools', label: '工具' },
    { key: 'game', label: '游戏' },
    { key: 'edu', label: '教育' },
];

const store = defineComponent({
    data() {
        return {
            $page: {} as FalconPage<StoreOptions>,

            shellInitialized: false,
            sku: '',

            // 视图模式: browse / installed
            activeTab: 'browse' as 'browse' | 'installed',
            // 分类
            activeCategory: 'all',
            categories: CATEGORIES,

            // 搜索
            searchMode: false,
            keyword: '',
            searchResults: [] as SoftwareItem[],
            _searchTimer: null as any,

            // 列表数据
            allApps: [] as SoftwareItem[],
            installedIds: [] as string[],

            // 详情面板
            showDetailPanel: false,
            currentApp: {} as SoftwareItem,
            currentAppDetail: null as SoftwareDetail | null,

            // 下载状态
            dlActive: false,
            dlProgress: 0,
            dlProgressText: '',
            dlTimer: null as any,

            // 加载
            isLoading: false,
            isSearching: false,
        };
    },

    async mounted() {
        this.$page.$npage.setSupportBack(true);
        this.$page.$npage.on('backpressed', this.handleBackPress);

        setTimeout(async () => {
            await this.initializeShell();
            this.loadInstalledIds();
            await this.loadSku();
            if (this.sku) {
                await this.refreshSources();
            }
        }, 300);
    },

    beforeDestroy() {
        this.$page.$npage.off('backpressed', this.handleBackPress);
        if (this.dlTimer) {
            clearInterval(this.dlTimer);
            this.dlTimer = null;
        }
        if (this._searchTimer) {
            clearTimeout(this._searchTimer);
            this._searchTimer = null;
        }
    },

    computed: {
        filteredApps(): SoftwareItem[] {
            let list = this.allApps;
            if (this.activeCategory !== 'all') {
                list = list.filter(a => (a.category || 'tools') === this.activeCategory);
            }
            return list;
        },

        appRows(): SoftwareItem[][] {
            return this.toRows(this.filteredApps);
        },

        searchResultRows(): SoftwareItem[][] {
            return this.toRows(this.searchResults);
        },

        installedApps(): SoftwareItem[] {
            if (!Array.isArray(this.installedIds) || this.installedIds.length === 0) return [];
            const set: Record<string, boolean> = {};
            for (const id of this.installedIds) set[String(id)] = true;
            return this.allApps.filter(a => a.appid && set[String(a.appid)]);
        },

        installedRows(): SoftwareItem[][] {
            return this.toRows(this.installedApps);
        },

        isInstalled(): boolean {
            const appid = this.currentApp && this.currentApp.appid;
            return appid ? this.installedIds.indexOf(String(appid)) >= 0 : false;
        },
    },

    methods: {
        toRows(list: SoftwareItem[]): SoftwareItem[][] {
            const rows: SoftwareItem[][] = [];
            for (let i = 0; i < list.length; i += 2) {
                const row = [list[i]];
                if (i + 1 < list.length) row.push(list[i + 1]);
                rows.push(row);
            }
            return rows;
        },

        async initializeShell() {
            try {
                if (!Shell || typeof Shell.initialize !== 'function') {
                    throw new Error('Shell 模块不可用');
                }
                await Shell.initialize();
                this.shellInitialized = true;
            } catch (error: any) {
                console.error('Shell 初始化失败:', error);
                this.shellInitialized = false;
            }
        },

        async loadSku() {
            if (!this.shellInitialized || !Shell) return;
            try {
                const cmd = `grep '^sku=' "${SYS_CONFIG_PATH}" | head -1 | cut -d'=' -f2 | tr -d '\\r\\n'`;
                const result = await Shell.exec(cmd);
                this.sku = (result || '').trim();
                if (!this.sku) {
                    showWarning('未能读取设备 SKU');
                }
            } catch (error: any) {
                console.error('读取 SKU 失败:', error);
            }
        },

        async fetchViaCurl(path: string): Promise<string> {
            if (!this.shellInitialized || !Shell) {
                throw new Error('Shell 模块未初始化');
            }
            const url = `${STORE_BASE_URL}${path}`;
            const cmd = `curl -s -k -L -H "User-Agent: miniapp" "${url}"`;
            const result = await Shell.exec(cmd);
            if (!result || result.trim() === '') {
                throw new Error('服务器无响应');
            }
            return result;
        },

        encode(value: string): string {
            try { return encodeURIComponent(value); }
            catch (e) { return value; }
        },

        transformApp(item: any): SoftwareItem {
            return {
                appid: item.appid || '',
                app_name: item.app_name || item.appid || '',
                latest_version: item.latest_version || '',
                icon_url: item.icon_url || '',
                software_description: item.software_description || '',
                category: (item.category || 'tools'),
                developer: item.developer || '',
            };
        },

        async refreshSources() {
            if (this.isLoading) return;
            if (!this.sku) {
                await this.loadSku();
                if (!this.sku) return;
            }
            this.isLoading = true;
            try {
                const path = `/api/device/software?sku=${this.encode(this.sku)}`;
                const raw = await this.fetchViaCurl(path);
                const data = JSON.parse(raw);
                const list = Array.isArray(data.software) ? data.software : [];
                this.allApps = list.map((item: any) => this.transformApp(item));
                if (this.allApps.length === 0) {
                    showInfo('暂无可用软件');
                }
            } catch (error: any) {
                console.error('刷新源失败:', error);
                showError('刷新源失败: ' + error.message);
            } finally {
                this.isLoading = false;
            }
        },

        loadInstalledIds() {
            try {
                const stored = $falcon.jsapi.storage.getStorage({ key: 'pstore_installed' });
                stored.then((res: any) => {
                    try {
                        const val = JSON.parse(res?.data || '[]');
                        this.installedIds = Array.isArray(val) ? val : [];
                    } catch (e) { this.installedIds = []; }
                }).catch(() => { this.installedIds = []; });
            } catch (e) { this.installedIds = []; }
        },

        saveInstalledIds() {
            try {
                $falcon.jsapi.storage.setStorage({
                    key: 'pstore_installed',
                    data: JSON.stringify(this.installedIds)
                });
            } catch (e) { /* ignore */ }
        },

        switchTab(tab: 'browse' | 'installed') {
            this.searchMode = false;
            this.showDetailPanel = false;
            this.activeTab = tab;
            if (tab === 'browse') {
                this.refreshSources();
            }
        },

        onSelectCategory(key: string) {
            this.activeCategory = key;
        },

        // --- 搜索 ---
        enterSearchMode() {
            this.searchMode = true;
            this.showDetailPanel = false;
        },

        onKeywordInput(e: any) {
            let value = '';
            if (typeof e === 'string') {
                value = e;
            } else if (e && typeof e.value === 'string') {
                value = e.value;
            } else if (e && e.target && typeof e.target.value === 'string') {
                value = e.target.value;
            } else {
                try { value = String(e || ''); } catch (_) { }
            }
            this.keyword = value.trim();
            if (this._searchTimer) clearTimeout(this._searchTimer);
            if (this.keyword) {
                this._searchTimer = setTimeout(() => {
                    this.doSearch(this.keyword);
                }, 400);
            }
        },

        exitSearchMode() {
            this.searchMode = false;
            this.keyword = '';
            this.searchResults = [];
            if (this._searchTimer) { clearTimeout(this._searchTimer); this._searchTimer = null; }
        },

        async doSearch(kw: string) {
            if (!kw || !this.sku) return;
            this.isSearching = true;
            try {
                const path = `/api/device/software/search?sku=${this.encode(this.sku)}&q=${this.encode(kw)}`;
                const raw = await this.fetchViaCurl(path);
                const data = JSON.parse(raw);
                const list = Array.isArray(data.software) ? data.software : [];
                this.searchResults = list.map((item: any) => this.transformApp(item));
            } catch (error: any) {
                console.error('搜索失败:', error);
                this.searchResults = [];
            } finally {
                this.isSearching = false;
            }
        },

        // --- 详情 ---
        async showDetail(app: SoftwareItem) {
            this.currentApp = { ...app };
            this.showDetailPanel = true;
            if (app.appid) {
                await this.fetchAppDetail(app.appid);
            }
        },

        async fetchAppDetail(appid: string) {
            if (!this.sku) return;
            try {
                showLoading();
                const path = `/api/device/software/detail?sku=${this.encode(this.sku)}&appid=${this.encode(appid)}`;
                const raw = await this.fetchViaCurl(path);
                const data = JSON.parse(raw) as SoftwareDetail;
                this.currentAppDetail = data;
                if (data) {
                    this.currentApp.latest_version = data.latest_version || this.currentApp.latest_version;
                    this.currentApp.software_description = data.update_description
                        || data.software_description
                        || this.currentApp.software_description;
                }
            } catch (error: any) {
                console.error('获取详情失败:', error);
            } finally {
                hideLoading();
            }
        },

        closeDetail() {
            this.showDetailPanel = false;
            this.currentAppDetail = null;
            this.dlActive = false;
            this.dlProgress = 0;
            this.dlProgressText = '';
            if (this.dlTimer) {
                clearInterval(this.dlTimer);
                this.dlTimer = null;
            }
        },

        // --- 下载进度轮询 ---
        async updateDlProgress(downloadPath: string, totalSize: number) {
            if (!Shell || !this.dlActive) return;
            try {
                const checkCmd = `test -f "${downloadPath}" && wc -c < "${downloadPath}" || echo 0`;
                const result = await Shell.exec(checkCmd);
                const currentSize = parseInt((result || '').trim()) || 0;

                if (totalSize > 0 && currentSize > 0) {
                    const pct = Math.min(99, Math.round((currentSize / totalSize) * 100));
                    this.dlProgress = pct;
                    this.dlProgressText = `${this.formatSize(currentSize)} / ${this.formatSize(totalSize)} (${pct}%)`;
                } else {
                    this.dlProgressText = `已下载 ${this.formatSize(currentSize)}...`;
                }

                if (currentSize >= totalSize && totalSize > 0) {
                    this.dlProgress = 100;
                    this.dlProgressText = '下载完成，正在安装...';
                }
            } catch (e) { /* ignore poll errors */ }
        },

        // --- 下载安装 ---
        async onDownload() {
            const app = this.currentApp;
            if (!app || !app.appid) return;
            if (!this.shellInitialized || !Shell) {
                showError('Shell 模块未初始化');
                return;
            }
            if (this.dlActive) {
                showWarning('正在下载中');
                return;
            }

            const appid = app.appid;
            const appName = app.app_name;
            const downloadUrl = this.currentAppDetail?.download_url
                ? this.fullIconUrl(this.currentAppDetail.download_url)
                : `${STORE_BASE_URL}/api/device/software/download?sku=${this.encode(this.sku)}&appid=${this.encode(appid)}`;

            const downloadPath = `/userdisk/store_${appid}_${Date.now()}.amr`;
            const totalSize = this.currentAppDetail?.size || 0;

            this.dlActive = true;
            this.dlProgress = 0;
            this.dlProgressText = totalSize > 0
                ? `0 / ${this.formatSize(totalSize)} (0%)`
                : '准备下载...';

            // 启动进度轮询
            if (this.dlTimer) clearInterval(this.dlTimer);
            this.dlTimer = setInterval(() => {
                this.updateDlProgress(downloadPath, totalSize);
            }, 800);

            try {
                const downloadCmd = `curl -s -k -L "${downloadUrl}" -o "${downloadPath}"`;
                showInfo(`正在下载 ${appName}...`);
                await Shell.exec(downloadCmd);

                // 等待文件完全写入
                await new Promise(resolve => setTimeout(resolve, 500));

                // 停止轮询
                if (this.dlTimer) { clearInterval(this.dlTimer); this.dlTimer = null; }

                const sizeCmd = `test -f "${downloadPath}" && wc -c < "${downloadPath}" || echo 0`;
                const fileSize = parseInt((await Shell.exec(sizeCmd)).trim()) || 0;
                if (fileSize <= 0) {
                    throw new Error('下载失败，文件为空');
                }

                this.dlProgress = 100;
                this.dlProgressText = '下载完成，正在安装...';

                showInfo(`正在安装 ${appName}...`);
                const installCmd = `miniapp_cli install "${downloadPath}"`;
                await Shell.exec(installCmd);

                const id = String(appid);
                if (this.installedIds.indexOf(id) < 0) {
                    this.installedIds.push(id);
                    this.saveInstalledIds();
                }

                showSuccess(`${appName} 安装完成`);

                setTimeout(async () => {
                    try { await Shell.exec(`rm -f "${downloadPath}"`); } catch (e) { /* ignore */ }
                }, 3000);

                this.dlActive = false;
            } catch (error: any) {
                console.error('安装失败:', error);
                showError('安装失败: ' + (error.message || '未知错误'));
                this.dlActive = false;
                this.dlProgress = 0;
                if (this.dlTimer) { clearInterval(this.dlTimer); this.dlTimer = null; }
            }
        },

        // --- 打开 ---
        async onOpen() {
            const app = this.currentApp;
            if (!app || !app.appid) return;
            if (!this.shellInitialized || !Shell) return;
            try {
                await Shell.exec(`miniapp_cli start "${app.appid}" > /dev/null 2>&1 &`);
                showInfo(`已打开: ${app.app_name}`);
            } catch (e: any) {
                showError('打开失败');
            }
        },

        // --- 卸载 ---
        async onUninstall() {
            const app = this.currentApp;
            if (!app || !app.appid) return;
            if (!this.shellInitialized || !Shell) return;
            try {
                await Shell.exec(`miniapp_cli uninstall "${app.appid}" > /dev/null 2>&1 &`);
                this.installedIds = this.installedIds.filter(i => String(i) !== String(app.appid));
                this.saveInstalledIds();
                showSuccess(`已卸载: ${app.app_name}`);
                this.closeDetail();
            } catch (e: any) {
                showError('卸载失败');
            }
        },

        fullIconUrl(iconUrl: string): string {
            if (!iconUrl) return '';
            if (iconUrl.indexOf('http') === 0) return iconUrl;
            return `${STORE_BASE_URL}${iconUrl}`;
        },

        formatSize(size: number): string {
            if (!size || size <= 0) return '未知';
            if (size < 1024) return `${size} B`;
            if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
            if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
            return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
        },

        handleBackPress() {
            if (this.showDetailPanel) {
                this.closeDetail();
                return;
            }
            if (this.searchMode) {
                this.exitSearchMode();
                return;
            }
            this.$page.finish();
        },
    }
});

export default store;
