<template>
  <div class="container">
    <scroller class="scroll-area" scroll-direction="vertical">
      <!-- 页面标题 -->
      <div class="header">
        <text class="welcome-title">杂项设置</text>
        <text class="welcome-subtitle">Miscellaneous Settings</text>
      </div>

      <!-- 亮屏时间 -->
      <div class="section">
        <text class="section-title">亮屏时间设置</text>
        <div class="info-card">
          <div class="btn-row">
            <div class="btn-item" @click="setBrightTime(30, '30秒')">
              <text class="btn-text">30秒</text>
            </div>
            <div class="btn-item" @click="setBrightTime(1800, '30分钟')">
              <text class="btn-text">30分钟</text>
            </div>
          </div>
          <div class="btn-row">
            <div class="btn-item" @click="setBrightTime(3600, '1小时')">
              <text class="btn-text">1小时</text>
            </div>
            <div class="btn-item" @click="setBrightTime(7200, '2小时')">
              <text class="btn-text">2小时</text>
            </div>
          </div>
          <div class="btn-row">
            <div class="btn-item" @click="setBrightTime(10800, '3小时')">
              <text class="btn-text">3小时</text>
            </div>
            <div class="btn-item" @click="setBrightTime(2147483647, '无限')">
              <text class="btn-text">无限</text>
            </div>
          </div>
        </div>
      </div>

      <!-- 屏幕亮度 -->
      <div class="section">
        <text class="section-title">屏幕亮度设置</text>
        <div class="info-card">
          <div class="btn-row">
            <div class="btn-item" @click="setBrightness(30)">
              <text class="btn-text">低亮度</text>
            </div>
            <div class="btn-item" @click="setBrightness(60)">
              <text class="btn-text">中亮度</text>
            </div>
            <div class="btn-item" @click="setBrightness(100)">
              <text class="btn-text">高亮度</text>
            </div>
          </div>
        </div>
      </div>

      <!-- 手电筒 -->
      <div class="section">
        <text class="section-title">手电筒控制</text>
        <div class="info-card">
          <div class="btn-row">
            <div :class="['btn-item', 'wide', torchOn ? 'btn-item-active' : '']" @click="toggleTorch">
              <text class="btn-text">{{ torchOn ? '关闭手电筒' : '打开手电筒' }}</text>
            </div>
          </div>
        </div>
      </div>

    </scroller>
  </div>
</template>

<style lang="less" scoped>
@import './misc.less';
</style>

<script>
import misc from './misc';
export default misc;
</script>