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
import { showError, showSuccess, showInfo } from '../../components/ToastMessage';
import { hideLoading, showLoading } from '../../components/Loading';

export type UpdateOptions = {};

const STORE_BASE_URL = 'https://store.posc.net';
const SYS_CONFIG_PATH = '/userdata/cfg/sys_config.conf';

// 当前版本号（每次发布需同步更新 package.json version）
const CURRENT_VERSION = '1.2.11';

const update = defineComponent({
    data() {
        return {
            $page: {} as FalconPage<UpdateOptions>,

            // Shell 状态
            shellInitialized: false,
            sku: '',

            // 更新状态
            status: 'idle' as 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'updated' | 'error',
            errorMessage: '',

            // 版本信息
            currentVersion: CURRENT_VERSION,
            latestVersion: '',
            releaseNotes: '',
            downloadUrl: '',
            fileSize: 0,
            fileChecksum: '',

            // 下载信息
            downloadPath: '',
            dlActive: false,
            dlProgress: 0,
            dlProgressText: '',
            dlTimer: null as any,
        };
    },

    async mounted() {
        setTimeout(async () => {
            await this.initializeShell();
            if (this.shellInitialized) {
                await this.loadSku();
                if (this.sku) {
                    await this.checkForUpdates();
                }
            }
        }, 300);
    },

    beforeDestroy() {
        if (this.dlTimer) {
            clearInterval(this.dlTimer);
            this.dlTimer = null;
        }
    },

    computed: {
        statusText(): string {
            switch (this.status) {
                case 'idle': return '准备就绪';
                case 'checking': return '正在检查更新...';
                case 'available': return '发现新版本';
                case 'downloading': return '正在下载更新...';
                case 'installing': return '正在安装...';
                case 'updated': return '已是最新版本';
                case 'error': return '检查更新失败';
                default: return '';
            }
        },

        statusClass(): string {
            switch (this.status) {
                case 'idle': return 'status-idle';
                case 'checking': return 'status-checking';
                case 'available': return 'status-available';
                case 'updated': return 'status-updated';
                case 'error': return 'status-error';
                default: return '';
            }
        },

        hasUpdate(): boolean {
            if (!this.latestVersion) return false;
            return this.compareVersions(this.latestVersion, this.currentVersion) > 0;
        },

        versionCompareText(): string {
            if (!this.latestVersion) return '';
            const cmp = this.compareVersions(this.latestVersion, this.currentVersion);
            if (cmp > 0) return '发现新版本';
            if (cmp < 0) return '当前版本更新';
            return '相同版本';
        },

        versionCompareClass(): string {
            if (!this.latestVersion) return '';
            const cmp = this.compareVersions(this.latestVersion, this.currentVersion);
            if (cmp > 0) return 'version-newer';
            if (cmp < 0) return 'version-older';
            return 'version-same';
        },

        formattedFileSize(): string {
            const size = this.fileSize;
            if (size <= 0) return '未知';
            if (size < 1024) return `${size} B`;
            if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
            if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
            return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
        },
    },

    methods: {
        // --- Shell / SKU ---
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
            } catch (error: any) {
                console.error('读取 SKU 失败:', error);
            }
        },

        encode(value: string): string {
            try { return encodeURIComponent(value); }
            catch (e) { return value; }
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

        compareVersions(v1: string, v2: string): number {
            const parts1 = v1.replace(/^v/, '').split('.').map(Number);
            const parts2 = v2.replace(/^v/, '').split('.').map(Number);
            for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
                const a = parts1[i] || 0;
                const b = parts2[i] || 0;
                if (a > b) return 1;
                if (a < b) return -1;
            }
            return 0;
        },

        // --- 检查更新 ---
        async checkForUpdates() {
            if (!this.shellInitialized || !Shell) {
                showError('Shell 模块未初始化');
                return;
            }
            if (!this.sku) {
                showError('未读取到设备 SKU，无法检查更新');
                return;
            }

            this.status = 'checking';
            this.errorMessage = '';

            try {
                showLoading('正在检查更新...');

                // 从设备系统配置读取 appid（设备上安装的 app 标识）
                let appid = '';
                try {
                    const appidCmd = `grep '^miniapp_appid=' "${SYS_CONFIG_PATH}" | head -1 | cut -d'=' -f2 | tr -d '\\r\\n'`;
                    const appidResult = await Shell.exec(appidCmd);
                    appid = (appidResult || '').trim();
                } catch (e) { /* ignore */ }

                if (!appid) {
                    // 尝试查询软件列表，按名称匹配
                    const listPath = `/api/device/software?sku=${this.encode(this.sku)}`;
                    const listRaw = await this.fetchViaCurl(listPath);
                    const listData = JSON.parse(listRaw);
                    const swList = Array.isArray(listData.software) ? listData.software : [];
                    const ourApp = swList.find((item: any) =>
                        item.app_name === 'PenTool' ||
                        item.app_name === 'miniapp' ||
                        (item.appid && item.appid.indexOf('800174') === 0)
                    );
                    if (ourApp) {
                        appid = ourApp.appid;
                    }
                }

                if (!appid) {
                    throw new Error('无法在当前设备上找到本应用的更新信息');
                }

                // 获取详情（含版本和下载信息）
                const detailPath = `/api/device/software/detail?sku=${this.encode(this.sku)}&appid=${this.encode(appid)}`;
                const detailRaw = await this.fetchViaCurl(detailPath);
                const detail = JSON.parse(detailRaw);

                if (detail && detail.latest_version) {
                    this.latestVersion = detail.latest_version;
                    this.releaseNotes = detail.update_description || detail.software_description || '暂无更新说明';
                    this.downloadUrl = detail.download_url || '';
                    this.fileSize = detail.size || 0;
                    this.fileChecksum = detail.checksum || '';

                    const cmp = this.compareVersions(this.latestVersion, this.currentVersion);
                    if (cmp > 0) {
                        this.status = 'available';
                        showInfo(`发现新版本 v${this.latestVersion}`);
                    } else {
                        this.status = 'updated';
                        showSuccess(`已是最新版本 v${this.currentVersion}`);
                    }
                } else {
                    throw new Error('未获取到版本信息');
                }
            } catch (error: any) {
                console.error('检查更新失败:', error);
                this.status = 'error';
                this.errorMessage = error.message || '网络连接失败';
                showError(`检查更新失败: ${this.errorMessage}`);
            } finally {
                hideLoading();
            }
        },

        // --- 下载 ---
        async startDownload() {
            if (!this.shellInitialized || !Shell) {
                showError('Shell 模块未初始化');
                return;
            }
            if (!this.hasUpdate) {
                showError('没有可安装的更新');
                return;
            }
            if (this.dlActive) {
                showError('正在下载中');
                return;
            }

            this.status = 'downloading';
            this.dlActive = true;
            this.dlProgress = 0;
            this.dlProgressText = '准备下载...';

            // 构建下载 URL：优先用 detail 返回的 download_url，否则用 API 下载端点
            const finalDownloadUrl = this.downloadUrl
                ? (this.downloadUrl.indexOf('http') === 0 ? this.downloadUrl : `${STORE_BASE_URL}${this.downloadUrl}`)
                : `${STORE_BASE_URL}/api/device/software/download?sku=${this.encode(this.sku)}&appid=miniapp`;

            this.downloadPath = `/userdisk/miniapp_update_${Date.now()}.amr`;

            // 启动进度轮询
            if (this.dlTimer) clearInterval(this.dlTimer);
            this.dlTimer = setInterval(() => {
                this.pollDownloadProgress();
            }, 800);

            try {
                showInfo('正在下载更新...');
                const downloadCmd = `curl -s -k -L "${finalDownloadUrl}" -o "${this.downloadPath}"`;
                await Shell.exec(downloadCmd);

                // 等待文件写入完成
                await new Promise(resolve => setTimeout(resolve, 500));

                // 停止轮询
                if (this.dlTimer) { clearInterval(this.dlTimer); this.dlTimer = null; }
                this.dlActive = false;

                // 验证文件
                const sizeCmd = `test -f "${this.downloadPath}" && wc -c < "${this.downloadPath}" || echo 0`;
                const actualSize = parseInt((await Shell.exec(sizeCmd)).trim()) || 0;
                if (actualSize <= 0) {
                    throw new Error('下载失败，文件为空');
                }

                this.dlProgress = 100;
                this.dlProgressText = '下载完成，正在安装...';

                await this.installUpdate();
            } catch (error: any) {
                console.error('下载失败:', error);
                this.status = 'error';
                this.errorMessage = error.message || '下载失败';
                showError(`下载失败: ${this.errorMessage}`);
                this.dlActive = false;
                this.dlProgress = 0;
                if (this.dlTimer) { clearInterval(this.dlTimer); this.dlTimer = null; }
            }
        },

        async pollDownloadProgress() {
            if (!Shell || !this.dlActive || !this.downloadPath) return;
            try {
                const checkCmd = `test -f "${this.downloadPath}" && wc -c < "${this.downloadPath}" || echo 0`;
                const result = await Shell.exec(checkCmd);
                const currentSize = parseInt((result || '').trim()) || 0;

                if (this.fileSize > 0 && currentSize > 0) {
                    const pct = Math.min(99, Math.round((currentSize / this.fileSize) * 100));
                    this.dlProgress = pct;
                    this.dlProgressText = `${this.formatSize(currentSize)} / ${this.formattedFileSize} (${pct}%)`;
                } else {
                    this.dlProgressText = `已下载 ${this.formatSize(currentSize)}...`;
                }
            } catch (e) { /* ignore poll errors */ }
        },

        // --- 安装 ---
        async installUpdate() {
            if (!this.shellInitialized || !Shell) {
                showError('无法安装更新');
                return;
            }

            this.status = 'installing';

            try {
                showLoading('正在安装更新...');
                const installCmd = `miniapp_cli install "${this.downloadPath}"`;
                await Shell.exec(installCmd);

                // 清理旧的临时文件
                try {
                    await Shell.exec('rm -f /userdisk/miniapp_update_*.amr 2>/dev/null || true');
                } catch (e) { /* ignore */ }

                showSuccess('更新安装完成，请重启应用以生效');
                this.status = 'updated';
            } catch (error: any) {
                console.error('安装失败:', error);
                showError(`安装失败: ${error.message || '未知错误'}`);
                this.status = 'error';
            } finally {
                hideLoading();
            }
        },

        formatSize(size: number): string {
            if (!size || size <= 0) return '0 B';
            if (size < 1024) return `${size} B`;
            if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
            if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
            return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
        },
    }
});

export default update;
