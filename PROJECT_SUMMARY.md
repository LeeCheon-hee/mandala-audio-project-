# 曼陀罗音频沉浸空间 - 项目总结文档

## 一、项目概览

**产品名称**：Audio-Reactive Mandala（曼陀罗音频沉浸空间）  
**技术栈**：p5.js 1.9.0 + 原生 HTML/CSS/JavaScript  
**主文件**：`sketch.js`（约 1235 行）、`index.html`（约 262 行）

一款基于 Web 的音乐可视化应用，用户授权系统音频后，曼陀罗形态的粒子随音乐频谱实时变化，形成沉浸式视听体验。

---

## 二、核心能力

### 2.1 视觉形态

| 元素 | 说明 |
|------|------|
| 四层曼陀罗 | 半径 120 / 240 / 360 / 480 px，瓣数 6 / 12 / 18 / 24，不同形态（梭形、莲瓣、心形凹陷、圆润大瓣） |
| 中心核 | 六瓣花瓣（1500 粒子）+ 亮核（400 粒子），渐变色彩、轻微跳动 |
| 背景 | 径向渐变（中心深紫蓝→边缘纯黑） |
| 纵深感 | 内层暗、外层亮；瓣缘更亮；粒子透明度按层加权 |

### 2.2 交互模式

| 模式 | 说明 |
|------|------|
| Intro | 粒子漩涡汇聚，带噪点飘动 |
| Converging | 1.5s 汇聚到中心，1s 绽放到曼陀罗 |
| Idle-Flower | 六瓣花静止形态，正弦呼吸 ±15% |
| Audio-Reactive | 随 bass/mid/treble 缩放、谐波、颜色、层级生长 |

### 2.3 音频响应

| 参数 | 驱动 |
|------|------|
| 花瓣缩放 | bass 能量 |
| 花瓣胖瘦 | mid 能量 |
| 谐波幅度 | bass（已弱化至 0.06 倍） |
| 颜色冷暖 | warmth（bass+mid / treble） |
| 层级生长 | 鼓点或 10s 间隔 |
| 鼓点脉冲 | kick 检测 → 圆环波纹 + 粒子径向斥力 |

---

## 三、文件结构

```
mandala-audio-project/
├── index.html          # 入口、布局、样式、UI 节点
├── sketch.js           # 全部逻辑与渲染
├── PRD.md              # 产品需求文档
├── PROJECT_SUMMARY.md  # 项目总结（本文件）
├── README.md           # 快速说明
└── package.json        # 依赖（可选，主应用使用 CDN）
```

---

## 四、代码结构详解

### 4.1 sketch.js 模块划分

| 区块 | 行号约 | 内容 |
|------|--------|------|
| 错误配置 | 6–35 | ERROR_MESSAGES，中英文案 |
| 全局状态 | 37–93 | particles、audio、模式、CONFIG、缓存变量 |
| Particle 类 | 95–518 | constructor、力场、update、draw |
| getLayerShape | 519–557 | 四层花瓣形态公式 |
| setup | 559–648 | 画布、粒子创建、层级、按钮绑定 |
| draw | 650–932 | 主循环、模式分支、粒子更新、波纹、中心核 |
| 音频与授权 | 934–1212 | requestScreenCapture、startExperience、retryAudioCapture、showAudioError |

### 4.2 粒子系统

**层级配置**（setup 内）：
```javascript
layers = [
  { petals: 6,  radius: 120,  particleCount: 4500 },
  { petals: 12, radius: 240,  particleCount: 5500 },
  { petals: 18, radius: 360,  particleCount: 5500 },
  { petals: 24, radius: 480,  particleCount: 4500 }
]
// 合计 20000，CONFIG.PARTICLE_COUNT 限制
```

**粒子属性**：pos、vel、acc、targetLayer、baseLayerRadius、angleOnPetal、isActivated、activationProgress、currentAlpha、baseAlpha、baseHue、satOffsetInLayer、brightnessOffsetInLayer、radiusRatioInPetal、hueOffsetInPetal、isHighlight 等。

**力场流程**（曼陀罗模式）：
1. `applyIdleFlowerForces`：花瓣约束 + 噪点
2. `applyAudioReactiveForces`（有音频时）：音频驱动目标 + 谐波 + 约束
3. `applyPulseWaveForces`（有波纹时）：径向斥力（仅波带内粒子）
4. `updateNormal`：物理积分 + 阻尼

### 4.3 音频检测

- 频率：50fps（20ms 间隔）
- 频谱：bass / mid / treble 三分段平均
- 平滑：EMA（SMOOTH=0.4）+ analyser.smoothingTimeConstant=0.55
- kick：bass 增量 > 40 且 bass > 70

### 4.4 UI 组件（index.html）

| 元素 | id | 用途 |
|------|-----|------|
| 画布容器 | canvas-container | p5 挂载点 |
| 开场 overlay | intro-overlay | 居中开场按钮 |
| 开场按钮 | start-btn | 开启曼陀罗 |
| 状态栏 | status-bar | AUDIO ACTIVE |
| 授权错误 | audio-error | 弹窗容器 |
| 请播放音乐 | play-music-prompt | 居中提示 |
| 沉浸式按钮 | immerse-btn | 曼陀罗内全屏切换 |

---

## 五、性能优化要点

| 优化项 | 实现 |
|--------|------|
| 粒子数 | 20000，中心核 1500+400 |
| noise 交错 | 6 帧更新 1/6 粒子 |
| 脉冲力场 | 仅波带 [radius±55] 内粒子计算 |
| 背景渐变 | 缓存，resize 时重建 |
| 沉浸按钮 | 模式切换时更新 DOM |
| 跳过未开放层 | targetLayer > maxActiveLayer 时 continue |
| 跳过极暗绘制 | currentAlpha < 8 不绘制 |
| 波纹上限 | pulseWaves 最多 4 个 |

---

## 六、样式规范

| 类型 | 字体 | 示例 |
|------|------|------|
| 中文 | Noto Sans SC | 开启曼陀罗、授权提示 |
| 英文 | Inter | Start Mandala、IMMERSIVE MODE |
| 玻璃拟态 | rgba 背景 + 描边 + backdrop-filter | 开场按钮、授权弹窗、沉浸按钮 |

---

## 七、运行方式

1. 使用本地服务器打开 `index.html`（或直接打开，部分功能可能受限于 CORS）
2. 推荐 Chrome / Edge 72+
3. 点击「开启曼陀罗音频沉浸空间」→ 授权屏幕共享 + 系统音频 → 自动全屏

---

## 八、相关文档

- **PRD.md**：产品需求、交互流程、迭代记录、困难与方向
- **README.md**：快速使用说明

---

*项目总结与 PRD 同步维护。*
