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
    <scroller class="container" scroll-direction="vertical" :show-scrollbar="true">
        <!-- 欢迎页眉 -->
        <div class="header">
            <text class="welcome-title">设备管理</text>
            <text class="welcome-subtitle">System Management Toolkit</text>
        </div>

        <div class="section">
            <text class="section-title">功能中心</text>
            
            <div class="menu-grid">
                <div class="menu-card" @click="Backup">
                    <div class="card-icon icon-backup"></div>
                    <text class="card-label">备份/刷机</text>
                    <text class="card-desc">分区备份与镜像还原</text>
                </div>
                <div class="menu-card" @click="Store">
                    <div class="card-icon icon-store"></div>
                    <text class="card-label">软件商店</text>
                    <text class="card-desc">应用安装与更新</text>
                </div>
                <div class="menu-card" @click="PenTerm">
                    <div class="card-icon icon-term"></div>
                    <text class="card-label">PenTerm</text>
                    <text class="card-desc">交互式 Shell 终端</text>
                </div>
                <div class="menu-card" @click="Deviceinfo">
                    <div class="card-icon icon-info"></div>
                    <text class="card-label">设备信息</text>
                    <text class="card-desc">硬件参数与系统状态</text>
                </div>
                <div class="menu-card" @click="Misc">
                    <div class="card-icon icon-misc"></div>
                    <text class="card-label">杂项设置</text>
                    <text class="card-desc">系统底层配置调整</text>
                </div>
                <div class="menu-card" @click="About">
                    <div class="card-icon icon-about"></div>
                    <text class="card-label">关于我们</text>
                    <text class="card-desc">项目信息与贡献者</text>
                </div>       
            </div>
        </div>
    </scroller>
</template>

<style lang="less" scoped>
@import url('index.less');
</style>

<script>
import index from './index';
export default index;
</script>

