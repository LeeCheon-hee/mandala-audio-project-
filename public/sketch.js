// ==========================================
// 丝滑灵动优化版 (High Performance & Agile)
// ==========================================

// ====== 错误提示配置（中英双语） ======
const ERROR_MESSAGES = {
  'NotAllowedError': {
    title: '授权提示',
    titleEn: 'Authorization Prompt',
    desc: '授权后即可体验',
    descEn: 'Experience available after authorization.',
    hasSteps: true
  },
  'NotFoundError': {
    title: '未勾选共享音频',
    titleEn: 'System Audio Not Selected',
    desc: '请在屏幕共享窗口中勾选同时共享系统音频',
    descEn: 'Please check "Share system audio" in the screen sharing window',
    hasSteps: true
  },
  'NotSupportedError': {
    title: '浏览器不支持',
    titleEn: 'Browser Not Supported',
    desc: '请使用 Chrome 或 Edge 浏览器（版本 72+）',
    descEn: 'Please use Chrome or Edge (v72+)',
    hasSteps: false
  },
  'default': {
    title: '音频捕获失败',
    titleEn: 'Audio Capture Failed',
    desc: '请刷新页面后重试',
    descEn: 'Please refresh the page and try again',
    hasSteps: false
  }
};

// ====== 全局状态 ======
let particles = [];
let audioContext = null;         // Web Audio API
let analyser = null;
let sourceNode = null;           // MediaStreamAudioSourceNode
let dataArray = null;            // Uint8Array 频率数据
let isAudioStarted = false;
let hasAudioTrack = false;       // 是否成功获取到系统音频
let currentMode = 'intro';
let particleMode = 'idle-flower'; // 粒子模式：'idle-flower' 静止六瓣花 | 'audio-reactive' 音频驱动
let lastFrameTime = 0;           // 用于 deltaTime，消除帧率波动导致的卡顿
let audioReactiveBlend = 0;      // 0=idle花型, 1=音乐反应，平滑过渡不突变
window.audioSpectrum = { bass: 0, mid: 0, treble: 0, volume: 0, kick: false, warmth: 0.5 };
let _spectrumSmooth = { bass: 0, mid: 0, treble: 0, volume: 0, warmth: 0.5 };  // EMA 平滑用

// ====== 曼陀罗全局配置 ======
let globalPetalCount = 6;
let globalRotation = 0;
let globalScale = 1;
let targetScale = 1;
let colorWarmth = 0.5;
let edgeSparkle = 0;
const SPIRAL_TIGHTNESS = 0.1;
const BASE_MIN_RADIUS = 300;
const BASE_MAX_RADIUS = 400;
let pulseWaves = [];
let lastPulseTime = 0;

// 【性能】中心核 noise 缓存（交错更新，Float32Array 初始为 0）
let corePetalJitterX, corePetalJitterY, corePetalHuePhase;
let coreCenterJitter, coreCenterHuePhase;
let toDrawHighlights = [];  // 【性能】复用，避免每帧 new Array
let _pulseZoneMin = 0;
let _pulseZoneMax = 600;
let _pulseZoneMinSq = 0;
let _pulseZoneMaxSq = 360000;
let _lastImmerseBtnState = false;
let _bgGradient = null;
let _bgGradientW = 0, _bgGradientH = 0;

// ====== 生长控制 ======
let maxActiveLayer = 0;
let lastLayerGrowTime = 0;
const LAYER_GROW_INTERVAL = 10000;

// ====== 汇聚→曼陀罗 平滑过渡 ======
let convergeStartTime = 0;
let convergeToMandalaBlend = 0;
const CONVERGE_DURATION = 1500;   // 1.5 秒汇聚到中心
const BLOOM_DURATION = 1000;      // 1 秒向外绽放

// ====== ⚡️ 性能与手感核心配置 ======
const CONFIG = {
  PARTICLE_COUNT: 18000,  // 【性能】鼓点+四层时减轻卡顿
  BASE_RADIUS: 140,
  NOISE_SCALE: 0.0035,
  TIME_SCALE: 0.0005,
  VORTEX_STRENGTH: 0.5,
  NOMINAL_FPS: 60,               // 基准帧率，dt 按此归一化
};

class Particle {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = createVector(0, 0);
    this.acc = createVector(0, 0);
    this.flowerPhase = random(TWO_PI);  // 六瓣花分布相位，避免从中心汇聚时重叠
    
    // ====== 颜色配置 ======
    const variant = random(1);
    if (variant > 0.997) {
       // 高光粒子（intro 阶段用，曼陀罗阶段由 setup 中 isHighlight 覆盖）
       this.hue = 0; this.sat = 0; this.brightness = 100; 
       this.baseAlpha = 255;
       this.size = random(1.5, 2.5);  // 【曼陀罗粒子尺寸·高光】↑2.5 更大 ↓1.0 更小（曼陀罗时用 strokeWeight 1）
       this.maxSpeed = random(2.0, 4.0); // ⚡️ 速度提升
    } else {
       // 普通粒子
       if (random(1) < 0.4) {
          this.hue = random(160, 190); this.sat = random(50, 80);
       } else {
          this.hue = random(240, 280); this.sat = random(40, 70);
       }
       this.baseAlpha = random(140, 200); 
       this.brightness = random(85, 95); 
       this.size = random(1.2, 2.0);  // 【性能优化】略增大弥补粒子数减少，保持视觉密度
       
       // ⚡️ 关键修改：最大速度翻倍，告别蠕动
       this.maxSpeed = random(1.5, 3.5); 
    }
    
    this.currentAlpha = this.baseAlpha;
    this.respawnInBand(CONFIG.BASE_RADIUS);

    // 层级属性（用于多层曼陀罗波纹扩散）
    this.targetLayer = 0;
    this.baseLayerRadius = 0;
    this.expansionAmount = 0;
    this.petalCount = 6;
    this.rotationOffset = 0;
    this.isEdgeParticle = true;
    this.angleOnPetal = 0;
    this.layerPetalCount = 6;
    this.isActivated = false;
    this.activationProgress = 0;
    this.birthTime = 0;
    this.baseHue = 240;
    this.hueOffsetInPetal = 0;
    this.isHighlight = false;
    this._nc = { n: 0, hRaw: 0 };  // 【性能】noise 缓存，交错更新
    this.harmonicPhase = random(TWO_PI);   // 谐波个体相位差
    this.harmonicSeed = random(1);         // 谐波大小的个体差异
  }

  respawnInBand(radius) {
    const angle = random(TWO_PI);
    // 保持蓬松感
    const distOffset = randomGaussian(0, 45); 
    const r = radius + distOffset;
    
    this.pos.x = width / 2 + r * Math.cos(angle);
    this.pos.y = height / 2 + r * Math.sin(angle);
    this.vel.set(0, 0);
    this.currentAlpha = 0;
  }

  applyIntroForces(noiseTime, cx, cy) {
    let dx = this.pos.x - cx;
    let dy = this.pos.y - cy;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.001) dist = 0.001;

    const tx = -dy / dist;
    const ty = dx / dist;
    this.acc.x += tx * CONFIG.VORTEX_STRENGTH;
    this.acc.y += ty * CONFIG.VORTEX_STRENGTH;

    const n = noise(this.pos.x * CONFIG.NOISE_SCALE, this.pos.y * CONFIG.NOISE_SCALE, noiseTime);
    const noiseAngle = n * TWO_PI * 4; 
    
    // ⚡️ 增加噪点扰动力度，让流动更明显
    this.acc.x += cos(noiseAngle) * 0.3; 
    this.acc.y += sin(noiseAngle) * 0.3;
  }

  applyConvergingForces(cx, cy) {
    const dx = cx - this.pos.x;
    const dy = cy - this.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const TARGET_RADIUS = 15;
    
    if (dist > TARGET_RADIUS) {
      // ⚡️ 汇聚吸力增强
      const forceMagnitude = 0.15 * Math.sqrt(dist / 100);
      this.acc.x += (dx / dist) * forceMagnitude;
      this.acc.y += (dy / dist) * forceMagnitude;
    } else {
      const angle = atan2(dy, dx);
      this.acc.x += -Math.sin(angle) * 0.1;
      this.acc.y += Math.cos(angle) * 0.1;
      this.vel.mult(0.8); // 阻尼减小，让中心转得更快
    }
    
    if (dist < TARGET_RADIUS * 3) {
      const fadeRatio = dist / (TARGET_RADIUS * 3);
      this.currentAlpha = this.baseAlpha * (0.3 + fadeRatio * 0.7);
    }
  }

  applyConvergingToMandalaForces(cx, cy, t, blend) {
    // 目标 = lerp(中心, 曼陀罗位置, blend)，绽放期间平滑过渡
    const layerRotationMultiplier = 1 + this.targetLayer * 0.1;
    const angle = this.angleOnPetal + globalRotation * layerRotationMultiplier;
    const k = this.layerPetalCount / 2;
    const cosValue = Math.cos(k * angle);
    const petalShape = getLayerShape(this.targetLayer, angle, this.layerPetalCount);
    const breathe = Math.sin(t * 0.001) * 0.1 + 1;  // 【花瓣呼吸】±10% 半径
    const r = this.baseLayerRadius * breathe * petalShape;
    const mandalaX = cx + r * Math.cos(angle);
    const mandalaY = cy + r * Math.sin(angle);
    const targetX = cx * (1 - blend) + mandalaX * blend;
    const targetY = cy * (1 - blend) + mandalaY * blend;

    const dx = targetX - this.pos.x;
    const dy = targetY - this.pos.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > 1) {
      const invDist = 1 / Math.sqrt(distSq);
      // 【微调·绽放过渡约束】0.18+blend*0.04 → 强约束; 0.08~0.12 → 弱约束
      const force = 0.18 + blend * 0.04;
      this.acc.x += dx * invDist * force;
      this.acc.y += dy * invDist * force;
    }
    if (this.isHighlight) {
      this.hue = 52;
      this.sat = 18;
      this.brightness = 90 + blend * 12;
    } else {
      const hueNoise = (noise(this.pos.x * 0.002, this.pos.y * 0.002, t * 0.0003) - 0.5) * 18 * blend;
      const satBase = (this.satOffsetInLayer ?? 55) * (0.7 + 0.3 * blend);
      const brightBase = (this.brightnessOffsetInLayer ?? 85) * (0.85 + 0.15 * blend);
      this.hue = ((this.baseHue || 240) + (this.hueOffsetInPetal || 0) * blend + hueNoise + t * 0.005) % 360;
      this.sat = satBase + (1 - Math.abs(cosValue)) * 10 * blend;
      this.brightness = brightBase + Math.sin(angle * 2) * 4 * blend;
    }
    if (this.targetLayer === 0) {
      this.isActivated = true;
      this.activationProgress = 1;
      this.currentAlpha = this.baseAlpha * (0.4 + 0.6 * blend);
    }
  }

  applyIdleFlowerForces(cx, cy, t, pIdx = 0) {
    if (this.targetLayer > 0) {
      if (this.activationProgress > 0) {
        this.activationProgress -= 0.02;
        this.currentAlpha = this.baseAlpha * this.activationProgress;
      }
      if (this.activationProgress <= 0) {
        this.isActivated = false;
        this.currentAlpha = 0;
        return;
      }
    } else {
      this.isActivated = true;
      this.activationProgress = 1;
    }

    const layerRotationMultiplier = 1 + this.targetLayer * 0.1;
    const angle = this.angleOnPetal + globalRotation * layerRotationMultiplier;
    const k = this.layerPetalCount / 2;
    const cosValue = Math.cos(k * angle);
    const petalShape = getLayerShape(this.targetLayer, angle, this.layerPetalCount);
    const breathe = sin(t * 0.001) * 0.15 + 1;  // 【花瓣呼吸·静止】±15% 半径 (0.85~1.15)
    const r = this.baseLayerRadius * breathe * petalShape;
    const targetX = cx + r * Math.cos(angle);
    const targetY = cy + r * Math.sin(angle);

    // 静止谐波（微弱，呼吸驱动）
    const idleHarmonicRadius = this.baseLayerRadius * 0.08 * (Math.sin(t * 0.001) * 0.5 + 0.5);
    const harmonicAngle = angle * 3 + globalRotation * 1.5 + this.harmonicPhase;
    const harmonicShape = Math.pow(Math.abs(Math.cos(3 * harmonicAngle)), 0.5);
    const hr = idleHarmonicRadius * harmonicShape;
    const finalTargetX = targetX + hr * Math.cos(harmonicAngle);
    const finalTargetY = targetY + hr * Math.sin(harmonicAngle);

    const dx = finalTargetX - this.pos.x;
    const dy = finalTargetY - this.pos.y;
    const distSq = dx * dx + dy * dy;

    if (distSq > 1) {
      const dist = Math.sqrt(distSq);
      const invDist = 1 / dist;
      // 【微调·静止模式约束】↑数值=约束更强(贴紧花瓣) ↓数值=约束更弱(更飘散)
      const baseForce = 0.15;  // 建议范围 0.05~0.25
      const distFactor = Math.min(dist / 100, 2.5);
      const force = baseForce * (1 + distFactor * 0.10);  // 0.15→0.3 约束更强, 0.05 更弱
      this.acc.x += dx * invDist * force;
      this.acc.y += dy * invDist * force;
    }
    // 【性能】8 帧交错：每帧更新 1/8 粒子，降低 noise 调用
    if ((pIdx + frameCount) % 8 === 0) {
      this._nc.n = noise(this.pos.x * 0.003, this.pos.y * 0.003, t * 0.0003);
      this._nc.hRaw = noise(this.pos.x * 0.002, this.pos.y * 0.002, t * 0.0003);
    }
    const n = this._nc.n;
    this.acc.x += Math.cos(n * TWO_PI * 3) * 0.05;  // 【蓬松度】噪点强度，↑更飘逸 ↓更贴紧
    this.acc.y += Math.sin(n * TWO_PI * 3) * 0.05;
    if (this.isHighlight) {
      this.hue = 52;
      this.sat = 18;
      this.brightness = 98;
    } else {
      const hueNoise = (this._nc.hRaw - 0.5) * 20;
      const satBase = this.satOffsetInLayer ?? 55;
      const brightBase = this.brightnessOffsetInLayer ?? 85;
      const hueGrad = (this.hueRadiusGradient ?? 0) + (this.hueOffsetInPetal || 0);
      this.hue = ((this.baseHue || 240) + hueGrad + hueNoise + t * 0.005) % 360;
      this.sat = satBase + (1 - Math.abs(cosValue)) * 12 + (this.radiusRatioInPetal ?? 0.5) * 8;  // 瓣尖略饱和
      // 花瓣外缘更亮（像图2丝带的高光边缘）
      this.brightness = brightBase + Math.sin(angle * 2) * 5 + (this.radiusRatioInPetal ?? 0.5) * 12;
    }
  }

  applyAudioReactiveForces(cx, cy, t, spectrum, pIdx = 0) {
    const bassEnergy = (spectrum.bass || 0) / 255;
    const midEnergy = (spectrum.mid || 0) / 255;
    const trebleEnergy = (spectrum.treble || 0) / 255;
    const targetActiveLayer = maxActiveLayer;

    if (this.targetLayer <= targetActiveLayer && !this.isActivated) {
      this.isActivated = true;
      this.birthTime = t;
      // 从屏幕外的圈层被拉回各自目标层（半径必须超出画布对角线，确保在可见区域之外）
      const layerRotationMultiplier = 1 + this.targetLayer * 0.1;
      const spawnAngle = this.angleOnPetal + globalRotation * layerRotationMultiplier;
      const diag = Math.sqrt((width / 2) ** 2 + (height / 2) ** 2);
      const outerSpawnRadius = diag * 1.15;  // 超出画布对角线 15%，保证在屏幕外
      this.pos.x = cx + outerSpawnRadius * Math.cos(spawnAngle);
      this.pos.y = cy + outerSpawnRadius * Math.sin(spawnAngle);
      this.vel.set(0, 0);
    }
    if (this.isActivated && this.activationProgress < 1) {
      this.activationProgress += 0.03;
    }
    if (!this.isActivated || this.activationProgress < 0.01) {
      this.currentAlpha = 0;
      return;
    }

    const layerRotationMultiplier = 1 + this.targetLayer * 0.1;
    const angle = this.angleOnPetal + globalRotation * layerRotationMultiplier;
    const k = this.layerPetalCount / 2;
    const cosValue = Math.cos(k * angle);
    const petalShape = getLayerShape(this.targetLayer, angle, this.layerPetalCount);
    const petalWidth = 0.95 + midEnergy * 0.06;
    const breathScale = 1 + bassEnergy * 0.18;  // 0.5→0.18，减少膨胀幅度
    const r = this.baseLayerRadius * breathScale * petalShape * petalWidth;
    const targetX = cx + r * Math.cos(angle);
    const targetY = cy + r * Math.sin(angle);

    // 音频驱动谐波：低频控制大小，高频控制瓣数
    const harmonicRadius = this.baseLayerRadius * 0.06 * bassEnergy;
    const harmonicPetals = 2 + Math.floor(trebleEnergy * 2);
    const hk = harmonicPetals;
    const harmonicAngle = angle * 3 + globalRotation * 2 + this.harmonicPhase + t * 0.001;
    const harmonicShape = Math.pow(Math.abs(Math.cos(hk * harmonicAngle)), 0.5);
    const hr = harmonicRadius * harmonicShape * (0.7 + this.harmonicSeed * 0.3);
    const hOffsetX = hr * Math.cos(harmonicAngle);
    const hOffsetY = hr * Math.sin(harmonicAngle);
    const finalTargetX = targetX + hOffsetX;
    const finalTargetY = targetY + hOffsetY;

    const dx = finalTargetX - this.pos.x;
    const dy = finalTargetY - this.pos.y;
    const distSq = dx * dx + dy * dy;

    if (distSq > 1) {
      const dist = Math.sqrt(distSq);
      const invDist = 1 / dist;
      // 【微调·音频模式约束】↑数值=约束更强(贴紧花瓣) ↓数值=约束更弱(更飘散)
      const baseForce = 0.10;  // 建议范围 0.06~0.3
      const distFactor = Math.min(dist / 100, 3);
      const force = baseForce * (1 + distFactor * 0.25);  // 0.2→0.4 约束更强, 0.1 更弱
      this.acc.x += dx * invDist * force;
      this.acc.y += dy * invDist * force;
    }
    // 外层粒子额外约束：防止飞出边界
    if (this.targetLayer >= 2) {
      const dxFromCenter = this.pos.x - cx;
      const dyFromCenter = this.pos.y - cy;
      const distFromCenter = Math.sqrt(dxFromCenter * dxFromCenter + dyFromCenter * dyFromCenter);
      const maxAllowedDist = this.baseLayerRadius * 2.0;
      if (distFromCenter > maxAllowedDist) {
        const pullBack = (distFromCenter - maxAllowedDist) * 0.05;
        this.acc.x -= (dxFromCenter / distFromCenter) * pullBack;
        this.acc.y -= (dyFromCenter / distFromCenter) * pullBack;
      }
    }
    if ((pIdx + frameCount) % 8 === 0) {
      this._nc.n = noise(this.pos.x * 0.003, this.pos.y * 0.003, t * 0.0003);
      this._nc.hRaw = noise(this.pos.x * 0.002, this.pos.y * 0.002, t * 0.0003);
    }
    const n = this._nc.n;
    const noiseStrength = 0.08;
    this.acc.x += Math.cos(n * TWO_PI * 3) * noiseStrength;
    this.acc.y += Math.sin(n * TWO_PI * 3) * noiseStrength;

    if (this.isHighlight) {
      this.hue = 50 + midEnergy * 12;
      this.sat = 15;
      this.brightness = 95 + bassEnergy * 12 + Math.sin(t * 0.004) * 5;
    } else {
      const hueNoise = (this._nc.hRaw - 0.5) * 22;
      const hueGrad = (this.hueRadiusGradient ?? 0) + (this.hueOffsetInPetal || 0);
      const hueOffset = midEnergy * 30 + hueGrad + hueNoise;
      const satBase = (this.satOffsetInLayer ?? 55) + 15;
      const brightBase = (this.brightnessOffsetInLayer ?? 85) - 5;
      this.hue = ((this.baseHue || 240) + hueOffset + t * 0.01) % 360;
      this.sat = satBase + midEnergy * 20 + (1 - Math.abs(cosValue)) * 8 + (this.radiusRatioInPetal ?? 0.5) * 10;
      // 亮度按层随 bass/mid/treble 变化：内层偏低频、外层偏高频
      const layerIdx = this.targetLayer;
      const bassW = 1 - layerIdx / 3.5;      // 内层强
      const midW = 0.6 + 0.4 * (1 - Math.abs(layerIdx - 1.5) / 1.5);  // 中层强
      const trebleW = layerIdx / 3.5;        // 外层强
      const freqBright = bassEnergy * bassW * 18 + midEnergy * midW * 14 + trebleEnergy * trebleW * 16;
      this.brightness = brightBase + freqBright + Math.sin(angle * 2) * 4 + (this.radiusRatioInPetal ?? 0.5) * 15;
    }

    if (this.targetLayer >= 3 && trebleEnergy > 0.5) {
      this.acc.x += (random() - 0.5) * trebleEnergy * 0.2;
      this.acc.y += (random() - 0.5) * trebleEnergy * 0.2;
    }
    // 由暗到亮：离目标越近越亮，飞入过程中平滑过渡
    const dist = Math.sqrt(distSq);
    const approachFactor = Math.max(0, 1 - dist / 380);  // 距目标 <380px 时逐渐变亮
    this.currentAlpha = this.baseAlpha * this.activationProgress * (0.06 + 0.94 * approachFactor);
  }

  updateNormal(dt = 1) {
    this.vel.x += this.acc.x * dt;
    this.vel.y += this.acc.y * dt;
    this.vel.limit(this.maxSpeed);
    // 【微调·阻尼】↑接近1(如0.96)=约束更弱/更飘逸 ↓接近0(如0.88)=约束更强/更稳定
    this.vel.x *= 0.96;  // 建议范围 0.88~0.98
    this.vel.y *= 0.96;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.acc.x = 0;
    this.acc.y = 0;

    if (this.isActivated && this.activationProgress >= 1 && this.currentAlpha < this.baseAlpha) {
      this.currentAlpha += 3 * dt;
    }
  }

  updateIntro(currentRadius, cx, cy, dt = 1) {
     this.vel.x += this.acc.x * dt;
     this.vel.y += this.acc.y * dt;
     this.vel.limit(this.maxSpeed);
     this.pos.x += this.vel.x * dt;
     this.pos.y += this.vel.y * dt;
     this.acc.x = 0;
     this.acc.y = 0;

     const dx = this.pos.x - cx;
     const dy = this.pos.y - cy;
     const d = Math.sqrt(dx*dx + dy*dy);
     const coreLimit = currentRadius + 30;
     const fadeLimit = currentRadius + 220; // 保持大范围蓬松

     if (d < currentRadius - 70) {
        if (random(1) < 0.1) this.respawnInBand(currentRadius);
        else {
            const steerX = -dx / d;
            const steerY = -dy / d;
            this.vel.x -= steerX * 0.2;
            this.vel.y -= steerY * 0.2;
        }
     } else if (d > coreLimit) {
        if (d > fadeLimit) {
            this.respawnInBand(currentRadius);
        } else {
            const fade = map(d, coreLimit, fadeLimit, 1, 0);
            this.currentAlpha = this.baseAlpha * fade;
        }
     } else {
        if (this.currentAlpha < this.baseAlpha) this.currentAlpha += 5 * dt;
     }
  }

  updateConverging(dt = 1) {
     this.vel.x += this.acc.x * dt;
     this.vel.y += this.acc.y * dt;
     this.vel.limit(this.maxSpeed * 2.5);
     this.pos.x += this.vel.x * dt;
     this.pos.y += this.vel.y * dt;
     this.acc.x = 0;
     this.acc.y = 0;
  }

  applyPulseWaveForces(cx, cy, pIdx = 0) {
    if (pulseWaves.length === 0) return;
    const dx = this.pos.x - cx;
    const dy = this.pos.y - cy;
    const dSq = dx * dx + dy * dy;
    if (dSq < 1) return;
    // 【性能】用 dSq 做波带剔除，避免 sqrt；鼓点+四层时减负
    if (dSq < _pulseZoneMinSq || dSq > _pulseZoneMaxSq) return;
    // 【性能】交错施加脉冲力，减半计算量，观感几乎无差
    if ((pIdx + frameCount) % 2 !== 0) return;
    const d = Math.sqrt(dSq);
    const nx = dx / d;
    const ny = dy / d;
    const maxWaves = Math.min(pulseWaves.length, 2);
    for (let w = 0; w < maxWaves; w++) {
      const wave = pulseWaves[w];
      const gap = Math.abs(d - wave.radius);
      if (gap < 50 && wave.alpha > 20) {
        const strength = 0.015 * (1 - gap / 50) * (wave.alpha / 150);
        this.acc.x += nx * strength;
        this.acc.y += ny * strength;
      }
    }
  }

  draw(cx, cy) {
    // 按层次给透明度加权：内层半透明、外层更实（纵深感）
    const layerAlphaMult = 0.65 + this.targetLayer * 0.12;
    stroke(this.hue, this.sat, this.brightness, this.currentAlpha * layerAlphaMult);
    strokeWeight(
      (currentMode === 'idle-flower' || currentMode === 'audio-reactive') && this.isHighlight
        ? 1 : this.size
    );
    point(this.pos.x, this.pos.y);
  }
}

function getLayerShape(layerIdx, angle, layerPetalCount) {
  const k = layerPetalCount / 2;
  const cosValue = Math.cos(k * angle);
  const abscos = Math.abs(cosValue);

  switch(layerIdx) {
    case 0: {
      const slim = Math.pow(abscos, 1.8);
      const slim2 = Math.pow(Math.abs(Math.cos(k * angle + 0.3)), 2.5);
      return 0.3 + 0.7 * slim * slim2;
    }
    case 1: {
      // 第2层：圆弧尖角瓣（荷花/莲瓣感，圆润底部+尖顶）
      const base = Math.pow(abscos, 0.5); // 圆润底
      const tipSharp = Math.pow(abscos, 2.5); // 尖顶
      const lotus = 0.4 + 0.6 * (0.6 * base + 0.4 * tipSharp);
      const gap = Math.pow(abscos, 0.3);
      return lotus * gap;
    }
    case 2: {
      const spike = Math.pow(abscos, 0.7);
      const heartDip = 1 - 0.25 * Math.pow(Math.sin(k * angle * 2), 4);
      return spike * heartDip * (0.85 + 0.15 * Math.abs(Math.cos(k * 3 * angle)));
    }
    case 3: {
      const round = Math.pow(abscos, 0.4);
      const full = 0.6 + 0.4 * round;
      return full;
    }
    default:
      return 0.5 + 0.5 * Math.pow(abscos, 0.6);
  }
}

function setup() {
  lastFrameTime = millis();
  let cnv = createCanvas(windowWidth, windowHeight);
  cnv.parent('canvas-container');

  // 【性能】中心核降采样，鼓点+四层时减负
  corePetalJitterX = new Float32Array(1200);
  corePetalJitterY = new Float32Array(1200);
  corePetalHuePhase = new Float32Array(1200);
  coreCenterJitter = new Float32Array(350);
  coreCenterHuePhase = new Float32Array(350);

  colorMode(HSB, 360, 100, 100, 255);
  background(0);

  const cx = width / 2;
  const cy = height / 2;

  // 【花瓣尺寸·层级半径】【性能】粒子数按比例减少，略增大 size 弥补密度
  const layers = [
    { petals: 6,  radius: 120,  particleCount: 4500 },   // 内圈
    { petals: 12, radius: 240,  particleCount: 4500 },   // 中内
    { petals: 18, radius: 360,  particleCount: 4500 },   // 中外
    { petals: 24, radius: 480,  particleCount: 4500 }    // 外圈
  ];

  let particleIndex = 0;
  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layer = layers[layerIdx];
    const k = layer.petals / 2;
    for (let i = 0; i < layer.particleCount; i++) {
      if (particleIndex >= CONFIG.PARTICLE_COUNT) break;
      const p = new Particle();
      const t = i / layer.particleCount;
      const angle = t * TWO_PI;
      const cosValue = Math.cos(k * angle);
      const petalShape = getLayerShape(layerIdx, angle, layer.petals);
      // 不只放在轮廓，而是填充整个花瓣区域
      const maxR = layer.radius * petalShape;
      const r = random(0, maxR);  // 从圆心到花瓣边缘随机分布
      const x = r * Math.cos(angle);
      const y = r * Math.sin(angle);

      p.targetLayer = layerIdx;
      p.baseLayerRadius = layer.radius;
      p.petalCount = layer.petals;
      p.layerPetalCount = layer.petals;
      p.angleOnPetal = angle;
      const layerHue = map(layerIdx, 0, layers.length - 1, 240, 0);
      p.baseHue = layerHue + random(-15, 15);  // 层内色相微差，减少单一感
      p.hueOffsetInPetal = Math.sin(angle) * 18 + (1 - Math.abs(cosValue)) * 22;
      p.radiusRatioInPetal = r / maxR;  // 0=瓣心 1=瓣尖
      p.hueRadiusGradient = (1 - p.radiusRatioInPetal) * 28;  // 瓣心偏暖，瓣尖偏冷
      p.satOffsetInLayer = map(layerIdx, 0, layers.length - 1, 55, 40);
      // 内层暗、外层亮，产生纵深层次感（像光从外部照进来）
      p.brightnessOffsetInLayer = map(layerIdx, 0, layers.length - 1, 65, 95);
      p.isHighlight = random(1) < 0.03;
      p.pos.x = cx + x;
      p.pos.y = cy + y;
      p.vel.set(0, 0);

      if (layerIdx === 0) {
        p.isActivated = true;
        p.activationProgress = 1;
      } else {
        p.isActivated = false;
        p.activationProgress = 0;
        p.currentAlpha = 0;
      }

      particles.push(p);
      particleIndex++;
    }
  }
  console.log("曼陀罗创建完成：4层，共", particleIndex, "个粒子（性能优化版）");

  setTimeout(() => {
    let btn = document.getElementById('start-btn');
    if(btn) btn.classList.add('visible');
  }, 3000);

  const immerseBtn = document.getElementById('immerse-btn');
  if (immerseBtn) immerseBtn.onclick = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  };
}

function draw() {
  background(0);
  // 【纵深感】径向渐变背景（缓存，resize 时重建）
  if (!_bgGradient || width !== _bgGradientW || height !== _bgGradientH) {
    const cx0 = width / 2, cy0 = height / 2, maxR = Math.max(width, height) * 0.8;
    _bgGradient = drawingContext.createRadialGradient(cx0, cy0, 0, cx0, cy0, maxR);
    _bgGradient.addColorStop(0, 'rgb(18,15,35)');
    _bgGradient.addColorStop(0.3, 'rgb(8,6,18)');
    _bgGradient.addColorStop(1, 'rgb(0,0,0)');
    _bgGradientW = width;
    _bgGradientH = height;
  }
  drawingContext.fillStyle = _bgGradient;
  drawingContext.fillRect(0, 0, width, height);

  blendMode(ADD);

  const t = millis();
  // 与帧率无关的 dt（60fps 为 1），避免掉帧时“一卡一卡”
  let dt = (t - lastFrameTime) / (1000 / CONFIG.NOMINAL_FPS);
  lastFrameTime = t;
  if (dt <= 0 || dt > 4) dt = 1;
  dt = Math.min(dt, 1.2);

  const noiseT = t * CONFIG.TIME_SCALE;
  const breathCycle = sin(t * 0.003);
  const currentRadius = CONFIG.BASE_RADIUS + (breathCycle * 25);
  const cx = width / 2;
  const cy = height / 2;

  let convergePhase = null;
  if (currentMode === 'converging') {
    const elapsed = t - convergeStartTime;
    if (elapsed < CONVERGE_DURATION) {
      convergePhase = 'converge';
    } else {
      convergePhase = 'bloom';
      convergeToMandalaBlend = Math.min(1, (elapsed - CONVERGE_DURATION) / BLOOM_DURATION);
    }
  }

  // 根据音量控制「请播放音乐」提示与状态栏：歌开始播放后不再提示
  if (isAudioStarted && window.audioSpectrum) {
    const vol = window.audioSpectrum.volume;
    const statusBar = document.getElementById('status-bar');
    if (vol > 0) {
      hasAudioTrack = true;
      hidePlayMusicPrompt();
      if (statusBar) statusBar.style.opacity = 1;
    } else if (!hasAudioTrack && (currentMode === 'idle-flower' || currentMode === 'audio-reactive')) {
      showPlayMusicPrompt();
    }
  }

  // 花型 ⇄ 音乐反应：根据 particleMode 平滑过渡（切到 idle 时快速归零）
  if (currentMode === 'idle-flower' || currentMode === 'audio-reactive') {
    const targetBlend = particleMode === 'audio-reactive' ? 1 : 0;
    const lerpRate = targetBlend === 0 ? 0.2 : 0.1;  // 音乐模式下响应更快
    audioReactiveBlend += (targetBlend - audioReactiveBlend) * lerpRate;

    if (particleMode === 'audio-reactive' && window.audioSpectrum && window.audioSpectrum.volume > 10) {
      updateMandalaGlobals(window.audioSpectrum);
    } else {
      updateIdleGlobals();
    }
  }

  // 【性能优化】单次遍历 + 复用数组避免每帧分配
  toDrawHighlights.length = 0;
  for (let i = 0; i < particles.length; i++) {
    const pt = particles[i];
    // 【性能】仅跳过「不可能被激活」的粒子（更高层尚未开放），避免挡住激活逻辑
    if ((currentMode === 'idle-flower' || currentMode === 'audio-reactive') && !pt.isActivated && pt.targetLayer > maxActiveLayer) continue;

    switch (currentMode) {
      case 'intro':
        pt.applyIntroForces(noiseT, cx, cy);
        pt.updateIntro(currentRadius, cx, cy, dt);
        break;

      case 'converging':
        if (convergePhase === 'converge') {
          pt.applyConvergingForces(cx, cy);
          pt.updateConverging(dt);
        } else {
          pt.applyConvergingToMandalaForces(cx, cy, t, convergeToMandalaBlend);
          pt.updateNormal(dt);
        }
        break;

      case 'idle-flower':
      case 'audio-reactive':
        pt.applyIdleFlowerForces(cx, cy, t, i);
        const idleAx = pt.acc.x, idleAy = pt.acc.y;
        if (particleMode === 'audio-reactive' && window.audioSpectrum && window.audioSpectrum.volume > 10) {
          pt.applyAudioReactiveForces(cx, cy, t, window.audioSpectrum, i);
        }
        pt.acc.x = idleAx + (pt.acc.x - idleAx) * audioReactiveBlend;
        pt.acc.y = idleAy + (pt.acc.y - idleAy) * audioReactiveBlend;
        if (pt.isActivated && pulseWaves.length > 0) {
          pt.applyPulseWaveForces(cx, cy, i);
        }
        pt.updateNormal(dt);
        break;
    }

    if (pt.currentAlpha >= 8) {  // 【性能】跳过极暗粒子绘制，减轻卡顿
      if (pt.isHighlight) toDrawHighlights.push(pt);
      else pt.draw(cx, cy);
    }
  }
  for (let k = 0; k < toDrawHighlights.length; k++) toDrawHighlights[k].draw(cx, cy);

  if (currentMode === 'converging' && convergePhase === 'bloom' && convergeToMandalaBlend >= 1) {
    currentMode = 'idle-flower';
    showPlayMusicPrompt();
    console.log("✨ 模式切换: Idle Flower（绽放完成）");
  }

  // 【性能】沉浸式按钮：仅状态变化时更新 DOM
  const inMandala = currentMode === 'idle-flower' || currentMode === 'audio-reactive';
  if (inMandala !== _lastImmerseBtnState) {
    _lastImmerseBtnState = inMandala;
    const immerseBtn = document.getElementById('immerse-btn');
    if (immerseBtn) {
      if (inMandala) {
        immerseBtn.classList.remove('hidden');
        immerseBtn.classList.add('visible');
      } else {
        immerseBtn.classList.add('hidden');
        immerseBtn.classList.remove('visible');
      }
    }
  }

  // 鼓点触发脉冲波纹
  if ((currentMode === 'idle-flower' || currentMode === 'audio-reactive') && particleMode === 'audio-reactive' && window.audioSpectrum && window.audioSpectrum.kick) {
    if (t - lastPulseTime > 300) {
      const warmth = window.audioSpectrum.warmth ?? 0.5;
      const hueShift = (t * 0.06 + warmth * 180) % 360;
      pulseWaves.push({ radius: 30, alpha: 150, hue: hueShift });
      if (pulseWaves.length > 3) pulseWaves.shift();  // 【性能】最多 3 个波纹
      lastPulseTime = t;
    }
  }
  // 【性能】预算波带范围 + 平方值，供 applyPulseWaveForces 用 dSq 快速剔除
  _pulseZoneMin = 0;
  _pulseZoneMax = 600;
  if (pulseWaves.length > 0) {
    for (let w = 0; w < Math.min(pulseWaves.length, 2); w++) {
      const wave = pulseWaves[w];
      if (wave.alpha > 20) {
        _pulseZoneMin = Math.min(_pulseZoneMin, wave.radius - 55);
        _pulseZoneMax = Math.max(_pulseZoneMax, wave.radius + 55);
      }
    }
    _pulseZoneMin = Math.max(0, _pulseZoneMin);
    _pulseZoneMinSq = _pulseZoneMin * _pulseZoneMin;
    _pulseZoneMaxSq = _pulseZoneMax * _pulseZoneMax;
  }
  push();
  translate(cx, cy);
  noFill();
  for (let i = pulseWaves.length - 1; i >= 0; i--) {
    const wave = pulseWaves[i];
    wave.radius += 8;
    wave.alpha -= 3;
    stroke(wave.hue, 50, 100, wave.alpha * 0.6);
    strokeWeight(2);
    circle(0, 0, wave.radius * 2);
    stroke(wave.hue, 40, 100, wave.alpha);
    strokeWeight(1);
    circle(0, 0, wave.radius * 2);
    if (wave.alpha <= 0) pulseWaves.splice(i, 1);
  }
  pop();

  // ====== 中心核：六瓣花瓣 + 渐变色彩，粒子轻微跳动，跟随音频 ======
  if (currentMode === 'idle-flower' || currentMode === 'audio-reactive') {
    const bassEnergy = window.audioSpectrum ? (window.audioSpectrum.bass || 0) / 255 : 0;
    const volumeNorm = window.audioSpectrum ? (window.audioSpectrum.volume || 0) / 255 : 0;
    const warmth = window.audioSpectrum ? (window.audioSpectrum.warmth ?? 0.5) : 0.5;
    const midEnergy = window.audioSpectrum ? (window.audioSpectrum.mid || 0) / 255 : 0;
    const hasAudio = particleMode === 'audio-reactive' && window.audioSpectrum && window.audioSpectrum.volume > 10;

    push();
    translate(cx, cy);
    blendMode(ADD);

    const breath = hasAudio
      ? (1 + bassEnergy * 0.5)
      : (Math.sin(t * 0.001) * 0.15 + 1);

    const flashMult = hasAudio ? (0.5 + 0.5 * Math.max(bassEnergy, volumeNorm)) : 1;

    const coreRadius = 70;
    const k = 3;

    const detRand = (i, seed) => {
      const n = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
      return n - Math.floor(n);
    };

    // 色彩：中心黄(50)→边缘蓝(240)，warmth 冷暖、midEnergy 偏移
    const hueCenter = 50;
    const hueEdge = 240;
    const hueWarmthOffset = (warmth - 0.5) * 35;
    // 色相漂移：Perlin 噪点 + 正弦，平滑过渡无跳变，自然飘逸
    const hueTimeDrift = (noise(t * 0.00018) * 220 + Math.sin(t * 0.0012) * 70) % 360;

    // ====== 六瓣花瓣【性能】1200 减轻鼓点+四层卡顿 ======
    const totalCoreParticles = 1200;
    for (let i = 0; i < totalCoreParticles; i++) {
      if ((i + frameCount) % 8 === 0) {
        const angle = (i / totalCoreParticles) * TWO_PI;
        const cosVal = Math.cos(k * angle);
        const petalShape = 0.5 + 0.5 * Math.pow(Math.abs(cosVal), 0.6);
        const maxR = coreRadius * breath * petalShape;
        const r = detRand(i, 0) * maxR;
        const basePx = r * Math.cos(angle);
        const basePy = r * Math.sin(angle);
        corePetalJitterX[i] = (noise(basePx * 0.015, basePy * 0.015, t * 0.0004) - 0.5) * 6;
        corePetalJitterY[i] = (noise(basePx * 0.015 + 100, basePy * 0.015, t * 0.0004) - 0.5) * 6;
        corePetalHuePhase[i] = (noise(i * 0.002, t * 0.0001) - 0.5) * 15;
      }
    }
    for (let i = 0; i < 350; i++) {
      if ((i + frameCount) % 8 === 0) {
        coreCenterJitter[i] = (noise(i * 0.05, t * 0.0005) - 0.5) * 5;
        coreCenterHuePhase[i] = (noise(i * 0.02, t * 0.0002) - 0.5) * 25;
      }
    }
    for (let i = 0; i < totalCoreParticles; i++) {
      const angle = (i / totalCoreParticles) * TWO_PI;
      const cosVal = Math.cos(k * angle);
      const petalShape = 0.5 + 0.5 * Math.pow(Math.abs(cosVal), 0.6);
      const maxR = coreRadius * breath * petalShape;
      const r = detRand(i, 0) * maxR;

      let px = r * Math.cos(angle);
      let py = r * Math.sin(angle);

      const jitterX = corePetalJitterX[i];
      const jitterY = corePetalJitterY[i];
      const wobble = Math.sin(i * 1.3 + t * 0.003) * 2;
      px += jitterX + Math.cos(i * 2.1 + t * 0.002) * wobble;
      py += jitterY + Math.sin(i * 1.7 + t * 0.0025) * wobble;

      const proximity = 1 - r / (coreRadius * breath);

      const huePhase = corePetalHuePhase[i];
      const hue = (hueCenter + (1 - proximity) * (hueEdge - hueCenter) + hueWarmthOffset + hueTimeDrift + midEnergy * 15 + huePhase) % 360;
      const sat = 25 + proximity * 35 + (1 - Math.abs(cosVal)) * 8;
      const bright = 82 + proximity * 15 + Math.sin(angle * 2) * 4;

      const baseAlpha = 80 + proximity * 160;
      stroke(hue, sat, bright, baseAlpha * flashMult);
      strokeWeight(0.5 + detRand(i, 1) + Math.sin(t * 0.005 + i) * 0.2);
      point(px, py);
    }

    // ====== 中心亮核【性能】350 ======
    for (let i = 0; i < 350; i++) {
      const u = detRand(i, 2);
      const v = detRand(i, 3);
      const r = (u + v) * 6 * breath;
      const a = v * TWO_PI;

      let cx0 = r * Math.cos(a);
      let cy0 = r * Math.sin(a);
      const jitter = coreCenterJitter[i];
      cx0 += Math.sin(i * 1.1 + t * 0.004) * jitter;
      cy0 += Math.cos(i * 1.4 + t * 0.003) * jitter;

      const proximityCore = 1 - r / 18;
      const hueCorePhase = coreCenterHuePhase[i];
      const hueCore = (hueCenter + hueWarmthOffset * 0.5 + hueTimeDrift * 0.5 + midEnergy * 10 + hueCorePhase) % 360;
      stroke(hueCore, 70 + proximityCore * 25, 90 + proximityCore * 10, (180 + u * 75) * flashMult);
      strokeWeight(0.5 + detRand(i, 4) + Math.sin(t * 0.006 + i * 0.5) * 0.25);
      point(cx0, cy0);
    }

    pop();
  }

  blendMode(BLEND);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  _bgGradient = null;
  _bgGradientW = _bgGradientH = 0;
  background(0);
}

/** 请求屏幕共享并建立音频连接（可复用于首次授权与重新授权） */
async function requestScreenCaptureAndSetupAudio() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
  });

  const videoTracks = stream.getVideoTracks();
  videoTracks.forEach(track => track.stop());
  console.log("✅ 视频轨已关闭，只保留音频");

  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    stream.getTracks().forEach(t => t.stop());
    throw new Error('请勾选【共享音频】');
  }

  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.55;  // 提高平滑度，减少频谱抖动

  sourceNode = audioContext.createMediaStreamSource(stream);
  sourceNode.connect(analyser);

  const bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);

  isAudioStarted = true;
  hasAudioTrack = true;
  console.log("✅ 系统音频已连接");

  startAudioDetection(analyser);
  hideAudioError();
  // 不在此处隐藏「请播放音乐」或显示状态栏，由 draw 根据音量动态控制
}

async function startExperience() {
  const overlay = document.getElementById('intro-overlay');
  overlay.innerHTML = '';
  overlay.classList.add('hidden');
  hideAudioError();

  console.log("✨ 模式切换: Converging");
  currentMode = 'converging';
  convergeStartTime = millis();

  try {
    await requestScreenCaptureAndSetupAudio();
    // 共享完成后进入全屏
    try {
      await document.documentElement.requestFullscreen();
    } catch (_) {}
  } catch (err) {
    console.error("❌ 音频捕获失败:", err.message);
    const config = getErrorConfig(err);
    showAudioError(config);
    isAudioStarted = false;
    hasAudioTrack = false;
    setTimeout(() => {
      currentMode = 'idle-flower';
      showPlayMusicPrompt();
      console.log("✨ 模式切换: Idle Flower（授权失败，延迟进入）");
    }, Math.max(CONVERGE_DURATION + BLOOM_DURATION, 2500));
  }
}

/** 重新授权：弹出共享询问界面，不刷新页面；完成后进入全屏 */
async function retryAudioCapture() {
  try {
    await requestScreenCaptureAndSetupAudio();
    try {
      await document.documentElement.requestFullscreen();
    } catch (_) {}
  } catch (err) {
    console.error("❌ 重新授权失败:", err.message);
    const config = getErrorConfig(err);
    showAudioError(config);
  }
}

// 音频检测循环：提取 bass/mid/treble/warmth/kick + 切换粒子模式
// 【性能优化】30fps 更新，降低与 draw 的主线程争用，视觉上无差异（人耳对 ~33ms 延迟不敏感）
function startAudioDetection(analyser) {
  const bufferLength = analyser.frequencyBinCount;
  const detectDataArray = new Uint8Array(bufferLength);
  let frameCount = 0;
  let prevBass = 0;
  const AUDIO_THRESHOLD = 8;
  const third = Math.floor(bufferLength / 3);
  const third2 = third * 2;

  const SMOOTH = 0.4;  // EMA 系数，越大响应越快、越易抖动
  function detect() {
    analyser.getByteFrequencyData(detectDataArray);

    let bass = 0, mid = 0, treble = 0;
    for (let i = 0; i < third; i++) bass += detectDataArray[i];
    for (let i = third; i < third2; i++) mid += detectDataArray[i];
    for (let i = third2; i < bufferLength; i++) treble += detectDataArray[i];
    bass /= third; mid /= third; treble /= (bufferLength - third2);
    const volume = (bass + mid + treble) / 3;
    const midLowRatio = (bass + mid) / (treble + 1);
    const warmth = Math.min(midLowRatio / 3, 1);
    const kickDelta = bass - prevBass;
    const kick = kickDelta > 40 && bass > 70;
    prevBass = bass;

    // 【响应优化】EMA 平滑，消除粒子随音乐跳动时的卡顿感
    _spectrumSmooth.bass = _spectrumSmooth.bass * (1 - SMOOTH) + bass * SMOOTH;
    _spectrumSmooth.mid = _spectrumSmooth.mid * (1 - SMOOTH) + mid * SMOOTH;
    _spectrumSmooth.treble = _spectrumSmooth.treble * (1 - SMOOTH) + treble * SMOOTH;
    _spectrumSmooth.volume = _spectrumSmooth.volume * (1 - SMOOTH) + volume * SMOOTH;
    _spectrumSmooth.warmth = _spectrumSmooth.warmth * (1 - SMOOTH) + warmth * SMOOTH;
    window.audioSpectrum = {
      bass: _spectrumSmooth.bass, mid: _spectrumSmooth.mid, treble: _spectrumSmooth.treble,
      volume: _spectrumSmooth.volume, kick, warmth: _spectrumSmooth.warmth
    };

    if (volume > AUDIO_THRESHOLD) {
      particleMode = 'audio-reactive';
      const currentTime = millis();
      if (kick && currentTime - lastLayerGrowTime > 3000 && maxActiveLayer < 3) {
        maxActiveLayer++;
        lastLayerGrowTime = currentTime;
        console.log("鼓点触发，跳到第", maxActiveLayer + 1, "层");
      } else if (currentTime - lastLayerGrowTime > LAYER_GROW_INTERVAL && maxActiveLayer < 3) {
        maxActiveLayer++;
        lastLayerGrowTime = currentTime;
        console.log("生长到第", maxActiveLayer + 1, "层");
      }
      if (frameCount % 30 === 0) console.log("音频模式 | 音量:", volume.toFixed(1), "| 层数:", maxActiveLayer + 1);
    } else {
      particleMode = 'idle-flower';
      if (maxActiveLayer > 0) {
        maxActiveLayer = 0;
        lastLayerGrowTime = 0;
        console.log("重置到第1层");
      }
      if (frameCount % 30 === 0) console.log("花朵模式 | 音量:", volume.toFixed(1));
    }

    frameCount++;
  }

  detect();  // 立即执行一次
  setInterval(detect, 20);  // 50fps，提高音乐响应流畅度
}

// 每帧更新曼陀罗全局参数（只调用一次）
function updateMandalaGlobals(spectrum) {
  const bassEnergy = (spectrum.bass || 0) / 255;
  const midEnergy = (spectrum.mid || 0) / 255;
  const trebleEnergy = (spectrum.treble || 0) / 255;

  if (bassEnergy > 0.3) globalPetalCount = 6;
  else if (midEnergy > 0.3) globalPetalCount = 8;
  else if (trebleEnergy > 0.2) globalPetalCount = 12;
  else globalPetalCount = 6;

  targetScale = 1 + bassEnergy * 0.5;
  globalScale += (targetScale - globalScale) * 0.08;  // 全局缩放响应更跟拍
  colorWarmth = spectrum.warmth ?? 0.5;
  const baseRotation = 0.001;
  const musicBoost = midEnergy * 0.004;
  globalRotation += baseRotation + musicBoost;
  edgeSparkle = trebleEnergy;
}

function updateIdleGlobals() {
  globalPetalCount = 6;
  targetScale = 0.8;
  globalScale += (targetScale - globalScale) * 0.1;
  globalRotation += 0.0008;
  colorWarmth = 0.5;
  edgeSparkle = 0;
}

// 从 AnalyserNode 获取频谱（兼容原 fft.analyze() 格式）
function getSpectrum() {
  if (!analyser || !dataArray) return [];
  analyser.getByteFrequencyData(dataArray);
  return Array.from(dataArray);
}

// 获取低频能量（约 20-250Hz），兼容原 fft.getEnergy('bass')
function getBassEnergy() {
  if (!dataArray || dataArray.length === 0) return 0;
  let sum = 0;
  const bassBins = Math.min(12, Math.floor(dataArray.length * 0.02));
  for (let i = 0; i < bassBins; i++) sum += dataArray[i];
  return bassBins > 0 ? sum / bassBins : 0;
}

function getErrorConfig(err) {
  if (err.name && ERROR_MESSAGES[err.name]) {
    return ERROR_MESSAGES[err.name];
  }
  if (err.message && err.message.includes('共享音频')) {
    return ERROR_MESSAGES['NotFoundError'];
  }
  return ERROR_MESSAGES['default'];
}

function showAudioError(config) {
  const el = document.getElementById('audio-error');
  if (!el || !config) return;

  const stepsHtml = config.hasSteps ? `
    <div class="error-steps">
      <div class="error-step">
        <span class="step-num">1</span>
        <div class="error-step-content">
          <p class="step-zh">点击下方【重新授权】</p>
          <p class="step-en">Click "Re-authorize" below</p>
        </div>
      </div>
      <div class="error-step">
        <span class="step-num">2</span>
        <div class="error-step-content">
          <p class="step-zh">在弹窗中选择整个屏幕</p>
          <p class="step-en">Select entire screen in the pop-up</p>
        </div>
      </div>
      <div class="error-step">
        <span class="step-num step-highlight">3</span>
        <div class="error-step-content">
          <p class="step-zh">勾选同时共享系统音频</p>
          <p class="step-en">Check "Share system audio"</p>
        </div>
      </div>
      <div class="error-step">
        <span class="step-num">4</span>
        <div class="error-step-content">
          <p class="step-zh">点击【共享】</p>
          <p class="step-en">Click "Share"</p>
        </div>
      </div>
    </div>
  ` : '';

  const titleEn = config.titleEn || config.title;

  el.innerHTML = `
    <div class="error-overlay">
      <div class="error-card">
        <h3 class="error-title-zh">${config.title}</h3>
        <p class="error-title-en">${titleEn}</p>
        ${stepsHtml}
        <button id="error-retry-btn" class="error-retry-btn">
          <span class="btn-text-zh">重新授权</span>
          <span class="btn-text-en">Re-authorize</span>
        </button>
      </div>
    </div>
  `;
  el.classList.remove('hidden');

  const retryBtn = document.getElementById('error-retry-btn');
  if (retryBtn) retryBtn.onclick = () => retryAudioCapture();
}

function hideAudioError() {
  const el = document.getElementById('audio-error');
  if (el) el.classList.add('hidden');
}

function showPlayMusicPrompt() {
  const el = document.getElementById('play-music-prompt');
  if (el) el.classList.remove('hidden');
  const statusBar = document.getElementById('status-bar');
  if (statusBar) statusBar.style.opacity = 0;
}

function hidePlayMusicPrompt() {
  const el = document.getElementById('play-music-prompt');
  if (el) el.classList.add('hidden');
}

// 重新授权：弹出共享询问界面（不刷新页面）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRetryBtn);
} else {
  initRetryBtn();
}
function initRetryBtn() {
  const btn = document.getElementById('retry-auth-btn');
  if (btn) btn.onclick = () => retryAudioCapture();
}