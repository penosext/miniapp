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
import { openSoftKeyboard } from '../../utils/softKeyboardUtils';

export type StoreOptions = {};

// 软件商店服务地址
const STORE_BASE_URL = 'https://store.posc.net';
// 设备系统配置文件路径
const SYS_CONFIG_PATH = '/userdata/cfg/sys_config.conf';

// 软件列表项
interface SoftwareItem {
    appid: string;
    app_name: string;
    latest_version: string;
    icon_url: string;
    software_description: string;
}

// 软件详情
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

const store = defineComponent({
    data() {
        return {
            $page: {} as FalconPage<StoreOptions>,

            // Shell 状态
            shellInitialized: false,

            // 设备 SKU
            sku: '',

            // 视图状态：list 列表 / detail 详情
            view: 'list' as 'list' | 'detail',

            // 状态：idle / loading / ready / error / installing
            status: 'idle' as 'idle' | 'loading' | 'ready' | 'error' | 'installing',
            errorMessage: '',

            // 软件列表
            software: [] as SoftwareItem[],

            // 搜索关键词
            searchKeyword: '',
            isSearchMode: false,

            // 当前查看的软件详情
            detail: null as SoftwareDetail | null,

            // 下载安装进度
            downloadPath: '',
            isInstalling: false,
        };
    },

    async mounted() {
        this.$page.$npage.setSupportBack(true);
        this.$page.$npage.on('backpressed', this.handleBackPress);

        await this.initializeShell();
        await this.loadSku();
        if (this.sku) {
            await this.loadSoftware();
        }
    },

    beforeDestroy() {
        this.$page.$npage.off('backpressed', this.handleBackPress);
    },

    computed: {
        statusText(): string {
            switch (this.status) {
                case 'idle': return '准备就绪';
                case 'loading': return '正在加载...';
                case 'ready': return this.isSearchMode ? '搜索结果' : '可用软件';
                case 'installing': return '正在安装...';
                case 'error': return '加载失败';
                default: return '';
            }
        },

        isEmpty(): boolean {
            return this.status === 'ready' && this.software.length === 0;
        },
    },

    methods: {
        // 初始化 Shell 模块
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
                showError('Shell 模块初始化失败');
            }
        },

        // 从系统配置文件读取 SKU
        async loadSku() {
            if (!this.shellInitialized || !Shell) {
                showError('无法读取设备信息');
                return;
            }
            try {
                // 读取 sku= 开头的配置行并截取值
                const cmd = `grep '^sku=' "${SYS_CONFIG_PATH}" | head -1 | cut -d'=' -f2 | tr -d '\\r\\n'`;
                const result = await Shell.exec(cmd);
                this.sku = (result || '').trim();
                if (!this.sku) {
                    showError('未能读取设备 SKU');
                    this.status = 'error';
                    this.errorMessage = '未能从 ' + SYS_CONFIG_PATH + ' 读取 SKU';
                } else {
                    console.log('设备 SKU:', this.sku);
                }
            } catch (error: any) {
                console.error('读取 SKU 失败:', error);
                showError('读取 SKU 失败: ' + (error.message || '未知错误'));
                this.status = 'error';
                this.errorMessage = error.message || '读取 SKU 失败';
            }
        },

        // 通过 Shell curl 请求 API，返回响应文本
        async fetchViaCurl(path: string): Promise<string> {
            if (!this.shellInitialized || !Shell) {
                throw new Error('Shell 模块未初始化');
            }
            const url = `${STORE_BASE_URL}${path}`;
            const cmd = `curl -s -k -L -H "User-Agent: miniapp" "${url}"`;
            console.log('请求:', url);
            const result = await Shell.exec(cmd);
            if (!result || result.trim() === '') {
                throw new Error('服务器无响应');
            }
            return result;
        },

        // URL 编码（简单实现，兼容运行环境可能缺失 encodeURIComponent 的情况）
        encode(value: string): string {
            try {
                return encodeURIComponent(value);
            } catch (e) {
                return value;
            }
        },

        // 加载可用软件列表
        async loadSoftware() {
            if (!this.sku) {
                showError('缺少设备 SKU');
                return;
            }
            this.status = 'loading';
            this.errorMessage = '';
            this.isSearchMode = false;
            try {
                showLoading();
                const path = `/api/device/software?sku=${this.encode(this.sku)}`;
                const raw = await this.fetchViaCurl(path);
                const data = JSON.parse(raw);
                this.software = Array.isArray(data.software) ? data.software : [];
                this.status = 'ready';
                if (this.software.length === 0) {
                    showInfo('暂无可用软件');
                }
            } catch (error: any) {
                console.error('加载软件列表失败:', error);
                this.status = 'error';
                this.errorMessage = error.message || '加载失败';
                showError('加载软件列表失败: ' + this.errorMessage);
            } finally {
                hideLoading();
            }
        },

        // 搜索软件
        async searchSoftware() {
            const keyword = this.searchKeyword.trim();
            if (!keyword) {
                // 空关键词时回到完整列表
                await this.loadSoftware();
                return;
            }
            if (!this.sku) {
                showError('缺少设备 SKU');
                return;
            }
            this.status = 'loading';
            this.errorMessage = '';
            try {
                showLoading();
                const path = `/api/device/software/search?sku=${this.encode(this.sku)}&q=${this.encode(keyword)}`;
                const raw = await this.fetchViaCurl(path);
                const data = JSON.parse(raw);
                this.software = Array.isArray(data.software) ? data.software : [];
                this.isSearchMode = true;
                this.status = 'ready';
                if (this.software.length === 0) {
                    showInfo(`未找到与 "${keyword}" 匹配的软件`);
                }
            } catch (error: any) {
                console.error('搜索软件失败:', error);
                this.status = 'error';
                this.errorMessage = error.message || '搜索失败';
                showError('搜索失败: ' + this.errorMessage);
            } finally {
                hideLoading();
            }
        },

        // 打开搜索软键盘
        openSearchKeyboard() {
            openSoftKeyboard(
                () => this.searchKeyword,
                (value) => {
                    this.searchKeyword = value;
                    this.$forceUpdate();
                }
            );
        },

        // 清空搜索并返回完整列表
        async clearSearch() {
            this.searchKeyword = '';
            await this.loadSoftware();
        },

        // 查看软件详情
        async openDetail(appid: string) {
            if (!this.sku) {
                showError('缺少设备 SKU');
                return;
            }
            this.status = 'loading';
            this.errorMessage = '';
            try {
                showLoading();
                const path = `/api/device/software/detail?sku=${this.encode(this.sku)}&appid=${this.encode(appid)}`;
                const raw = await this.fetchViaCurl(path);
                const data = JSON.parse(raw) as SoftwareDetail;
                this.detail = data;
                this.view = 'detail';
                this.status = 'ready';
            } catch (error: any) {
                console.error('获取软件详情失败:', error);
                this.status = 'error';
                this.errorMessage = error.message || '获取详情失败';
                showError('获取详情失败: ' + this.errorMessage);
            } finally {
                hideLoading();
            }
        },

        // 从详情返回列表
        backToList() {
            this.view = 'list';
            this.detail = null;
            this.status = 'ready';
        },

        // 格式化文件大小
        formatSize(size: number): string {
            if (!size || size <= 0) return '未知';
            if (size < 1024) return `${size} B`;
            if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
            if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
            return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
        },

        // 拼接完整图标地址
        fullIconUrl(iconUrl: string): string {
            if (!iconUrl) return '';
            if (iconUrl.indexOf('http') === 0) return iconUrl;
            return `${STORE_BASE_URL}${iconUrl}`;
        },

        // 下载并安装当前详情软件
        async installDetail() {
            if (!this.detail) {
                showError('没有可安装的软件');
                return;
            }
            if (!this.shellInitialized || !Shell) {
                showError('Shell 模块未初始化');
                return;
            }
            if (this.isInstalling) {
                showWarning('正在安装中，请稍候');
                return;
            }

            const detail = this.detail;
            const appid = detail.appid;
            const appName = detail.app_name;
            this.isInstalling = true;
            this.status = 'installing';

            // 下载地址：优先使用详情返回的相对路径，否则回退到 by-sku 下载接口
            let downloadUrl = '';
            if (detail.download_url) {
                downloadUrl = this.fullIconUrl(detail.download_url);
            } else {
                downloadUrl = `${STORE_BASE_URL}/api/device/software/download?sku=${this.encode(this.sku)}&appid=${this.encode(appid)}`;
            }

            const timestamp = Date.now();
            this.downloadPath = `/userdisk/store_${appid}_${timestamp}.amr`;

            try {
                showLoading();
                showInfo(`正在下载 ${appName}...`);

                // -L 跟随 302 重定向下载文件
                const downloadCmd = `curl -s -k -L "${downloadUrl}" -o "${this.downloadPath}"`;
                console.log('下载命令:', downloadCmd);
                await Shell.exec(downloadCmd);

                // 等待文件写入
                await new Promise(resolve => setTimeout(resolve, 500));

                // 校验文件存在且非空
                const sizeCmd = `test -f "${this.downloadPath}" && wc -c < "${this.downloadPath}" || echo 0`;
                const fileSize = parseInt((await Shell.exec(sizeCmd)).trim()) || 0;
                if (fileSize <= 0) {
                    throw new Error('下载失败，文件为空');
                }
                console.log(`下载完成，大小: ${fileSize} 字节`);

                showInfo(`正在安装 ${appName}...`);
                const installCmd = `miniapp_cli install "${this.downloadPath}"`;
                console.log('安装命令:', installCmd);
                const installResult = await Shell.exec(installCmd);
                console.log('安装结果:', installResult);

                showSuccess(`${appName} 安装完成！`);
                this.status = 'ready';

                // 清理临时文件
                setTimeout(async () => {
                    try {
                        await Shell.exec(`rm -f "${this.downloadPath}"`);
                    } catch (e) {
                        console.warn('清理临时文件失败:', e);
                    }
                }, 3000);
            } catch (error: any) {
                console.error('安装失败:', error);
                this.status = 'error';
                this.errorMessage = error.message || '安装失败';
                showError(`安装失败: ${this.errorMessage}`);
                showInfo(`可手动安装: miniapp_cli install ${this.downloadPath}`);
            } finally {
                this.isInstalling = false;
                hideLoading();
            }
        },

        // 重试加载
        retry() {
            if (this.view === 'detail' && this.detail) {
                this.openDetail(this.detail.appid);
            } else if (!this.sku) {
                this.loadSku().then(() => {
                    if (this.sku) this.loadSoftware();
                });
            } else {
                this.loadSoftware();
            }
        },

        // 返回键处理
        handleBackPress() {
            if (this.view === 'detail') {
                this.backToList();
                return;
            }
            this.$page.finish();
        },
    }
});

export default store;
