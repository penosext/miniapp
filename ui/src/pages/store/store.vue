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

<!-- 软件列表视图 -->
<div v-if="view === 'list'">
    <!-- 头部状态 -->
    <div class="section">
        <text class="section-title">软件商店</text>
        <div class="info-card">
            <div class="status-line">
                <text class="status-label">状态:</text>
                <text class="status-value">{{statusText}}</text>
            </div>
            <div class="version-line">
                <text class="version-label">设备 SKU:</text>
                <text class="version-text">{{sku || '未读取'}}</text>
            </div>
        </div>
    </div>

    <!-- 搜索栏 -->
    <div class="section">
        <div class="search-row">
            <text class="search-input" @click="openSearchKeyboard">{{searchKeyword || '点击输入关键词搜索'}}</text>
            <div class="search-btn" @click="searchSoftware"><text class="search-btn-text">搜索</text></div>
        </div>
        <div v-if="isSearchMode" class="clear-search" @click="clearSearch">
            <text class="clear-search-text">显示全部软件</text>
        </div>
    </div>

    <!-- 软件列表 -->
    <div class="section">
        <text class="section-title">{{isSearchMode ? '搜索结果' : '可用软件'}}</text>

        <div v-if="isEmpty" class="info-card">
            <text class="empty-text">暂无可用软件</text>
        </div>

        <div v-if="status === 'error'" class="info-card">
            <text class="error-text">{{errorMessage || '加载失败'}}</text>
            <div class="action-btn main-btn" @click="retry"><text>重试</text></div>
        </div>

        <div v-for="item in software" :key="item.appid" class="app-item" @click="openDetail(item.appid)">
            <image v-if="item.icon_url" class="app-icon" resize="contain" :src="fullIconUrl(item.icon_url)" />
            <div v-else class="app-icon-placeholder"><text class="app-icon-placeholder-text">APP</text></div>
            <div class="app-info">
                <text class="app-name">{{item.app_name}}</text>
                <text class="app-version">v{{item.latest_version}}</text>
                <text class="app-desc">{{item.software_description}}</text>
            </div>
        </div>
    </div>
</div>

<!-- 软件详情视图 -->
<div v-if="view === 'detail' && detail">
    <div class="section">
        <div class="detail-header" @click="backToList">
            <text class="back-text">‹ 返回列表</text>
        </div>
    </div>

    <div class="section">
        <div class="info-card">
            <div class="detail-top">
                <image v-if="detail.icon_url" class="detail-icon" resize="contain" :src="fullIconUrl(detail.icon_url)" />
                <div v-else class="detail-icon-placeholder"><text class="app-icon-placeholder-text">APP</text></div>
                <div class="detail-title-box">
                    <text class="detail-name">{{detail.app_name}}</text>
                    <text class="detail-version">v{{detail.latest_version}}</text>
                </div>
            </div>

            <div class="version-line">
                <text class="version-label">文件大小:</text>
                <text class="version-text">{{formatSize(detail.size)}}</text>
            </div>
            <div class="version-line">
                <text class="version-label">APPID:</text>
                <text class="version-text">{{detail.appid}}</text>
            </div>

            <div class="action-btn install-btn" :class="isInstalling ? 'disabled' : ''" @click="installDetail">
                <text>{{isInstalling ? '安装中...' : '下载并安装'}}</text>
            </div>
        </div>
    </div>

    <div v-if="detail.software_description" class="section">
        <text class="section-title">软件介绍</text>
        <div class="info-card">
            <text class="release-content">{{detail.software_description}}</text>
        </div>
    </div>

    <div v-if="detail.update_description" class="section">
        <text class="section-title">更新说明</text>
        <div class="info-card">
            <text class="release-content">{{detail.update_description}}</text>
        </div>
    </div>
</div>

</scroller>
<Loading/>
<ToastMessage/>
</div>
</template>

<style lang="less" scoped>
@import url('store.less');
</style>

<script>
import store from './store';
import Loading from '../../components/Loading.vue';
import ToastMessage from '../../components/ToastMessage.vue';
export default { ...store, components: { Loading, ToastMessage } };
</script>
