<!--
 Copyright (C) 2025 Langning Chen
 
 This file is part of miniapp.
 
 miniapp is free software: you can redistribute it and/or modify
 it under the terms of the GNU General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.
 
 miniapp is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.
 
 You should have received a copy of the GNU General Public License
 along with miniapp.  If not, see <https://www.gnu.org/licenses/>.
-->

<template>
<div>
<scroller class="container" scroll-direction="vertical" :show-scrollbar="true">

    <!-- 设备状态 -->
    <div class="section">
        <text class="section-title">设备状态</text>
        <div class="info-card">
            <div class="status-row">
                <div class="status-item">
                    <text class="status-label">当前槽位</text>
                    <text class="status-value">{{ currentSlotDisplay }}</text>
                </div>
                <div class="status-item">
                    <text class="status-label">userdisk</text>
                    <text :class="'status-value ' + userdiskStatusClass">{{ userdiskMounted ? '已挂载' : '未挂载' }}</text>
                </div>
            </div>
            <div class="btn-row">
                <div class="btn btn-refresh" @click="refreshDeviceInfo">
                    <text>刷新状态</text>
                </div>
            </div>
        </div>
    </div>

    <!-- 备份分区 -->
    <div class="section">
        <text class="section-title">备份分区</text>
        <div class="info-card">
            <text class="card-hint">选择要备份的分区，镜像将保存到 /userdisk/paper/image/</text>

            <!-- 分区列表 -->
            <div class="partition-grid" v-if="partitions.length > 0">
                <div
                    v-for="p in partitions"
                    :key="p.name"
                    @click="selectPartition(p.name)"
                    :class="['partition-chip', backupSelectedPartition === p.name ? 'chip-selected' : '']"
                >
                    <text class="chip-text">{{ p.name }}</text>
                </div>
            </div>

            <div v-if="backupRunning" class="progress-text">
                <text>{{ backupProgress }}</text>
            </div>

            <div class="btn-row">
                <div @click="startBackup" :class="['btn', 'btn-primary', canBackup ? '' : 'btn-disabled']">
                    <text>备份选中分区</text>
                </div>
                <div class="btn btn-secondary" @click="loadPartitions">
                    <text>刷新分区</text>
                </div>
            </div>
        </div>
    </div>

    <!-- 刷入镜像 -->
    <div class="section">
        <text class="section-title">刷入镜像</text>
        <div class="info-card">
            <text class="card-hint">选择要刷入的 .img 镜像文件</text>

            <!-- 槽位选择 -->
            <div v-if="flashImageHasSlot" class="slot-selector">
                <text class="selector-label">目标槽位</text>
                <div class="slot-btn-group">
                    <div
                        @click="flashTargetSlot = '_a'"
                        :class="['slot-btn', flashTargetSlot === '_a' ? 'slot-active' : '']"
                    >
                        <text>A 槽</text>
                    </div>
                    <div
                        @click="flashTargetSlot = '_b'"
                        :class="['slot-btn', flashTargetSlot === '_b' ? 'slot-active' : '']"
                    >
                        <text>B 槽</text>
                    </div>
                </div>
                <text v-if="flashTargetSlot === '_a' && currentSlot === '_a'" class="slot-warn">当前运行槽位</text>
                <text v-if="flashTargetSlot === '_b' && currentSlot === '_b'" class="slot-warn">当前运行槽位</text>
            </div>

            <!-- 目标分区预览 -->
            <div v-if="flashTargetPartition" class="target-preview">
                <text class="preview-label">目标分区: {{ flashTargetPartition }}</text>
            </div>

            <!-- 镜像列表 -->
            <div v-if="images.length > 0" class="image-list">
                <div
                    v-for="img in images"
                    :key="img.path"
                    @click="selectImage(img.path)"
                    :class="['image-item', flashSelectedImage === img.path ? 'image-selected' : '']"
                >
                    <text class="image-name">{{ img.name }}</text>
                    <text class="image-meta">{{ img.size }} | {{ img.date }}</text>
                    <text class="image-type">{{ img.type }}</text>
                </div>
            </div>
            <text v-else-if="!imagesLoading" class="empty-text">暂无镜像文件 (将 .img 放入 /userdisk/paper/image/)</text>

            <div v-if="flashRunning" class="progress-text flash-warning">
                <text>{{ flashProgress }}</text>
            </div>

            <div class="btn-row">
                <div @click="startFlash" :class="['btn', 'btn-danger', canFlash ? '' : 'btn-disabled']">
                    <text>刷入选中镜像</text>
                </div>
                <div class="btn btn-secondary" @click="loadImages">
                    <text>刷新列表</text>
                </div>
            </div>
        </div>
    </div>

    <!-- 系统工具 -->
    <div class="section">
        <text class="section-title">系统工具</text>
        <div class="info-card">
            <div class="tool-grid">
                <div @click="fixUserdisk" :class="['tool-btn', toolRunning === 'fix_mount' ? 'tool-running' : '']">
                    <text class="tool-icon">/</text>
                    <text class="tool-label">修复挂载</text>
                </div>
                <div @click="changeRwPermission" :class="['tool-btn', toolRunning === 'rw_perm' ? 'tool-running' : '']">
                    <text class="tool-icon">R</text>
                    <text class="tool-label">RW 权限</text>
                </div>
                <div @click="restoreSoftware" :class="['tool-btn', toolRunning === 'restore' ? 'tool-running' : '']">
                    <text class="tool-icon">S</text>
                    <text class="tool-label">恢复软件</text>
                </div>
            </div>
        </div>
    </div>

    <!-- 快捷操作 -->
    <div class="section">
        <text class="section-title">快捷操作</text>
        <div class="info-card">
            <div class="btn-row">
                <div class="btn btn-danger" @click="switchSlot">
                    <text>切换槽位</text>
                </div>
                <div class="btn btn-secondary" @click="rebootDevice">
                    <text>重启设备</text>
                </div>
            </div>
        </div>
    </div>

    <!-- 使用说明 -->
    <div class="section">
        <text class="section-title">使用说明</text>
        <div class="info-card">
            <text class="instruction-text">备份: 选择分区 → 点击"备份选中分区" → 等待完成
刷机: 将 .img 镜像放入 /userdisk/backup/ 或 /userdisk/paper/image/ → 选择镜像 → 刷入
镜像文件命名自动匹配槽位（如 system.img → system_a/sytem_b）

危险操作:
- 刷写 boot/system/vendor_boot 分区可能导致设备无法启动
- 请务必在操作前备份原始分区
- 切换槽位和重启系统会断开当前连接

工具:
- 修复挂载: 重建 /dev/block/by-name/userdisk 链接并重新挂载
- RW 权限: 使根文件系统可写（重启后生效）
- 恢复软件: 批量安装 /userdisk/paper/ 下的 .amr 文件</text>
        </div>
    </div>

</scroller>
<Loading/>
<ToastMessage/>
</div>
</template>

<style lang="less" scoped>
@import url('backup.less');
</style>

<script>
import backup from './backup';
import Loading from '../../components/Loading.vue';
import ToastMessage from '../../components/ToastMessage.vue';
export default{...backup,components:{Loading,ToastMessage}};
</script>
