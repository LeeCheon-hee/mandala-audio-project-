# 曼陀罗分型原理与函数对应关系

> 面向讲解与二次开发的原理说明，将数学规律与代码函数一一对应。

---

## 一、核心数学原理：玫瑰线（Rose Curve）

### 1.1 极坐标公式

曼陀罗花瓣轮廓的数学基础是**玫瑰线**（Rose Curve / Rhodonea Curve）：

$$r(\theta) = R \cdot f\left(\frac{k}{2} \cdot \theta\right)$$

其中：
- \( r \)：极径（到中心的距离）
- \( \theta \)：极角（弧度）
- \( R \)：基准半径（每层固定）
- \( k \)：瓣数（petals）
- \( f \)：形状函数，决定瓣的胖瘦、尖圆

**规律**：\( \cos(k\theta/2) \) 在 \( 0 \sim 2\pi \) 内产生 \( k \) 个周期，对应 \( k \) 个花瓣（瓣尖在 \( \cos=1 \)，瓣缝在 \( \cos=0 \)）。

---

## 二、形状函数与 `getLayerShape`

### 2.1 通用骨架

```javascript
// sketch.js 行 536-537
const k = layerPetalCount / 2;           // 半瓣数，用于角度周期
const cosValue = Math.cos(k * angle);    // 核心：k*angle 决定瓣的周期性
const abscos = Math.abs(cosValue);       // 取绝对值，瓣尖/瓣缝对称
```

- **`cos(k * angle)`**：角度放大 \( k \) 倍后取余弦，形成 \( k \) 个波峰，对应 \( k \) 个瓣尖
- **`abscos`**：取绝对值，使瓣缝处不为负，便于做幂运算控制形状

### 2.2 四层形状函数对照

| 层 | 瓣数 | 形态描述 | 核心公式 | 代码位置 |
|----|------|----------|----------|----------|
| 0 | 6 | 细长梭形 | \( 0.3 + 0.7 \cdot \|c_1\|^{1.8} \cdot \|c_2\|^{2.5} \) | 行 541-545 |
| 1 | 12 | 荷花/莲瓣 | \( 0.4 + 0.6 \cdot (0.6 \cdot \|c\|^{0.5} + 0.4 \cdot \|c\|^{2.5}) \cdot \|c\|^{0.3} \) | 行 546-553 |
| 2 | 18 | 心形凹陷 | \( \|c\|^{0.7} \cdot (1 - 0.25\sin^4(2k\theta)) \cdot (0.85 + 0.15\|\cos 3\theta\|) \) | 行 554-558 |
| 3 | 24 | 圆润大瓣 | \( 0.6 + 0.4 \cdot \|c\|^{0.4} \) | 行 559-563 |

其中 \( c = \cos(k\theta) \)，\( c_1, c_2 \) 为不同相位版本。

### 2.3 形状控制规律

| 幂指数 | 效果 | 应用 |
|--------|------|------|
| \( \|c\|^{0.3\sim0.5} \) | 圆润、饱满 | 莲瓣底、圆润大瓣 |
| \( \|c\|^{0.7\sim1} \) | 中等尖锐 | 心形层、过渡 |
| \( \|c\|^{1.8\sim2.5} \) | 尖细、梭形 | 内层梭形、莲瓣尖 |

**规律**：幂越大，瓣越尖；幂越小，瓣越圆。

---

## 三、层级配置与粒子分布

### 3.1 层级定义

```javascript
// sketch.js 行 587-593
const layers = [
  { petals: 6,  radius: 120,  particleCount: 4500 },   // 内圈
  { petals: 12, radius: 240,  particleCount: 4500 },   // 中内
  { petals: 18, radius: 360,  particleCount: 4500 },   // 中外
  { petals: 24, radius: 480,  particleCount: 4500 }    // 外圈
];
```

| 层级 | 瓣数 | 半径 | 规律 |
|------|------|------|------|
| 0 | 6 | 120 | 瓣数最少、半径最小，形成内核 |
| 1 | 12 | 240 | 瓣数×2，半径×2 |
| 2 | 18 | 360 | 瓣数×3，半径×3 |
| 3 | 24 | 480 | 瓣数×4，半径×4 |

**规律**：瓣数按 6 的倍数递增，半径按 120 的倍数递增，形成同心扩展的曼陀罗结构。

### 3.2 粒子初始位置

```javascript
// sketch.js 行 604-610
const angle = t * TWO_PI;                    // 角度均匀分布 [0, 2π)
const petalShape = getLayerShape(...);       // 该角度的形状系数
const maxR = layer.radius * petalShape;      // 该方向的最大半径
const r = random(0, maxR);                   // 在 [0, maxR] 随机
const x = r * Math.cos(angle);               // 极坐标 → 直角坐标
const y = r * Math.sin(angle);
```

**规律**：粒子不是只分布在轮廓上，而是填充整个花瓣区域（\( r \in [0, R \cdot f(\theta)] \)），形成实心花瓣效果。

---

## 四、目标位置计算（力场约束）

### 4.1 基础玫瑰线目标

```javascript
// applyIdleFlowerForces / applyAudioReactiveForces
const angle = this.angleOnPetal + globalRotation * layerRotationMultiplier;
const petalShape = getLayerShape(this.targetLayer, angle, this.layerPetalCount);
const r = this.baseLayerRadius * breathe * petalShape * petalWidth;  // 音频模式下还有 breathScale、petalWidth
const targetX = cx + r * Math.cos(angle);
const targetY = cy + r * Math.sin(angle);
```

**公式**：\( (x, y) = \text{center} + r \cdot (\cos\theta, \sin\theta) \)，其中 \( r = R \cdot \text{breathe} \cdot \text{petalShape} \cdot \text{petalWidth} \)

### 4.2 谐波叠加（Harmonic）

```javascript
// 行 358-368（applyAudioReactiveForces）
const harmonicRadius = this.baseLayerRadius * 0.06 * bassEnergy;
const harmonicPetals = 2 + Math.floor(trebleEnergy * 2);    // 2~4 瓣
const harmonicAngle = angle * 3 + globalRotation * 2 + this.harmonicPhase + t * 0.001;
const harmonicShape = Math.pow(Math.abs(Math.cos(hk * harmonicAngle)), 0.5);
const hr = harmonicRadius * harmonicShape * (0.7 + this.harmonicSeed * 0.3);
const hOffsetX = hr * Math.cos(harmonicAngle);
const hOffsetY = hr * Math.sin(harmonicAngle);
finalTargetX = targetX + hOffsetX;
finalTargetY = targetY + hOffsetY;
```

**规律**：在基础玫瑰线上叠加一个小幅玫瑰线谐波，形成花瓣边缘的轻微波动。谐波瓣数由 treble 控制（2~4），幅度由 bass 控制。

### 4.3 呼吸与音频调制

| 参数 | 公式 | 作用 |
|------|------|------|
| breathe | \( 1 + 0.15\sin(t) \) | 静止模式下 ±15% 半径呼吸 |
| breathScale | \( 1 + 0.18 \cdot \text{bassEnergy} \) | 音频模式下低频驱动缩放 |
| petalWidth | \( 0.95 + 0.06 \cdot \text{midEnergy} \) | 中频驱动瓣的胖瘦 |

---

## 五、规律与函数对应总览

| 数学/设计规律 | 实现函数/变量 | 位置 |
|---------------|---------------|------|
| 玫瑰线 \( r = R \cdot f(k\theta/2) \) | `getLayerShape` 返回值 × `baseLayerRadius` | 536-567, 269, 351 |
| 瓣数决定角度周期 | `k = layerPetalCount / 2`，`cos(k * angle)` | 537, 604 |
| 幂指数控制瓣形 | `Math.pow(abscos, exp)` | 542-563 |
| 粒子填充花瓣区域 | `r = random(0, maxR)`，`maxR = radius * petalShape` | 607-610 |
| 同心层扩展 | `layers` 数组，`radius` 递增加倍 | 587-593 |
| 谐波叠加 | `harmonicRadius`、`harmonicShape`、`hOffsetX/Y` | 358-368 |
| 约束力拉回目标 | `applyIdleFlowerForces`、`applyAudioReactiveForces` | 264-286, 367-382 |
| 蓬松/飘散 | `noise()` 驱动 acc 偏移 | 296-306, 396-403 |

---

## 六、可扩展方向

1. **新增层**：在 `layers` 中增加 `{ petals, radius, particleCount }`，并在 `getLayerShape` 的 switch 中增加对应 case。
2. **新瓣形**：在 `getLayerShape` 中用新的 \( \|c\|^n \) 组合定义形状。
3. **动态瓣数**：`globalPetalCount` 已由频谱影响，可进一步让各层瓣数随音乐变化。
4. **分形递归**：在单瓣内再嵌套小玫瑰线，实现更复杂的曼陀罗分形。

---

*文档与 sketch.js 同步，行号以当前版本为准。*
