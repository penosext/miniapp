<template>
<div>
<scroller class="container" scroll-direction="vertical" :show-scrollbar="true">

<!-- 更新状态 -->
<div class="section">
<text class="section-title">更新状态</text>
<div class="info-card">
<div class="status-line">
<text class="status-label">状态:</text>
<text :class="'status-value ' + statusClass">{{statusText}}</text>
</div>
<div class="version-line">
<text class="version-label">当前版本:</text>
<text class="version-text version-old">v{{currentVersion}}</text>
</div>
<div v-if="latestVersion" class="version-line">
<text class="version-label">最新版本:</text>
<text class="version-text version-new">v{{latestVersion}}</text>
</div>
<div v-if="latestVersion" class="version-line">
<text class="version-label">版本比较:</text>
<text :class="'version-text ' + versionCompareClass">{{versionCompareText}}</text>
</div>

<!-- 按钮组 -->
<div class="button-row">
<div @click="checkForUpdates" class="action-btn main-btn">
<text>检查更新</text>
</div>
<div @click="startDownload" :class="['action-btn install-btn', (!hasUpdate?'no-update-btn':'')]">
<text>{{hasUpdate ? '下载安装' : '暂无更新'}}</text>
</div>
</div>
</div>
</div>

<!-- 下载进度 -->
<div v-if="dlActive" class="section">
<text class="section-title">下载进度</text>
<div class="info-card">
<text class="progress-text">{{dlProgressText}}</text>
<div class="progress-bar-bg">
<div class="progress-bar-fill" :style="{width: dlProgress + '%'}"></div>
</div>
</div>
</div>

<!-- 更新说明 -->
<div v-if="releaseNotes" class="section">
<text class="section-title">更新说明</text>
<div class="info-card">
<scroller class="release-notes" scroll-direction="vertical" :show-scrollbar="true">
<text class="release-content">{{releaseNotes}}</text>
</scroller>
</div>
</div>

<!-- 文件信息 -->
<div v-if="latestVersion && fileSize > 0" class="section">
<text class="section-title">文件信息</text>
<div class="info-card">
<div class="file-info-line">
<text class="file-label">文件大小:</text>
<text class="file-value">{{formattedFileSize}}</text>
</div>
<div v-if="fileChecksum" class="file-info-line">
<text class="file-label">校验值:</text>
<text class="file-value">{{fileChecksum}}</text>
</div>
</div>
</div>

<!-- 使用说明 -->
<div class="section">
<text class="section-title">使用说明</text>
<div class="info-card">
<text class="instruction-text">1. 点击"检查更新"获取最新版本信息
2. 如果有新版本，点击"下载安装"自动完成
3. 安装完成后请重启应用以生效
4. 更新源来自 Pstore：store.posc.net</text>
</div>
</div>

</scroller>
<Loading/>
<ToastMessage/>
</div>
</template>

<style lang="less" scoped>
@import url('update.less');
</style>

<script>
import update from './update';
import Loading from '../../components/Loading.vue';
import ToastMessage from '../../components/ToastMessage.vue';
export default{...update,components:{Loading,ToastMessage}};
</script>
