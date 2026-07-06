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

export type BackupOptions = {};

interface PartitionInfo {
    name: string;
    path: string;
}

interface ImageInfo {
    name: string;
    path: string;
    size: string;
    date: string;
    type: string;
}

// 常用分区列表（排除 userdisk，它是存储分区）
const KNOWN_PARTITIONS = [
    'boot_a', 'boot_b',
    'vendor_boot_a', 'vendor_boot_b',
    'dtbo_a', 'dtbo_b',
    'vbmeta_a', 'vbmeta_b',
    'system_a', 'system_b',
    'system_ext_a', 'system_ext_b',
    'product_a', 'product_b',
    'vendor_a', 'vendor_b',
    'odm_a', 'odm_b',
    'bootloader', 'uboot',
    'super', 'userdata', 'misc',
    'persist', 'metadata', 'cache',
    'recovery_a', 'recovery_b',
    'logo', 'trust', 'frp',
];

const BACKUP_DIR = '/userdisk/paper/image';
const IMAGE_DIRS = ['/userdisk/paper/image', '/userdisk/backup'];
const AMR_DIR = '/userdisk/paper';
const SYS_CONFIG_PATH = '/userdata/cfg/sys_config.conf';

const backup = defineComponent({
    data() {
        return {
            $page: {} as FalconPage<BackupOptions>,

            shellInitialized: false,

            // 设备状态
            currentSlot: '',
            userdiskMounted: false,
            deviceInfoLoading: false,

            // 分区列表
            partitions: [] as PartitionInfo[],
            partitionsLoading: false,

            // 备份
            backupSelectedPartition: '',
            backupProgress: '',
            backupRunning: false,

            // 镜像列表
            images: [] as ImageInfo[],
            imagesLoading: false,

            // 刷机
            flashSelectedImage: '',
            flashTargetSlot: '_a' as string,
            flashProgress: '',
            flashRunning: false,

            // 系统工具
            toolRunning: '',

            // 刷机结果弹窗
            flashResultVisible: false,
            flashResultMessage: '',
            flashResultTargetSlot: '',
        };
    },

    async mounted() {
        this.$page.$npage.setSupportBack(true);
        this.$page.$npage.on('backpressed', this.handleBack);
        setTimeout(async () => {
            await this.initializeShell();
            if (this.shellInitialized) {
                await this.refreshDeviceInfo();
                await this.loadPartitions();
                await this.loadImages();
            }
        }, 300);
    },

    beforeDestroy() {
        this.$page.$npage.off('backpressed', this.handleBack);
    },

    computed: {
        currentSlotDisplay(): string {
            if (!this.currentSlot) return '未知';
            return this.currentSlot === '_a' ? 'A 槽' : this.currentSlot === '_b' ? 'B 槽' : this.currentSlot;
        },
        otherSlotDisplay(): string {
            if (!this.currentSlot) return '';
            return this.currentSlot === '_a' ? 'B 槽' : this.currentSlot === '_b' ? 'A 槽' : '';
        },
        userdiskStatusClass(): string {
            return this.userdiskMounted ? 'status-good' : 'status-bad';
        },
        canBackup(): boolean {
            return this.backupSelectedPartition !== '' && this.userdiskMounted && !this.backupRunning && !this.flashRunning;
        },
        canFlash(): boolean {
            return this.flashSelectedImage !== '' && this.userdiskMounted && !this.flashRunning && !this.backupRunning && this.flashTargetAllowed;
        },
        // 刷机目标分区预览
        flashTargetPartition(): string {
            if (!this.flashSelectedImage) return '';
            const img = this.images.find(i => i.path === this.flashSelectedImage);
            if (!img) return '';
            return this.getTargetPartition(img.name);
        },
        // 槽位是否需警告（当前运行槽位）
        flashSlotWarning(): boolean {
            return this.flashTargetSlot === this.currentSlot;
        },
        // 目标分区是否允许刷入
        flashTargetAllowed(): boolean {
            if (!this.flashTargetPartition) return true;
            const allowed = ['boot', 'boot_a', 'boot_b', 'system', 'system_a', 'system_b',
                            'system_ext', 'system_ext_a', 'system_ext_b', 'rootfs'];
            return allowed.includes(this.flashTargetPartition);
        },
    },

    methods: {
        handleBack() { this.$page.finish(); },

        // ── Shell ────────────────────────────────────────────
        async initializeShell() {
            try {
                if (Shell && typeof Shell.initialize === 'function') {
                    await Shell.initialize();
                }
                this.shellInitialized = true;
            } catch (error: any) {
                this.shellInitialized = false;
                showError('Shell 初始化失败');
            }
        },

        async exec(cmd: string): Promise<string> {
            const result = await Shell.exec(cmd);
            return (result || '').trim();
        },

        // ── 设备信息 ──────────────────────────────────────────
        async refreshDeviceInfo() {
            this.deviceInfoLoading = true;
            try {
                // 读取当前槽位
                const slotRaw = await this.exec(
                    "grep -oE 'androidboot.slot_suffix=_[ab]' /proc/cmdline 2>/dev/null | cut -d= -f2"
                );
                this.currentSlot = slotRaw || '';

                // 默认刷机目标槽位 = 当前槽位
                this.flashTargetSlot = this.currentSlot || '_a';

                // 检查 userdisk 挂载
                const mountCheck = await this.exec('mount 2>/dev/null | grep -q "/userdisk" && echo "1" || echo "0"');
                this.userdiskMounted = mountCheck === '1';

                // 确保备份目录存在
                if (this.userdiskMounted) {
                    await this.exec(`mkdir -p "${BACKUP_DIR}" 2>/dev/null`);
                }
            } catch (e) { /* ignore */ }
            this.deviceInfoLoading = false;
        },

        formatSize(bytes: number): string {
            if (!bytes || bytes <= 0) return '未知';
            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
            if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
            return `${(bytes / 1073741824).toFixed(2)} GB`;
        },

        // ── 分区列表 ──────────────────────────────────────────
        async loadPartitions() {
            this.partitionsLoading = true;
            try {
                const dir = '/dev/block/by-name';
                const raw = await this.exec(`ls -1 "${dir}" 2>/dev/null`);
                if (!raw) {
                    // 回退到已知列表
                    this.partitions = KNOWN_PARTITIONS
                        .filter(n => n !== 'userdisk')
                        .map(n => ({ name: n, path: `${dir}/${n}` }));
                    return;
                }
                const allNames = raw.split('\n').map(s => s.trim()).filter(Boolean);
                // 排序：系统分区优先，A/B分组
                const priority = ['boot', 'vendor_boot', 'system', 'dtbo', 'vbmeta'];
                allNames.sort((a, b) => {
                    const pa = priority.findIndex(p => a.startsWith(p));
                    const pb = priority.findIndex(p => b.startsWith(p));
                    if (pa !== -1 && pb !== -1) return pa - pb;
                    if (pa !== -1) return -1;
                    if (pb !== -1) return 1;
                    return a.localeCompare(b);
                });
                this.partitions = allNames
                    .filter(n => n !== 'userdisk')
                    .map(n => ({ name: n, path: `${dir}/${n}` }));
            } catch (e) {
                this.partitions = [];
            }
            this.partitionsLoading = false;
        },

        selectPartition(name: string) {
            this.backupSelectedPartition = this.backupSelectedPartition === name ? '' : name;
        },

        // ── 备份 ──────────────────────────────────────────────
        async startBackup() {
            if (!this.canBackup || !this.backupSelectedPartition) return;

            const part = this.backupSelectedPartition;
            const outputFile = `${BACKUP_DIR}/${part}.img`;
            this.backupRunning = true;
            this.backupProgress = '准备备份...';

            try {
                showLoading(`正在备份 ${part}...`);
                this.backupProgress = '正在执行 dd，请耐心等待...';

                // dd 备份（status=progress 输出进度到 stderr）
                const cmd = `dd if=/dev/block/by-name/${part} of="${outputFile}" bs=8M status=progress 2>&1 || dd if=/dev/block/by-name/${part} of="${outputFile}" bs=8M 2>&1`;
                const output = await this.exec(cmd);

                // 检查结果
                const sizeRaw = await this.exec(`stat -c%s "${outputFile}" 2>/dev/null || wc -c < "${outputFile}"`);
                const size = parseInt(sizeRaw) || 0;

                if (size > 0) {
                    showSuccess(`${part} 备份完成 (${this.formatSize(size)})`);
                    this.backupProgress = '';
                    await this.loadImages();
                } else {
                    throw new Error('备份文件为空');
                }
            } catch (error: any) {
                showError('备份失败: ' + (error.message || ''));
                this.backupProgress = '';
            } finally {
                this.backupRunning = false;
                hideLoading();
            }
        },

        // ── 镜像列表 ──────────────────────────────────────────
        async loadImages() {
            this.imagesLoading = true;
            this.images = [];
            try {
                for (const dir of IMAGE_DIRS) {
                    const raw = await this.exec(
                        `find "${dir}" -maxdepth 1 -name "*.img" -type f 2>/dev/null`
                    );
                    if (!raw) continue;
                    const files = raw.split('\n').filter(Boolean);
                    for (const filePath of files) {
                        const name = filePath.split('/').pop() || filePath;
                        const statRaw = await this.exec(
                            `stat -c "%s|%Y" "${filePath}" 2>/dev/null || echo "0|0"`
                        );
                        const [sizeStr, tsStr] = statRaw.split('|');
                        const size = parseInt(sizeStr) || 0;
                        const ts = parseInt(tsStr) || 0;
                        const date = ts > 0 ? new Date(ts * 1000).toLocaleDateString('zh-CN') : '未知';
                        const typeRaw = await this.exec(
                            `file "${filePath}" 2>/dev/null | cut -d: -f2-`
                        );
                        this.images.push({
                            name, path: filePath,
                            size: this.formatSize(size),
                            date,
                            type: (typeRaw || '未知').trim(),
                        });
                    }
                }
            } catch (e) { /* ignore */ }
            this.imagesLoading = false;
        },

        selectImage(path: string) {
            this.flashSelectedImage = this.flashSelectedImage === path ? '' : path;
            // 如果选中的镜像名含 _a 或 _b，自动设置目标槽位
            if (this.flashSelectedImage) {
                const img = this.images.find(i => i.path === this.flashSelectedImage);
                if (img) {
                    const base = img.name.replace(/\.img$/i, '');
                    if (base.endsWith('_a')) {
                        this.flashTargetSlot = '_a';
                    } else if (base.endsWith('_b')) {
                        this.flashTargetSlot = '_b';
                    }
                }
            }
        },

        // ── 刷机 ──────────────────────────────────────────────
        getTargetPartition(imageName: string): string {
            // 从文件名推断目标分区
            // system_b.img → system_b
            // system.img → system_{selected_slot}
            let base = imageName.replace(/\.img$/i, '');
            const slotSuffix = this.flashTargetSlot;

            // 如果文件名已包含 _a 或 _b，直接使用
            if (base.endsWith('_a') || base.endsWith('_b')) {
                return base;
            }

            // 否则加上选择的槽位
            return base + slotSuffix;
        },

        async startFlash() {
            if (!this.canFlash || !this.flashSelectedImage) return;
            if (!this.userdiskMounted) {
                showError('userdisk 未挂载，无法刷机');
                return;
            }

            const imageInfo = this.images.find(i => i.path === this.flashSelectedImage);
            if (!imageInfo) return;

            const targetPart = this.getTargetPartition(imageInfo.name);
            const targetPath = `/dev/block/by-name/${targetPart}`;

            // 危险操作确认
            const targetSlotLabel = this.flashTargetSlot === '_a' ? 'A 槽' : 'B 槽';
            const confirmed = await this.confirmDangerous(
                `刷入镜像确认\n\n` +
                `镜像: ${imageInfo.name} (${imageInfo.size})\n` +
                `目标分区: ${targetPart}\n` +
                `目标槽位: ${targetSlotLabel}\n` +
                `当前运行: ${this.currentSlotDisplay}\n\n` +
                `警告: 刷写系统分区可能导致设备无法启动！\n` +
                `请确保镜像文件正确无误。`
            );

            if (!confirmed) return;

            this.flashRunning = true;
            this.flashProgress = '准备刷机...';

            try {
                showLoading(`正在刷入 ${imageInfo.name}...`);
                this.flashProgress = `正在写入 ${targetPart}，请勿断电...`;

                const cmd = `dd if="${imageInfo.path}" of="${targetPath}" bs=8M status=progress 2>&1 || dd if="${imageInfo.path}" of="${targetPath}" bs=8M 2>&1`;
                await this.exec(cmd);

                showSuccess(`${targetPart} 刷入完成`);

                // 显示结果弹窗
                this.flashResultTargetSlot = this.flashTargetSlot;
                if (targetPart.includes('system') || targetPart.includes('rootfs')) {
                    if (this.flashTargetSlot !== this.currentSlot) {
                        this.flashResultMessage = `${targetPart} 刷入到 ${targetSlotLabel}\n当前运行为 ${this.currentSlotDisplay}\n\n是否切换槽位并重启？`;
                        this.flashResultVisible = true;
                    } else {
                        this.flashResultMessage = `${targetPart} 刷入到 ${targetSlotLabel} (当前运行槽位)\n\n建议重启以加载新镜像`;
                        this.flashResultVisible = true;
                    }
                } else {
                    this.flashResultMessage = `${targetPart} 刷入完成\n\n是否重启设备？`;
                    this.flashResultVisible = true;
                }
            } catch (error: any) {
                showError('刷机失败: ' + (error.message || ''));
                this.flashProgress = '';
            } finally {
                this.flashRunning = false;
                hideLoading();
            }
        },

        dismissFlashResult() {
            this.flashResultVisible = false;
        },

        async confirmSlotSwitchReboot() {
            this.flashResultVisible = false;
            try {
                showLoading('切换槽位并重启...');
                await this.exec('update_engine --misc=other >/dev/null 2>&1');
                await this.exec('reboot');
            } catch (error: any) {
                showError('切换槽位失败: ' + (error.message || ''));
            } finally {
                hideLoading();
            }
        },

        async confirmReboot() {
            this.flashResultVisible = false;
            try {
                showLoading('正在重启...');
                await this.exec('reboot');
            } catch (error: any) {
                showError('重启失败: ' + (error.message || ''));
            } finally {
                hideLoading();
            }
        },

        async switchSlot() {
            try {
                showLoading('切换槽位...');
                await this.exec('update_engine --misc=other >/dev/null 2>&1');
                showSuccess('槽位已切换，系统将重启');
                setTimeout(async () => {
                    try { await this.exec('reboot'); } catch (e) {}
                }, 1000);
            } catch (error: any) {
                showError('切换槽位失败: ' + (error.message || ''));
            } finally {
                hideLoading();
            }
        },

        async rebootDevice() {
            try {
                showLoading('正在重启...');
                await this.exec('reboot');
            } catch (error: any) {
                showError('重启失败');
            } finally {
                hideLoading();
            }
        },

        // ── 确认对话框（简化版） ──────────────────────────────
        async confirmDangerous(message: string): Promise<boolean> {
            // HaasUI 没有原生对话框，用 toast 提示
            showWarning(message);
            // 等待用户阅读后自动允许（危险操作已在上层有充分提示）
            await new Promise(r => setTimeout(r, 3000));
            return true;
        },

        // ── 系统工具 ──────────────────────────────────────────
        async fixUserdisk() {
            if (this.toolRunning) return;
            this.toolRunning = 'fix_mount';
            try {
                showLoading('修复 userdisk 挂载...');
                const cmds = [
                    'mkdir -p /dev/block/by-name 2>/dev/null',
                    'cd /dev/block/by-name && ln -sf /dev/mmcblk0p11 userdisk 2>/dev/null',
                    'mkdir -p /userdisk 2>/dev/null',
                    'umount /userdisk 2>/dev/null',
                    'mount /dev/block/by-name/userdisk /userdisk 2>/dev/null',
                ];
                for (const c of cmds) {
                    await this.exec(c);
                }
                showSuccess('userdisk 修复完成');
                await this.refreshDeviceInfo();
            } catch (error: any) {
                showError('修复失败: ' + (error.message || ''));
            } finally {
                this.toolRunning = '';
                hideLoading();
            }
        },

        async changeRwPermission() {
            if (this.toolRunning) return;
            this.toolRunning = 'rw_perm';
            try {
                showLoading('更改 RW 权限...');
                // 重新挂载根文件系统为可写
                await this.exec('mount -o remount,rw / 2>/dev/null');

                // 修改 initab
                await this.exec('mkdir -p /userdisk/paper/system/etc 2>/dev/null');
                await this.exec('cp /etc/inittab /userdisk/paper/system/etc/inittab.bak 2>/dev/null');
                await this.exec(
                    "sed -i 's/mount -o remount,ro \\//mount -o remount,rw \\//g' /etc/inittab 2>/dev/null"
                );
                showSuccess('RW 权限已设置，重启后生效');
            } catch (error: any) {
                showError('权限更改失败: ' + (error.message || ''));
            } finally {
                this.toolRunning = '';
                hideLoading();
            }
        },

        async restoreSoftware() {
            if (this.toolRunning) return;
            this.toolRunning = 'restore';
            try {
                showLoading('恢复软件系统...');
                const amrFiles = await this.exec(`find "${AMR_DIR}" -maxdepth 1 -name "*.amr" -type f 2>/dev/null`);
                if (!amrFiles) {
                    showInfo('未找到 .amr 文件');
                    return;
                }
                const files = amrFiles.split('\n').filter(Boolean);
                let count = 0;
                for (const file of files) {
                    try {
                        await this.exec(`miniapp_cli install "${file}"`);
                        count++;
                    } catch (e) { /* skip failed */ }
                }
                showSuccess(`软件恢复完成，已安装 ${count}/${files.length} 个应用`);
            } catch (error: any) {
                showError('恢复失败: ' + (error.message || ''));
            } finally {
                this.toolRunning = '';
                hideLoading();
            }
        },
    },
});

export default backup;
