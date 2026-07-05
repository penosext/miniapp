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
<div class="app">

    <div class="main">

        <!-- 浏览 / 已装 模式 -->
        <template v-if="!searchMode">
            <div class="store-header">
                <text class="store-title">应用商店</text>
                <text class="store-subtitle">{{ activeTab === 'browse' ? filteredApps.length : installedApps.length }} 个应用</text>
            </div>

            <div class="tabs-wrap">
                <div v-for="cat in categories" :key="cat.key"
                    :class="'tab-item ' + (activeCategory === cat.key ? 'tab-active' : '')"
                    @click="onSelectCategory(cat.key)">
                    <text class="tab-text">{{cat.label}}</text>
                </div>
            </div>

            <scroller class="scroll" scroll-direction="vertical" :show-scrollbar="true">

                <div v-if="isLoading" class="loading-wrap">
                    <text class="loading-text">正在刷新源...</text>
                </div>

                <!-- 浏览 -->
                <template v-if="activeTab === 'browse' && !isLoading">
                    <div v-if="filteredApps.length === 0" class="empty-wrap">
                        <text class="empty-text">未找到相关应用</text>
                    </div>
                    <div v-for="(row, ri) in appRows" :key="'b_'+ri" class="card-row">
                        <div v-for="(app, ai) in row" :key="ai" class="app-card" @click="showDetail(app)">
                            <image v-if="app.icon_url" class="card-icon" :src="fullIconUrl(app.icon_url)" resize="contain" />
                            <div v-else class="card-icon-placeholder"><text class="card-icon-ph-text">APP</text></div>
                            <text class="card-name">{{app.app_name || app.appid}}</text>
                            <text class="card-version">v{{app.latest_version || '-'}}</text>
                            <text class="card-desc">{{app.software_description || ''}}</text>
                        </div>
                        <div v-if="row.length < 2" class="card-ph"></div>
                    </div>
                </template>

                <!-- 已装 -->
                <template v-if="activeTab === 'installed' && !isLoading">
                    <div v-if="installedApps.length === 0" class="empty-wrap">
                        <text class="empty-text">还没有安装应用</text>
                    </div>
                    <div v-for="(row, ri) in installedRows" :key="'i_'+ri" class="card-row">
                        <div v-for="(app, ai) in row" :key="ai" class="app-card" @click="showDetail(app)">
                            <image v-if="app.icon_url" class="card-icon" :src="fullIconUrl(app.icon_url)" resize="contain" />
                            <div v-else class="card-icon-placeholder"><text class="card-icon-ph-text">APP</text></div>
                            <text class="card-name">{{app.app_name || app.appid}}</text>
                            <text class="card-version">v{{app.latest_version || '-'}}</text>
                            <text class="card-desc">{{app.software_description || ''}}</text>
                        </div>
                        <div v-if="row.length < 2" class="card-ph"></div>
                    </div>
                </template>

            </scroller>
        </template>

        <!-- 搜索模式 -->
        <template v-if="searchMode">
            <div class="search-header">
                <div class="search-back" @click="exitSearchMode">
                    <text class="search-back-txt">&lt; 返回</text>
                </div>
                <div class="search-input-wrap">
                    <input class="search-input-native" type="text" :value="keyword" placeholder="输入关键词搜索"
                        @input="onKeywordInput" @click="onKeywordInput" />
                </div>
            </div>

            <scroller class="scroll" scroll-direction="vertical" :show-scrollbar="true">
                <div v-if="!keyword" class="empty-wrap">
                    <text class="empty-text">输入关键词搜索应用</text>
                </div>
                <div v-else-if="isSearching" class="loading-wrap">
                    <text class="loading-text">搜索中...</text>
                </div>
                <div v-else-if="searchResults.length === 0" class="empty-wrap">
                    <text class="empty-text">未找到相关应用</text>
                </div>
                <template v-else>
                    <div v-for="(row, ri) in searchResultRows" :key="'s_'+ri" class="card-row">
                        <div v-for="(app, ai) in row" :key="ai" class="app-card" @click="showDetail(app)">
                            <image v-if="app.icon_url" class="card-icon" :src="fullIconUrl(app.icon_url)" resize="contain" />
                            <div v-else class="card-icon-placeholder"><text class="card-icon-ph-text">APP</text></div>
                            <text class="card-name">{{app.app_name || app.appid}}</text>
                            <text class="card-version">v{{app.latest_version || '-'}}</text>
                            <text class="card-desc">{{app.software_description || ''}}</text>
                        </div>
                        <div v-if="row.length < 2" class="card-ph"></div>
                    </div>
                </template>
            </scroller>
        </template>

        <!-- 详情面板 -->
        <div v-if="showDetailPanel" class="detail-overlay">
            <scroller class="detail-scroll" scroll-direction="vertical" :show-scrollbar="true">
                <div class="detail-content">

                    <div class="detail-hero">
                        <image v-if="currentApp.icon_url" class="detail-hero-icon" :src="fullIconUrl(currentApp.icon_url)" resize="contain" />
                        <div v-else class="detail-hero-icon-ph"><text class="card-icon-ph-text">APP</text></div>
                        <text class="detail-hero-name">{{currentApp.app_name || currentApp.appid}}</text>
                        <text class="detail-hero-version">v{{currentApp.latest_version || '-'}}</text>
                        <text class="detail-hero-size" v-if="currentAppDetail && currentAppDetail.size">{{formatSize(currentAppDetail.size)}}</text>
                    </div>

                    <div class="detail-actions">
                        <div v-if="dlActive" class="detail-dl-wrap">
                            <div class="progress-bar-out">
                                <div class="progress-bar-in" :style="'width:' + dlProgress + '%'"></div>
                            </div>
                            <text class="detail-dl-text">{{dlProgressText || '下载中...'}}</text>
                        </div>
                        <div v-if="!dlActive && !isInstalled" class="detail-btn install-btn" @click="onDownload">
                            <text class="detail-btn-text">下载安装</text>
                        </div>
                        <div class="detail-btn-row" v-if="!dlActive">
                            <div v-if="isInstalled" class="detail-btn open-btn" @click="onOpen">
                                <text class="detail-btn-text">打开</text>
                            </div>
                            <div v-if="isInstalled" class="detail-btn uninstall-btn" @click="onUninstall">
                                <text class="detail-btn-text">卸载</text>
                            </div>
                        </div>
                    </div>

                    <div class="detail-section" v-if="currentApp.software_description">
                        <text class="detail-section-title">软件介绍</text>
                        <text class="detail-section-text">{{currentApp.software_description}}</text>
                    </div>

                    <div class="detail-section" v-if="currentAppDetail && currentAppDetail.update_description">
                        <text class="detail-section-title">更新说明</text>
                        <text class="detail-section-text">{{currentAppDetail.update_description}}</text>
                    </div>

                </div>
            </scroller>

            <div class="detail-close" @click="closeDetail">
                <text class="detail-close-text">&times;</text>
            </div>
        </div>

    </div>

    <!-- 侧栏导航 -->
    <div class="rail">
        <div class="rail-inner">
            <div :class="'rb ' + (searchMode ? 'rb-active' : '')" @click="enterSearchMode">
                <text :class="'rl ' + (searchMode ? 'rl-active' : '')">搜</text>
            </div>
            <div :class="'rb ' + (!searchMode && activeTab === 'browse' ? 'rb-active' : '')" @click="switchTab('browse')">
                <text :class="'rl ' + (!searchMode && activeTab === 'browse' ? 'rl-active' : '')">览</text>
            </div>
            <div :class="'rb ' + (!searchMode && activeTab === 'installed' ? 'rb-active' : '')" @click="switchTab('installed')">
                <text :class="'rl ' + (!searchMode && activeTab === 'installed' ? 'rl-active' : '')">装</text>
            </div>
            <div :class="'rb ' + (isLoading ? 'rb-active' : '')" @click="refreshSources">
                <text class="rl rl-refresh">⟳</text>
            </div>
        </div>
    </div>

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
