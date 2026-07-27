// ==================== 我的世界 - 网页版 ===
// 原生 WebGL 体素引擎 | 程序化地形 | 第一人称物理 | 昼夜循环

"use strict";

// ============================================================
// 第一部分：噪声函数 & 工具
// ============================================================

// --- Perlin 噪声 ---
class PerlinNoise {
  constructor(seed = Math.random() * 65536) {
    this.perm = new Uint8Array(512);
    let p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // 用种子打乱
    let s = seed | 0;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807) % 2147483647;
      let j = s % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  lerp(a, b, t) { return a + t * (b - a); }
  grad(hash, x, y, z) {
    let h = hash & 15, u = h < 8 ? x : y, v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
  noise3(x, y, z) {
    let X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    let u = this.fade(x), v = this.fade(y), w = this.fade(z);
    let p = this.perm;
    let A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    let B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return this.lerp(
      this.lerp(this.lerp(this.grad(p[AA], x, y, z), this.grad(p[BA], x - 1, y, z), u),
                this.lerp(this.grad(p[AB], x, y - 1, z), this.grad(p[BB], x - 1, y - 1, z), u), v),
      this.lerp(this.lerp(this.grad(p[AA + 1], x, y, z - 1), this.grad(p[BA + 1], x - 1, y, z - 1), u),
                this.lerp(this.grad(p[AB + 1], x, y - 1, z - 1), this.grad(p[BB + 1], x - 1, y - 1, z - 1), u), v),
      w);
  }
  // 分形布朗运动 (多层噪声叠加)
  fbm(x, y, z, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
    let total = 0, frequency = 1, amplitude = 1, maxVal = 0;
    for (let i = 0; i < octaves; i++) {
      total += this.noise3(x * frequency, y * frequency, z * frequency) * amplitude;
      maxVal += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return total / maxVal;
  }
}

// --- 数学工具 ---
const mat4 = {
  create() { return new Float32Array(16); },
  identity(m) {
    m[0]=1;m[1]=0;m[2]=0;m[3]=0; m[4]=0;m[5]=1;m[6]=0;m[7]=0;
    m[8]=0;m[9]=0;m[10]=1;m[11]=0; m[12]=0;m[13]=0;m[14]=0;m[15]=1; return m;
  },
  perspective(m, fov, aspect, near, far) {
    let f = 1.0 / Math.tan(fov / 2), nf = 1 / (near - far);
    m[0]=f/aspect;m[1]=0;m[2]=0;m[3]=0;
    m[4]=0;m[5]=f;m[6]=0;m[7]=0;
    m[8]=0;m[9]=0;m[10]=(far+near)*nf;m[11]=-1;
    m[12]=0;m[13]=0;m[14]=2*far*near*nf;m[15]=0; return m;
  },
  multiply(out, a, b) {
    let a00=a[0],a01=a[1],a02=a[2],a03=a[3],a10=a[4],a11=a[5],a12=a[6],a13=a[7];
    let a20=a[8],a21=a[9],a22=a[10],a23=a[11],a30=a[12],a31=a[13],a32=a[14],a33=a[15];
    let b0=b[0],b1=b[1],b2=b[2],b3=b[3];
    out[0]=b0*a00+b1*a10+b2*a20+b3*a30; out[1]=b0*a01+b1*a11+b2*a21+b3*a31;
    out[2]=b0*a02+b1*a12+b2*a22+b3*a32; out[3]=b0*a03+b1*a13+b2*a23+b3*a33;
    b0=b[4];b1=b[5];b2=b[6];b3=b[7];
    out[4]=b0*a00+b1*a10+b2*a20+b3*a30; out[5]=b0*a01+b1*a11+b2*a21+b3*a31;
    out[6]=b0*a02+b1*a12+b2*a22+b3*a32; out[7]=b0*a03+b1*a13+b2*a23+b3*a33;
    b0=b[8];b1=b[9];b2=b[10];b3=b[11];
    out[8]=b0*a00+b1*a10+b2*a20+b3*a30; out[9]=b0*a01+b1*a11+b2*a21+b3*a31;
    out[10]=b0*a02+b1*a12+b2*a22+b3*a32; out[11]=b0*a03+b1*a13+b2*a23+b3*a33;
    b0=b[12];b1=b[13];b2=b[14];b3=b[15];
    out[12]=b0*a00+b1*a10+b2*a20+b3*a30; out[13]=b0*a01+b1*a11+b2*a21+b3*a31;
    out[14]=b0*a02+b1*a12+b2*a22+b3*a32; out[15]=b0*a03+b1*a13+b2*a23+b3*a33;
    return out;
  },
  translate(m, x, y, z) { m[12]+=x*m[0]+y*m[4]+z*m[8]; m[13]+=x*m[1]+y*m[5]+z*m[9]; m[14]+=x*m[2]+y*m[6]+z*m[10]; return m; },
  rotateX(m, r) { let c=Math.cos(r),s=Math.sin(r); let m4=m[4],m5=m[5],m6=m[6],m7=m[7],m8=m[8],m9=m[9],m10=m[10],m11=m[11]; m[4]=m4*c+m8*s;m[5]=m5*c+m9*s;m[6]=m6*c+m10*s;m[7]=m7*c+m11*s;m[8]=m4*-s+m8*c;m[9]=m5*-s+m9*c;m[10]=m6*-s+m10*c;m[11]=m7*-s+m11*c; return m; },
  rotateY(m, r) { let c=Math.cos(r),s=Math.sin(r); let m0=m[0],m1=m[1],m2=m[2],m3=m[3],m8=m[8],m9=m[9],m10=m[10],m11=m[11]; m[0]=m0*c+m8*-s;m[1]=m1*c+m9*-s;m[2]=m2*c+m10*-s;m[3]=m3*c+m11*-s;m[8]=m0*s+m8*c;m[9]=m1*s+m9*c;m[10]=m2*s+m10*c;m[11]=m3*s+m11*c; return m; },
  // lookAt：生成 view 矩阵（右手系，OpenGL 风格）
  // out = view 矩阵，使摄像机在 eye 处看向 center，up 为上方向
  lookAt(out, eye, center, up) {
    let z0 = eye[0]-center[0], z1 = eye[1]-center[1], z2 = eye[2]-center[2]; // forward (camera → target 是 -z)
    let len = Math.hypot(z0,z1,z2); if (len === 0) { return mat4.identity(out); }
    z0/=len; z1/=len; z2/=len;
    // x = up × z
    let x0 = up[1]*z2 - up[2]*z1, x1 = up[2]*z0 - up[0]*z2, x2 = up[0]*z1 - up[1]*z0;
    len = Math.hypot(x0,x1,x2); if (len === 0) { x0=1;x1=0;x2=0; } else { x0/=len;x1/=len;x2/=len; }
    // y = z × x
    let y0 = z1*x2 - z2*x1, y1 = z2*x0 - z0*x2, y2 = z0*x1 - z1*x0;
    out[0]=x0; out[1]=y0; out[2]=z0; out[3]=0;
    out[4]=x1; out[5]=y1; out[6]=z1; out[7]=0;
    out[8]=x2; out[9]=y2; out[10]=z2; out[11]=0;
    out[12]=-(x0*eye[0]+x1*eye[1]+x2*eye[2]);
    out[13]=-(y0*eye[0]+y1*eye[1]+y2*eye[2]);
    out[14]=-(z0*eye[0]+z1*eye[1]+z2*eye[2]);
    out[15]=1;
    return out;
  },
};

// ============================================================
// 第二部分：方块定义
// ============================================================

const BLOCK = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WOOD: 5, LEAVES: 6,
  PLANKS: 7, COBBLE: 8, GLASS: 9, BRICK: 10, WATER: 11, BEDROCK: 12,
  COAL: 13, IRON: 14, GOLD: 15, DIAMOND: 16, SNOW: 17, GRAVEL: 18,
};

const BLOCK_NAMES = {
  [BLOCK.GRASS]: "草方块", [BLOCK.DIRT]: "泥土", [BLOCK.STONE]: "石头",
  [BLOCK.SAND]: "沙子", [BLOCK.WOOD]: "原木", [BLOCK.LEAVES]: "树叶",
  [BLOCK.PLANKS]: "木板", [BLOCK.COBBLE]: "鹅卵石", [BLOCK.GLASS]: "玻璃",
  [BLOCK.BRICK]: "红砖", [BLOCK.WATER]: "水", [BLOCK.BEDROCK]: "基岩",
  [BLOCK.COAL]: "煤矿石", [BLOCK.IRON]: "铁矿石", [BLOCK.GOLD]: "金矿石",
  [BLOCK.DIAMOND]: "钻石矿", [BLOCK.SNOW]: "雪块", [BLOCK.GRAVEL]: "沙砾",
};

// 每个方块的6面颜色: [top, bottom, north, south, east, west]
// 如果所有面相同，只需给一个颜色
const BLOCK_COLORS = {
  [BLOCK.GRASS]:   [0x4a8a3a, 0x8b6240, 0x9a7a4f, 0x9a7a4f, 0x9a7a4f, 0x9a7a4f],
  [BLOCK.DIRT]:    [0x8b6240, 0x8b6240, 0x8b6240, 0x8b6240, 0x8b6240, 0x8b6240],
  [BLOCK.STONE]:   [0x808080, 0x808080, 0x808080, 0x808080, 0x808080, 0x808080],
  [BLOCK.SAND]:    [0xe6d8a0, 0xe6d8a0, 0xe6d8a0, 0xe6d8a0, 0xe6d8a0, 0xe6d8a0],
  [BLOCK.WOOD]:    [0xa6844c, 0xa6844c, 0x6b4f2a, 0x6b4f2a, 0x6b4f2a, 0x6b4f2a],
  [BLOCK.LEAVES]:  [0x3d6b1f, 0x3d6b1f, 0x3d6b1f, 0x3d6b1f, 0x3d6b1f, 0x3d6b1f],
  [BLOCK.PLANKS]:  [0xb8945a, 0xb8945a, 0xb8945a, 0xb8945a, 0xb8945a, 0xb8945a],
  [BLOCK.COBBLE]:  [0x6b6b6b, 0x6b6b6b, 0x6b6b6b, 0x6b6b6b, 0x6b6b6b, 0x6b6b6b],
  [BLOCK.GLASS]:   [0xaaccddee, 0xaaccddee, 0xaaccddee, 0xaaccddee, 0xaaccddee, 0xaaccddee],
  [BLOCK.BRICK]:   [0x884422, 0x884422, 0x884422, 0x884422, 0x884422, 0x884422],
  [BLOCK.WATER]:   [0x3060ccaa, 0x3060ccaa, 0x3060ccaa, 0x3060ccaa, 0x3060ccaa, 0x3060ccaa],
  [BLOCK.BEDROCK]: [0x2a2a2a, 0x2a2a2a, 0x2a2a2a, 0x2a2a2a, 0x2a2a2a, 0x2a2a2a],
  [BLOCK.COAL]:    [0x707070, 0x707070, 0x707070, 0x707070, 0x707070, 0x707070],
  [BLOCK.IRON]:    [0x9a8a7a, 0x9a8a7a, 0x9a8a7a, 0x9a8a7a, 0x9a8a7a, 0x9a8a7a],
  [BLOCK.GOLD]:    [0xbba020, 0xbba020, 0xbba020, 0xbba020, 0xbba020, 0xbba020],
  [BLOCK.DIAMOND]: [0x4ad0d0, 0x4ad0d0, 0x4ad0d0, 0x4ad0d0, 0x4ad0d0, 0x4ad0d0],
  [BLOCK.SNOW]:    [0xf0f0f8, 0xf0f0f8, 0xf0f0f8, 0xf0f0f8, 0xf0f0f8, 0xf0f0f8],
  [BLOCK.GRAVEL]:  [0x7a7a7a, 0x7a7a7a, 0x7a7a7a, 0x7a7a7a, 0x7a7a7a, 0x7a7a7a],
};

const TRANSPARENT_BLOCKS = new Set([BLOCK.AIR, BLOCK.GLASS, BLOCK.WATER, BLOCK.LEAVES]);
const SOLID_BLOCKS = new Set([BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SAND, BLOCK.WOOD, BLOCK.LEAVES, BLOCK.PLANKS, BLOCK.COBBLE, BLOCK.BRICK, BLOCK.BEDROCK, BLOCK.COAL, BLOCK.IRON, BLOCK.GOLD, BLOCK.DIAMOND, BLOCK.SNOW, BLOCK.GRAVEL]);

// ============================================================
// 第三部分：世界 & 区块系统
// ============================================================

const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 64;
const SEALEVEL = 26;
const RENDER_DIST = 5;

class Chunk {
  constructor(cx, cz, world) {
    this.cx = cx; this.cz = cz;
    this.world = world;
    this.blocks = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    this.dirty = true;
    this.meshData = null;
    this.hasMesh = false;
  }
  idx(x, y, z) { return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x; }
  get(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return BLOCK.AIR;
    return this.blocks[this.idx(x, y, z)];
  }
  set(x, y, z, b) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
    this.blocks[this.idx(x, y, z)] = b;
    this.dirty = true;
  }
  // 获取方块（接受世界坐标）
  getWorld(wx, wy, wz) {
    let lx = wx - this.cx * CHUNK_SIZE, lz = wz - this.cz * CHUNK_SIZE;
    return this.get(lx, wy, lz);
  }
}

class World {
  constructor(seed) {
    this.seed = seed;
    this.noise = new PerlinNoise(seed);
    this.noise2 = new PerlinNoise(seed + 1000);
    this.noise3 = new PerlinNoise(seed + 2000);
    this.treeNoise = new PerlinNoise(seed + 3000);
    this.chunks = new Map();
    this.chunkQueue = [];
  }
  key(cx, cz) { return cx + "," + cz; }
  getChunk(cx, cz) { return this.chunks.get(this.key(cx, cz)); }
  ensureChunk(cx, cz) {
    let k = this.key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      c = new Chunk(cx, cz, this);
      this.generateChunk(c);
      this.chunks.set(k, c);
    }
    return c;
  }
  // 获取方块（世界坐标）
  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return BLOCK.AIR;
    let cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
    let c = this.getChunk(cx, cz);
    if (!c) return BLOCK.AIR;
    let lx = wx - cx * CHUNK_SIZE, lz = wz - cz * CHUNK_SIZE;
    return c.get(lx, wy, lz);
  }
  // 设置方块（世界坐标）
  setBlock(wx, wy, wz, b) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    let cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
    let c = this.ensureChunk(cx, cz);
    let lx = wx - cx * CHUNK_SIZE, lz = wz - cz * CHUNK_SIZE;
    c.set(lx, wy, lz, b);  // ★ 修：之前用 wz 当 lz，错的
    // 标记邻居chunk dirty（如果方块在边界）
    if (lx === 0) { let n = this.getChunk(cx-1, cz); if (n) n.dirty = true; }
    if (lx === CHUNK_SIZE-1) { let n = this.getChunk(cx+1, cz); if (n) n.dirty = true; }
    if (lz === 0) { let n = this.getChunk(cx, cz-1); if (n) n.dirty = true; }
    if (lz === CHUNK_SIZE-1) { let n = this.getChunk(cx, cz+1); if (n) n.dirty = true; }
  }
  // 生成区块地形
  generateChunk(chunk) {
    let baseX = chunk.cx * CHUNK_SIZE, baseZ = chunk.cz * CHUNK_SIZE;
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        let wx = baseX + x, wz = baseZ + z;
        // 基础高度：海平面 + 8 ~ +12 的大尺度起伏 → 保证大部分是陆地
        // h1: 大范围地形（-1~1 → ±20）
        let h1 = this.noise.fbm(wx * 0.01, 0, wz * 0.01, 4, 0.5, 2.0) * 20;
        // h2: 中尺度细节（±6）
        let h2 = this.noise2.fbm(wx * 0.03, 0, wz * 0.03, 3, 0.5, 2.0) * 6;
        let height = Math.floor(SEALEVEL + 6 + h1 + h2);  // 基础 +6 让大部分陆地 > 海平面
        height = Math.max(3, Math.min(WORLD_HEIGHT - 5, height));

        // 山脉：低频高幅度叠加
        let mountain = this.noise3.fbm(wx * 0.0025, 0, wz * 0.0025, 3, 0.5, 2.0);
        if (mountain > 0.3) height += Math.floor((mountain - 0.3) * 40);

        // 平滑 clamp 防超出
        height = Math.max(3, Math.min(WORLD_HEIGHT - 5, height));

        for (let y = 0; y <= height; y++) {
          let block = BLOCK.STONE;
          if (y === 0) block = BLOCK.BEDROCK;
          else if (y === height) {
            if (height < SEALEVEL) block = BLOCK.SAND;        // 水下用沙
            else if (height > SEALEVEL + 16) block = BLOCK.SNOW; // 高山顶雪
            else block = BLOCK.GRASS;
          }
          else if (y >= height - 3) {
            if (height < SEALEVEL) block = BLOCK.SAND;
            else block = BLOCK.DIRT;
          }
          // 矿石（在更深层）
          if (y < height - 4) {
            let oreNoise = this.noise.noise3(wx * 0.1, y * 0.1, wz * 0.1);
            if (y < 8 && oreNoise > 0.7) block = BLOCK.DIAMOND;
            else if (y < 14 && oreNoise > 0.65) block = BLOCK.GOLD;
            else if (y < 20 && oreNoise > 0.6) block = BLOCK.IRON;
            else if (oreNoise > 0.55) block = BLOCK.COAL;
          }
          chunk.set(x, y, z, block);
        }
        // 矿洞生成：y < 20 用 3D 噪声挖出洞穴
        for (let y = 1; y < 20 && y < height; y++) {
          let caveNoise1 = this.noise.noise3(wx * 0.06, y * 0.08, wz * 0.06);
          let caveNoise2 = this.noise2.noise3(wx * 0.03, y * 0.04, wz * 0.03);
          if (caveNoise1 > 0.5 && caveNoise2 > 0.3) {
            // 挖空（保留基岩层 y=0）
            chunk.set(x, y, z, BLOCK.AIR);
          }
        }
        // 水填充：只在低于海平面的地方填水
        for (let y = height + 1; y <= SEALEVEL; y++) {
          chunk.set(x, y, z, BLOCK.WATER);
        }
        // 树（多种类型）
        if (height >= SEALEVEL && height < SEALEVEL + 14) {
          let tn = this.treeNoise.noise3(wx * 0.5, 0, wz * 0.5);
          if (tn > 0.72 && Math.random() < 0.35) {
            let treeType = Math.floor(Math.random() * 3); // 0=橡树,1=白桦,2=松树
            this.placeTree(chunk, x, height + 1, z, treeType);
          }
        }
      }
    }
    chunk.dirty = true;
  }
  placeTree(chunk, x, y, z, type = 0) {
    if (type === 0) {
      // 橡树：矮粗树冠
      let h = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < h; i++) if (y + i < WORLD_HEIGHT) chunk.set(x, y + i, z, BLOCK.WOOD);
      let top = y + h - 1;
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy <= 1; dy++) {
        let nx = x+dx, ny = top+dy, nz = z+dz;
        if (nx>=0&&nx<CHUNK_SIZE&&nz>=0&&nz<CHUNK_SIZE&&ny<WORLD_HEIGHT)
          if (Math.abs(dx)+Math.abs(dz)+dy < 4 && chunk.get(nx,ny,nz)===BLOCK.AIR) chunk.set(nx,ny,nz,BLOCK.LEAVES);
      }
      if (top+2<WORLD_HEIGHT) chunk.set(x, top+2, z, BLOCK.LEAVES);
    } else if (type === 1) {
      // 白桦：高瘦
      let h = 5 + Math.floor(Math.random() * 3);
      for (let i = 0; i < h; i++) if (y+i < WORLD_HEIGHT) chunk.set(x, y+i, z, BLOCK.WOOD);
      let top = y + h - 1;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) {
        let nx=x+dx, ny=top+dy, nz=z+dz;
        if (nx>=0&&nx<CHUNK_SIZE&&nz>=0&&nz<CHUNK_SIZE&&ny<WORLD_HEIGHT)
          if (Math.abs(dx)+Math.abs(dz)+dy < 3 && chunk.get(nx,ny,nz)===BLOCK.AIR) chunk.set(nx,ny,nz,BLOCK.LEAVES);
      }
      if (top+2<WORLD_HEIGHT) chunk.set(x, top+2, z, BLOCK.LEAVES);
      if (top+3<WORLD_HEIGHT) chunk.set(x, top+3, z, BLOCK.LEAVES);
    } else {
      // 松树：层叠锥形
      let h = 6 + Math.floor(Math.random() * 2);
      for (let i = 0; i < h; i++) if (y+i < WORLD_HEIGHT) chunk.set(x, y+i, z, BLOCK.WOOD);
      let top = y + h - 1;
      // 从底部到顶逐层缩小树冠
      for (let layer = 0; layer < 4; layer++) {
        let ly = y + 2 + layer * 2;
        let radius = layer < 2 ? 2 : 1;
        for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
          let nx=x+dx, ny=ly, nz=z+dz;
          if (nx>=0&&nx<CHUNK_SIZE&&nz>=0&&nz<CHUNK_SIZE&&ny<WORLD_HEIGHT)
            if (Math.abs(dx)+Math.abs(dz) <= radius && chunk.get(nx,ny,nz)===BLOCK.AIR) chunk.set(nx,ny,nz,BLOCK.LEAVES);
        }
      }
      if (top+1<WORLD_HEIGHT) chunk.set(x, top+1, z, BLOCK.LEAVES);
    }
  }
}

// === 纹理生成（程序化像素纹理）===
function makeTextureCanvas(drawFn, size = 16) {
  let c = document.createElement("canvas");
  c.width = c.height = size;
  let ctx = c.getContext("2d");
  drawFn(ctx, size);
  return c;
}

function drawBlockTexture(ctx, size, type) {
  let colors = BLOCK_COLORS[type];
  let baseColor = colors[0];
  let r = (baseColor >> 16) & 0xff, g = (baseColor >> 8) & 0xff, b = baseColor & 0xff;
  // 用 Perlin 类似噪声增加纹理
  let rng = (x, y) => {
    let n = Math.sin(x * 12.9898 + y * 78.233 + type * 37.0) * 43758.5453;
    return n - Math.floor(n);
  };
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let n = rng(x, y);
      let variation = (n - 0.5) * 30;
      let pr = Math.max(0, Math.min(255, r + variation));
      let pg = Math.max(0, Math.min(255, g + variation));
      let pb = Math.max(0, Math.min(255, b + variation));
      ctx.fillStyle = `rgb(${pr|0},${pg|0},${pb|0})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // 草方块顶部绿色
  if (type === BLOCK.GRASS) {
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < 4; y++) {
        let n = rng(x, y);
        let gr = 60 + n * 30, gc = 130 + n * 40, gb = 50 + n * 20;
        ctx.fillStyle = `rgb(${gr|0},${gc|0},${gb|0})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  // 矿石加斑点
  if (type === BLOCK.COAL || type === BLOCK.IRON || type === BLOCK.GOLD || type === BLOCK.DIAMOND) {
    let oreR, oreG, oreB;
    if (type === BLOCK.COAL) { oreR = 30; oreG = 30; oreB = 30; }
    else if (type === BLOCK.IRON) { oreR = 200; oreG = 160; oreB = 120; }
    else if (type === BLOCK.GOLD) { oreR = 230; oreG = 200; oreB = 40; }
    else { oreR = 80; oreG = 220; oreB = 220; }
    for (let i = 0; i < 6; i++) {
      let ox = (rng(i, 0) * size) | 0, oy = (rng(i, 5) * size) | 0;
      ctx.fillStyle = `rgb(${oreR},${oreG},${oreB})`;
      ctx.fillRect(ox, oy, 2, 2);
      ctx.fillRect(ox+1, oy+1, 1, 1);
    }
  }
  // 木头纹理
  if (type === BLOCK.WOOD) {
    ctx.fillStyle = `rgb(${(r*0.7)|0},${(g*0.7)|0},${(b*0.7)|0})`;
    for (let y = 0; y < size; y += 4) { ctx.fillRect(0, y, size, 2); }
  }
}

// === 方块面朝向常量 ===
const FACES = [
  { dir: [0, 1, 0], corners: [[0,1,0],[1,1,0],[1,1,1],[0,1,1]] }, // top
  { dir: [0,-1, 0], corners: [[0,0,1],[1,0,1],[1,0,0],[0,0,0]] }, // bottom
  { dir: [0, 0,-1], corners: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] }, // north -z
  { dir: [0, 0, 1], corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] }, // south +z
  { dir: [1, 0, 0], corners: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]] }, // east +x
  { dir: [-1,0, 0], corners: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] }, // west -x
];

// ============================================================
// 第四部分：WebGL 着色器
// ============================================================

const VS_SOURCE = `
  attribute vec3 aPos;
  attribute vec3 aNormal;
  attribute vec4 aColor;
  attribute vec2 aUV;
  uniform mat4 uProj;
  uniform mat4 uView;
  uniform mat4 uModel;
  varying vec3 vNormal;
  varying vec4 vColor;
  varying vec2 vUV;
  varying vec3 vWorldPos;
  varying float vFog;
  void main() {
    vec4 worldPos = uModel * vec4(aPos, 1.0);
    gl_Position = uProj * uView * worldPos;
    vNormal = mat3(uModel) * aNormal;
    vColor = aColor;
    vUV = aUV;
    vWorldPos = worldPos.xyz;
    float dist = length(gl_Position.xyz);
    vFog = clamp((dist - 70.0) / 60.0, 0.0, 0.9);
  }
`;

const FS_SOURCE = `
  precision mediump float;
  varying vec3 vNormal;
  varying vec4 vColor;
  varying vec2 vUV;
  varying vec3 vWorldPos;
  varying float vFog;
  uniform vec3 uSunDir;
  uniform vec3 uSkyColor;
  uniform vec3 uFogColor;
  uniform float uTime;
  uniform sampler2D uTex;
  uniform bool uIsWater;
  void main() {
    vec3 n = normalize(vNormal);
    float light = max(dot(n, normalize(uSunDir)), 0.0);
    float amb = 0.35;
    float bright = light * 0.65 + amb;
    // 天空环境光（蓝色调）
    vec3 skyLight = vec3(0.4, 0.55, 0.7) * 0.3 * (1.0 - max(dot(n, vec3(0.0,1.0,0.0)), 0.0));

    vec4 texColor = texture2D(uTex, vUV);
    // 纹理色 × 顶点色调（顶点色提供面方向色彩差异）
    vec3 baseRGB = texColor.rgb * vColor.rgb;
    float alpha = texColor.a * vColor.a;
    // 完全透明（接近空气）才 discard，半透明走 blend
    if (alpha < 0.05) discard;

    vec3 color = baseRGB * bright + skyLight * baseRGB;

    if (uIsWater) {
      float wave = sin(vWorldPos.x * 2.0 + uTime * 1.5) * cos(vWorldPos.z * 2.0 + uTime * 1.2) * 0.1;
      color += vec3(0.1, 0.15, 0.2) * wave;
      color = mix(color, vec3(0.2, 0.4, 0.6), 0.3);
    }

    // 简单 AO（顶面最亮，侧面偏暗，底面最暗）
    float ao = 1.0;
    if (abs(n.y) < 0.1) ao = 0.80;
    else if (n.y < -0.5) ao = 0.60;
    color *= ao;

    // 雾
    vec3 fogColor = uFogColor;
    color = mix(color, fogColor, vFog * 0.8);

    gl_FragColor = vec4(color, alpha);
  }
`;

function compileShader(gl, src, type) {
  let s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s));
    throw "Shader compile error";
  }
  return s;
}
function linkProgram(gl, vs, fs) {
  let p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(p));
    throw "Program link error";
  }
  return p;
}

// === 纹理图集生成 ===
function createTextureAtlas(gl) {
  let size = 16;
  let cols = 8; // 每行8个纹理
  let types = Object.keys(BLOCK_COLORS).map(Number).sort((a,b)=>a-b);
  let rows = Math.ceil(types.length / cols);
  let atlasW = cols * size, atlasH = rows * size;
  let canvas = document.createElement("canvas");
  canvas.width = atlasW; canvas.height = atlasH;
  let ctx = canvas.getContext("2d");

  let blockTexIdx = {}; // block type -> [faceTexIdx...]
  let texIdx = 0;
  let texPositions = []; // 每个纹理在图集中的位置 [u0, v0, u1, v1]

  for (let bt of types) {
    let faceIdx = [];
    let faces = BLOCK_COLORS[bt];
    let usedTex = {};
    for (let f = 0; f < 6; f++) {
      let col = faces[f];
      let key = col;
      if (usedTex[key] !== undefined) {
        faceIdx.push(usedTex[key]);
      } else {
        let col2 = texIdx % cols, row2 = Math.floor(texIdx / cols);
        // 绘制这个纹理
        let cx = col2 * size, cy = row2 * size;
        let bc = col;
        let r,g,b,a;
        if (bt === BLOCK.GLASS) { r=200; g=220; b=240; a=100; }
        else if (bt === BLOCK.WATER) { r=60; g=100; b=180; a=130; }
        else { r=(bc>>16)&0xff; g=(bc>>8)&0xff; b=bc&0xff; a=255; }
        // 画到atlas
        let subCanvas = ctx.canvas;
        // 程序化纹理
        let rng = (x,y) => { let n = Math.sin(x*12.9898 + y*78.233 + bt*37) * 43758.5453; return n - Math.floor(n); };
        for (let x = 0; x < size; x++) {
          for (let y = 0; y < size; y++) {
            let noise = rng(x + col2 * 17, y + row2 * 23);
            let v = (noise - 0.5) * 25;
            let pr = Math.max(0, Math.min(255, r + v));
            let pg = Math.max(0, Math.min(255, g + v));
            let pb = Math.max(0, Math.min(255, b + v));
            ctx.fillStyle = `rgba(${pr|0},${pg|0},${pb|0},${a/255})`;
            ctx.fillRect(cx + x, cy + y, 1, 1);
          }
        }
        // 草顶绿色
        if (bt === BLOCK.GRASS && f === 0) {
          for (let x = 0; x < size; x++) {
            for (let y = 0; y < 6; y++) {
              let n = rng(x, y + 100);
              ctx.fillStyle = `rgb(${60+n*30|0},${130+n*40|0},${50+n*20|0})`;
              ctx.fillRect(cx + x, cy + y, 1, 1);
            }
          }
        }
        // 矿石斑点
        if (bt === BLOCK.COAL || bt === BLOCK.IRON || bt === BLOCK.GOLD || bt === BLOCK.DIAMOND) {
          let or=200,og=160,ob=120;
          if (bt===BLOCK.COAL){or=20;og=20;ob=20;}
          else if (bt===BLOCK.GOLD){or=230;og=200;ob=40;}
          else if (bt===BLOCK.DIAMOND){or=80;og=220;ob=220;}
          for (let i=0; i<7; i++) {
            let ox=(rng(i,0)*size)|0, oy=(rng(i,9)*size)|0;
            ctx.fillStyle=`rgb(${or},${og},${ob})`;
            ctx.fillRect(cx+ox, cy+oy, 2, 2);
          }
        }
        // 木纹
        if (bt === BLOCK.WOOD) {
          ctx.fillStyle=`rgb(${(r*0.6)|0},${(g*0.6)|0},${(b*0.6)|0})`;
          for (let y=0; y<size; y+=3) ctx.fillRect(cx, cy+y, size, 1);
        }
        // 砖纹
        if (bt === BLOCK.BRICK) {
          ctx.fillStyle=`rgb(${(r*0.5)|0},${(g*0.5)|0},${(b*0.5)|0})`;
          for (let y=0; y<size; y+=4) ctx.fillRect(cx, cy+y, size, 1);
          for (let y=0; y<size; y+=4) {
            let off = (y/4 % 2) ? 0 : 8;
            ctx.fillRect(cx+off, cy+y, 1, 4);
            ctx.fillRect(cx+off+8, cy+y, 1, 4);
          }
        }
        // 鹅卵石
        if (bt === BLOCK.COBBLE) {
          ctx.strokeStyle=`rgb(${(r*0.7)|0},${(g*0.7)|0},${(b*0.7)|0})`;
          ctx.lineWidth=1;
          for (let i=0; i<5; i++) {
            let cx2=cx+(rng(i,0)*size)|0, cy2=cy+(rng(i,3)*size)|0;
            ctx.strokeRect(cx2, cy2, 4, 4);
          }
        }

        let u0 = col2 * size / atlasW, v0 = row2 * size / atlasH;
        let u1 = (col2+1) * size / atlasW, v1 = (row2+1) * size / atlasH;
        texPositions.push([u0, v0, u1, v1]);
        usedTex[key] = texIdx;
        faceIdx.push(texIdx);
        texIdx++;
      }
    }
    blockTexIdx[bt] = faceIdx;
  }

  // 上传纹理
  let tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return { tex, positions: texPositions, blockTexIdx, atlasCanvas: canvas };
}

// ============================================================
// 第五部分：区块网格构建（贪心网格）
// ============================================================

function buildChunkMesh(world, chunk) {
  let baseX = chunk.cx * CHUNK_SIZE, baseZ = chunk.cz * CHUNK_SIZE;
  let positions = [], normals = [], colors = [], uvs = [], indices = [];
  let waterPositions = [], waterNormals = [], waterColors = [], waterUvs = [], waterIndices = [];
  let idx = 0, waterIdx = 0;

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        let bt = chunk.get(x, y, z);
        if (bt === BLOCK.AIR) continue;

        let isWater = bt === BLOCK.WATER;
        let wx = baseX + x, wz = baseZ + z;

        for (let f = 0; f < 6; f++) {
          let face = FACES[f];
          let nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
          // 从世界获取邻居（处理跨区块边界）
          let neighbor;
          if (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < WORLD_HEIGHT && nz >= 0 && nz < CHUNK_SIZE) {
            neighbor = chunk.get(nx, ny, nz);
          } else {
            neighbor = world.getBlock(wx + face.dir[0], y + face.dir[1], wz + face.dir[2]);
          }
          // 水只渲染顶面（如果上面是空气）
          if (isWater) {
            if (f !== 0) continue;
            if (neighbor !== BLOCK.AIR) continue;
          }
          // 透明方块不渲染被透明方块遮挡的面
          if (TRANSPARENT_BLOCKS.has(bt) && neighbor === bt) continue;
          // 不透明方块被不透明遮挡则跳过
          if (!TRANSPARENT_BLOCKS.has(bt) && !TRANSPARENT_BLOCKS.has(neighbor) && neighbor !== BLOCK.AIR) continue;
          // 水邻水跳过
          if (isWater && neighbor === BLOCK.WATER) continue;
          // 玻璃被玻璃遮挡
          if (bt === BLOCK.GLASS && neighbor === BLOCK.GLASS) continue;

          let texIdxArr = GL_ATLAS.blockTexIdx[bt];
          let texPos = GL_ATLAS.positions[texIdxArr[f]];
          let u0 = texPos[0], v0 = texPos[1], u1 = texPos[2], v1 = texPos[3];

          // 颜色
          let faceColors = BLOCK_COLORS[bt];
          let col = faceColors[f];
          let cr, cg, cb, ca;
          if (bt === BLOCK.GLASS) { cr=200; cg=220; cb=240; ca=120; }
          else if (bt === BLOCK.WATER) { cr=60; cg=100; cb=180; ca=140; }
          else { cr=(col>>16)&0xff; cg=(col>>8)&0xff; cb=col&0xff; ca=255; }

          // 面方向对应UV
          let cornerUVs;
          if (f === 0 || f === 1) { // top/bottom
            cornerUVs = [[u0,v0],[u1,v0],[u1,v1],[u0,v1]];
          } else {
            cornerUVs = [[u0,v1],[u0,v0],[u1,v0],[u1,v1]];
          }

          let targetPos, targetNorm, targetCol, targetUV, targetIdx;
          if (isWater) {
            targetPos = waterPositions; targetNorm = waterNormals; targetCol = waterColors; targetUV = waterUvs; targetIdx = waterIndices; waterIdx += 4;
          } else {
            targetPos = positions; targetNorm = normals; targetCol = colors; targetUV = uvs; targetIdx = indices; idx += 4;
          }
          let curIdx = isWater ? (waterIdx - 4) : (idx - 4);

          for (let c = 0; c < 4; c++) {
            let corner = face.corners[c];
            let py = corner[1] + y;
            // 水面降低一点
            if (isWater) py -= 0.1;
            targetPos.push(baseX + x + corner[0], py, baseZ + z + corner[2]);
            targetNorm.push(face.dir[0], face.dir[1], face.dir[2]);
            targetCol.push(cr/255, cg/255, cb/255, ca/255);
            targetUV.push(cornerUVs[c][0], cornerUVs[c][1]);
          }
          targetIdx.push(curIdx, curIdx+1, curIdx+2, curIdx, curIdx+2, curIdx+3);
        }
      }
    }
  }

  return {
    solid: { positions, normals, colors, uvs, indices },
    water: { positions: waterPositions, normals: waterNormals, colors: waterColors, uvs: waterUvs, indices: waterIndices }
  };
}

let GL_ATLAS = null;

// ============================================================
// 第六部分：渲染器
// ============================================================

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    let gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) { alert("你的浏览器不支持 WebGL！"); return; }
    this.gl = gl;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    // 不启用面剔除——FACES 的绕序不统一，直接渲染双面更可靠
    // gl.enable(gl.CULL_FACE);
    // gl.cullFace(gl.BACK);

    let vs = compileShader(gl, VS_SOURCE, gl.VERTEX_SHADER);
    let fs = compileShader(gl, FS_SOURCE, gl.FRAGMENT_SHADER);
    this.program = linkProgram(gl, vs, fs);
    gl.useProgram(this.program);

    this.loc = {
      aPos: gl.getAttribLocation(this.program, "aPos"),
      aNormal: gl.getAttribLocation(this.program, "aNormal"),
      aColor: gl.getAttribLocation(this.program, "aColor"),
      aUV: gl.getAttribLocation(this.program, "aUV"),
      uProj: gl.getUniformLocation(this.program, "uProj"),
      uView: gl.getUniformLocation(this.program, "uView"),
      uModel: gl.getUniformLocation(this.program, "uModel"),
      uSunDir: gl.getUniformLocation(this.program, "uSunDir"),
      uSkyColor: gl.getUniformLocation(this.program, "uSkyColor"),
      uFogColor: gl.getUniformLocation(this.program, "uFogColor"),
      uTime: gl.getUniformLocation(this.program, "uTime"),
      uTex: gl.getUniformLocation(this.program, "uTex"),
      uIsWater: gl.getUniformLocation(this.program, "uIsWater"),
    };

    GL_ATLAS = createTextureAtlas(gl);
    gl.uniform1i(this.loc.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, GL_ATLAS.tex);

    this.projMatrix = mat4.create();
    this.viewMatrix = mat4.create();
    this.modelMatrix = mat4.identity(mat4.create());
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
    mat4.perspective(this.projMatrix, Math.PI / 3, w / h, 0.1, 200);
  }

  uploadMesh(meshData) {
    let gl = this.gl;
    function makeBuffer(arr, itemSize, attribLoc) {
      if (arr.length === 0) return null;
      let buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
      return { buf, count: arr.length / itemSize, loc: attribLoc, size: itemSize };
    }
    function makeIndexBuffer(arr) {
      if (arr.length === 0) return null;
      let buf = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(arr), gl.STATIC_DRAW);
      return { buf, count: arr.length };
    }
    let s = meshData.solid;
    let w = meshData.water;
    return {
      solid: {
        pos: makeBuffer(s.positions, 3, this.loc.aPos),
        norm: makeBuffer(s.normals, 3, this.loc.aNormal),
        col: makeBuffer(s.colors, 4, this.loc.aColor),
        uv: makeBuffer(s.uvs, 2, this.loc.aUV),
        idx: makeIndexBuffer(s.indices),
      },
      water: {
        pos: makeBuffer(w.positions, 3, this.loc.aPos),
        norm: makeBuffer(w.normals, 3, this.loc.aNormal),
        col: makeBuffer(w.colors, 4, this.loc.aColor),
        uv: makeBuffer(w.uvs, 2, this.loc.aUV),
        idx: makeIndexBuffer(w.indices),
      },
    };
  }

  drawMesh(mesh, isWater, sunDir, fogColor, time) {
    let gl = this.gl;
    if (!mesh || !mesh.solid.pos) return;
    let m = isWater ? mesh.water : mesh.solid;
    if (!m.pos || m.pos.count === 0) return;

    gl.uniform1i(this.loc.uIsWater, isWater ? 1 : 0);
    gl.uniformMatrix4fv(this.loc.uModel, false, this.modelMatrix);
    gl.uniform3f(this.loc.uSunDir, sunDir[0], sunDir[1], sunDir[2]);
    gl.uniform3f(this.loc.uFogColor, fogColor[0], fogColor[1], fogColor[2]);
    gl.uniform1f(this.loc.uTime, time);

    function bindAttr(attr) {
      if (!attr) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, attr.buf);
      gl.enableVertexAttribArray(attr.loc);
      gl.vertexAttribPointer(attr.loc, attr.size, gl.FLOAT, false, 0, 0);
    }
    bindAttr(m.pos);
    bindAttr(m.norm);
    bindAttr(m.col);
    bindAttr(m.uv);
    if (m.idx) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx.buf);
      gl.drawElements(gl.TRIANGLES, m.idx.count, gl.UNSIGNED_SHORT, 0);
    }
  }

  render(world, player, time) {
    let gl = this.gl;
    // 昼夜循环（300秒一天，避免调试时太快进入黑夜）
    let dayCycle = (time / 300) % 1.0;
    let sunAngle = dayCycle * Math.PI * 2 - Math.PI / 2;
    let sunY = Math.sin(sunAngle);
    let sunX = Math.cos(sunAngle);
    let sunDir = [sunX, Math.max(-0.3, sunY), 0.3];

    let isDay = sunY > 0;
    let dayLight = isDay ? Math.max(0.2, sunY) : 0.15;
    let skyR = 0.50 * dayLight + 0.10;
    let skyG = 0.70 * dayLight + 0.15;
    let skyB = 0.95 * dayLight + 0.25;
    if (sunY < 0.0 && sunY > -0.2) {
      // 日落/日出橙色调
      skyR = 0.85; skyG = 0.50; skyB = 0.35;
    }
    let fogColor = [skyR, skyG, skyB];
    let clearColor = isDay
      ? [skyR * 0.8 + 0.1, skyG * 0.8 + 0.1, skyB * 0.8 + 0.1, 1]
      : [0.08, 0.10, 0.18, 1];  // 夜晚保留可见度，不纯黑
    gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 构建视图矩阵（lookAt，约定：yaw=0 朝 -Z，pitch 正=仰视看天上）
    let camDist = 0;
    let camHeight = player.eyeHeight;
    if (player.thirdPerson) { camDist = 5.5; camHeight = player.eyeHeight + 0.8; }
    let cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
    let cy = Math.cos(player.yaw), sy = Math.sin(player.yaw);
    let fwdX = -sy * cp, fwdY = sp, fwdZ = -cy * cp;
    // 第三人称：摄像机沿 -forward 方向后退
    let eyeX = player.x - fwdX * camDist;
    let eyeY = player.y + camHeight - fwdY * camDist;
    let eyeZ = player.z - fwdZ * camDist;
    // 第三人称目标点 = 玩家眼睛位置（而非摄像机 + forward）
    let centerX = player.x, centerY = player.y + player.eyeHeight, centerZ = player.z;
    if (!player.thirdPerson) { centerX = eyeX + fwdX; centerY = eyeY + fwdY; centerZ = eyeZ + fwdZ; }
    // 右手系 right = forward × up = (cy, 0, -sy)  (yaw 方向上的水平右向)
    let rightX = cy, rightY = 0, rightZ = -sy;
    // 真正的 up = right × forward（保证正交且不与 forward 平行）
    let upX = rightY * fwdZ - rightZ * fwdY;
    let upY = rightZ * fwdX - rightX * fwdZ;
    let upZ = rightX * fwdY - rightY * fwdX;
    mat4.lookAt(this.viewMatrix,
      [eyeX, eyeY, eyeZ],
      [centerX, centerY, centerZ],
      [upX, upY, upZ]
    );

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.loc.uProj, false, this.projMatrix);
    gl.uniformMatrix4fv(this.loc.uView, false, this.viewMatrix);
    gl.uniform3f(this.loc.uSkyColor, skyR, skyG, skyB);

    // 渲染区块
    let blockCount = 0;
    let renderedChunks = 0;
    let pcx = Math.floor(player.x / CHUNK_SIZE), pcz = Math.floor(player.z / CHUNK_SIZE);

    // 先确保区块生成和构建
    let chunksToBuild = [];
    for (let dx = -RENDER_DIST; dx <= RENDER_DIST; dx++) {
      for (let dz = -RENDER_DIST; dz <= RENDER_DIST; dz++) {
        let cx = pcx + dx, cz = pcz + dz;
        let chunk = world.ensureChunk(cx, cz);
        if (chunk.dirty || !chunk.glMesh) {
          chunksToBuild.push([cx, cz, chunk]);
        }
      }
    }
    // 每帧最多构建 2 个区块（避免卡顿）
    for (let i = 0; i < Math.min(2, chunksToBuild.length); i++) {
      let [cx, cz, chunk] = chunksToBuild[i];
      let mesh = buildChunkMesh(world, chunk);
      chunk.glMesh = this.uploadMesh(mesh);
      chunk.dirty = false;
    }

    // 实际渲染
    for (let dx = -RENDER_DIST; dx <= RENDER_DIST; dx++) {
      for (let dz = -RENDER_DIST; dz <= RENDER_DIST; dz++) {
        let cx = pcx + dx, cz = pcz + dz;
        let chunk = world.getChunk(cx, cz);
        if (chunk && chunk.glMesh) {
          this.drawMesh(chunk.glMesh, false, sunDir, fogColor, time);
          renderedChunks++;
        }
      }
    }
    // 水单独渲染（半透明，禁深度写入避免排序问题）
    gl.depthMask(false);
    for (let dx = -RENDER_DIST; dx <= RENDER_DIST; dx++) {
      for (let dz = -RENDER_DIST; dz <= RENDER_DIST; dz++) {
        let cx = pcx + dx, cz = pcz + dz;
        let chunk = world.getChunk(cx, cz);
        if (chunk && chunk.glMesh) {
          this.drawMesh(chunk.glMesh, true, sunDir, fogColor, time);
        }
      }
    }
    gl.depthMask(true);

    // 选中方块高亮线框
    if (this.selBox) {
      this.drawSelection(this.selBox);
      this.selBox = null;
    }

    // 第三人称时画玩家模型
    if (player.thirdPerson) {
      this.drawPlayerModel(player);
    }

    return { renderedChunks, blockCount };
  }

  // 画选中方块的线框（用 12 个细矩形条带模拟黑边，TRIANGLES 比 LINES 兼容性好）
  drawSelection(pos) {
    let gl = this.gl;
    let E = 0.03; // 边框厚度
    if (!this.selBuf) {
      // 生成 12 条边的矩形几何（每条边 = 2 个三角形 = 6 顶点，12 条边 = 72 顶点）
      // 每条边由两个端点 p1, p2 定义，矩形垂直于这条边
      let edges = [
        // 底面4条
        [[0,0,0],[1,0,0]], [[1,0,0],[1,0,1]], [[1,0,1],[0,0,1]], [[0,0,1],[0,0,0]],
        // 顶面4条
        [[0,1,0],[1,1,0]], [[1,1,0],[1,1,1]], [[1,1,1],[0,1,1]], [[0,1,1],[0,1,0]],
        // 竖4条
        [[0,0,0],[0,1,0]], [[1,0,0],[1,1,0]], [[1,0,1],[1,1,1]], [[0,0,1],[0,1,1]],
      ];
      let verts = [];
      function addQuad(a, b, c, d) {
        verts.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2],
                   a[0],a[1],a[2], c[0],c[1],c[2], d[0],d[1],d[2]);
      }
      for (let [p1, p2] of edges) {
        // 判断边方向
        let dx = p2[0]-p1[0], dy = p2[1]-p1[1], dz = p2[2]-p1[2];
        if (dx !== 0) {
          // X方向边：在 Y 和 Z 方向扩展厚度
          addQuad([p1[0],p1[1]-E,p1[2]-E],[p1[0],p1[1]+E,p1[2]-E],[p2[0],p2[1]+E,p2[2]-E],[p2[0],p2[1]-E,p2[2]-E]);
          addQuad([p1[0],p1[1]-E,p1[2]+E],[p1[0],p1[1]+E,p1[2]+E],[p2[0],p2[1]+E,p2[2]+E],[p2[0],p2[1]-E,p2[2]+E]);
        } else if (dy !== 0) {
          // Y方向边
          addQuad([p1[0]-E,p1[1],p1[2]-E],[p1[0]+E,p1[1],p1[2]-E],[p2[0]+E,p2[1],p2[2]-E],[p2[0]-E,p2[1],p2[2]-E]);
          addQuad([p1[0]-E,p1[1],p1[2]+E],[p1[0]+E,p1[1],p1[2]+E],[p2[0]+E,p2[1],p2[2]+E],[p2[0]-E,p2[1],p2[2]+E]);
        } else {
          // Z方向边
          addQuad([p1[0]-E,p1[1]-E,p1[2]],[p1[0]+E,p1[1]-E,p1[2]],[p2[0]+E,p2[1]-E,p2[2]],[p2[0]-E,p2[1]-E,p2[2]]);
          addQuad([p1[0]-E,p1[1]+E,p1[2]],[p1[0]+E,p1[1]+E,p1[2]],[p2[0]+E,p2[1]+E,p2[2]],[p2[0]-E,p2[1]+E,p2[2]]);
        }
      }
      this.selBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.selBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
      this.selVertCount = verts.length / 3;
      let vs = `attribute vec3 aPos; uniform mat4 uProj; uniform mat4 uView; uniform vec3 uOffset; void main(){ vec4 p = uProj * uView * vec4(aPos + uOffset, 1.0); gl_Position = p; }`;
      let fs = `precision mediump float; void main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, 0.4); }`;
      let s1 = compileShader(gl, vs, gl.VERTEX_SHADER);
      let s2 = compileShader(gl, fs, gl.FRAGMENT_SHADER);
      this.selProg = linkProgram(gl, s1, s2);
      this.selLoc = {
        aPos: gl.getAttribLocation(this.selProg, 'aPos'),
        uProj: gl.getUniformLocation(this.selProg, 'uProj'),
        uView: gl.getUniformLocation(this.selProg, 'uView'),
        uOffset: gl.getUniformLocation(this.selProg, 'uOffset'),
      };
    }
    gl.useProgram(this.selProg);
    gl.uniformMatrix4fv(this.selLoc.uProj, false, this.projMatrix);
    gl.uniformMatrix4fv(this.selLoc.uView, false, this.viewMatrix);
    gl.uniform3f(this.selLoc.uOffset, pos[0], pos[1], pos[2]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.selBuf);
    gl.enableVertexAttribArray(this.selLoc.aPos);
    gl.vertexAttribPointer(this.selLoc.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLES, 0, this.selVertCount);
    gl.enable(gl.DEPTH_TEST);
  }

  // 画云朵层（在 y=CLOUD_Y 处的半透明白色平面，用噪声决定密度）
  drawClouds(player, time) {
    let gl = this.gl;
    let CLOUD_Y = 48;
    let CLOUD_RANGE = 60;  // 云层在玩家周围 60 格范围
    if (!this.cloudBuf) {
      // 生成一块 16x16 的云纹理
      let cs = 64;
      let canvas = document.createElement("canvas");
      canvas.width = canvas.height = cs;
      let ctx = canvas.getContext("2d");
      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.fillRect(0, 0, cs, cs);
      // FBM 噪声生成云形状
      let rng = (x, y) => { let n = Math.sin(x*12.9898 + y*78.233) * 43758.5453; return n - Math.floor(n); };
      let img = ctx.createImageData(cs, cs);
      for (let y = 0; y < cs; y++) {
        for (let x = 0; x < cs; x++) {
          let n1 = rng(x * 0.5, y * 0.5);
          let n2 = rng(x * 0.15 + 100, y * 0.15 + 100) * 0.5;
          let n3 = rng(x * 0.06 + 200, y * 0.06 + 200) * 0.25;
          let v = n1 + n2 + n3;
          let alpha = v > 0.65 ? Math.min(200, (v - 0.65) * 600) : 0;
          let idx = (y * cs + x) * 4;
          img.data[idx] = 255; img.data[idx+1] = 255; img.data[idx+2] = 255;
          img.data[idx+3] = alpha;
        }
      }
      ctx.putImageData(img, 0, 0);
      this.cloudTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.cloudTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

      // 一块大平面的顶点（覆盖 -CLOUD_RANGE 到 +CLOUD_RANGE）
      let R = CLOUD_RANGE;
      let verts = [
        -R, 0, -R,  0, 0,
         R, 0, -R,  16, 0,
         R, 0,  R,  16, 16,
        -R, 0, -R,  0, 0,
         R, 0,  R,  16, 16,
        -R, 0,  R,  0, 16,
      ];
      this.cloudVertCount = 6;
      this.cloudBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cloudBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);

      // 云 shader
      let vs = `
        attribute vec3 aPos; attribute vec2 aUV;
        uniform mat4 uProj; uniform mat4 uView; uniform vec3 uOffset; uniform float uTime;
        varying vec2 vUV; varying float vDist;
        void main() {
          vec3 p = aPos + uOffset;
          gl_Position = uProj * uView * vec4(p, 1.0);
          vUV = aUV + vec2(uTime * 0.005, uTime * 0.003);
          vDist = length(gl_Position.xyz);
        }`;
      let fs = `
        precision mediump float; varying vec2 vUV; varying float vDist;
        uniform sampler2D uTex;
        void main() {
          vec4 c = texture2D(uTex, vUV);
          if (c.a < 0.01) discard;
          float fog = clamp((vDist - 80.0) / 40.0, 0.0, 0.5);
          c.a *= (1.0 - fog);
          gl_FragColor = c;
        }`;
      let s1 = compileShader(gl, vs, gl.VERTEX_SHADER);
      let s2 = compileShader(gl, fs, gl.FRAGMENT_SHADER);
      this.cloudProg = linkProgram(gl, s1, s2);
      this.cloudLoc = {
        aPos: gl.getAttribLocation(this.cloudProg, 'aPos'),
        aUV: gl.getAttribLocation(this.cloudProg, 'aUV'),
        uProj: gl.getUniformLocation(this.cloudProg, 'uProj'),
        uView: gl.getUniformLocation(this.cloudProg, 'uView'),
        uOffset: gl.getUniformLocation(this.cloudProg, 'uOffset'),
        uTime: gl.getUniformLocation(this.cloudProg, 'uTime'),
        uTex: gl.getUniformLocation(this.cloudProg, 'uTex'),
      };
    }
    gl.useProgram(this.cloudProg);
    gl.uniformMatrix4fv(this.cloudLoc.uProj, false, this.projMatrix);
    gl.uniformMatrix4fv(this.cloudLoc.uView, false, this.viewMatrix);
    // 云层跟随玩家（x,z），y 固定
    gl.uniform3f(this.cloudLoc.uOffset, player.x, CLOUD_Y, player.z);
    gl.uniform1f(this.cloudLoc.uTime, time);
    gl.uniform1i(this.cloudLoc.uTex, 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.cloudTex);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.cloudBuf);
    let stride = 5 * 4;
    gl.enableVertexAttribArray(this.cloudLoc.aPos);
    gl.vertexAttribPointer(this.cloudLoc.aPos, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.cloudLoc.aUV);
    gl.vertexAttribPointer(this.cloudLoc.aUV, 2, gl.FLOAT, false, stride, 3 * 4);

    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, this.cloudVertCount);
    gl.depthMask(true);
  }

  // 画玩家模型（简单的方块人：头、身体、双臂、双腿）
  drawPlayerModel(player) {
    let gl = this.gl;
    if (!this.playerPosBuf) {
      // genBox: 返回 {positions, normals, indices}，每个 box 6 面 24 顶点
      function genBox(ox, oy, oz, sx, sy, sz) {
        let x0=ox, y0=oy, z0=oz, x1=ox+sx, y1=oy+sy, z1=oz+sz;
        let positions = [
          // top (+y)
          x0,y1,z1, x1,y1,z1, x1,y1,z0, x0,y1,z0,
          // bottom (-y)
          x0,y0,z0, x1,y0,z0, x1,y0,z1, x0,y0,z1,
          // +z
          x0,y0,z1, x1,y0,z1, x1,y1,z1, x0,y1,z1,
          // -z
          x1,y0,z0, x0,y0,z0, x0,y1,z0, x1,y1,z0,
          // +x
          x1,y0,z1, x1,y0,z0, x1,y1,z0, x1,y1,z1,
          // -x
          x0,y0,z0, x0,y0,z1, x0,y1,z1, x0,y1,z0,
        ];
        let normals = [
          // top
          0,1,0, 0,1,0, 0,1,0, 0,1,0,
          // bottom
          0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0,
          // +z
          0,0,1, 0,0,1, 0,0,1, 0,0,1,
          // -z
          0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
          // +x
          1,0,0, 1,0,0, 1,0,0, 1,0,0,
          // -x
          -1,0,0, -1,0,0, -1,0,0, -1,0,0,
        ];
        let indices = [];
        for (let i = 0; i < 6; i++) {
          let b = i * 4;
          indices.push(b, b+1, b+2, b, b+2, b+3);
        }
        return {positions, normals, indices};
      }

      // 每个部位：[ox,oy,oz, sx,sy,sz, r,g,b]
      // 模型相对玩家中心 x=0.5,z=0.5，y=0 在脚下
      let parts = [
        // 头：0.5x0.5x0.5，y=1.3~1.8（肤色）
        [0.25, 1.3, 0.25,  0.5, 0.5, 0.5,  0.85, 0.70, 0.55],
        // 身体：0.6x0.8x0.3，y=0.5~1.3（蓝衣）
        [0.2, 0.5, 0.35,   0.6, 0.8, 0.3,   0.25, 0.45, 0.75],
        // 左臂：0.25x0.8x0.25，y=0.5~1.3（蓝衣袖）
        [-0.05, 0.5, 0.375, 0.25, 0.8, 0.25, 0.25, 0.45, 0.75],
        // 右臂
        [0.8, 0.5, 0.375,  0.25, 0.8, 0.25,  0.25, 0.45, 0.75],
        // 左腿：0.25x0.5x0.25，y=0~0.5（深蓝裤）
        [0.25, 0, 0.375,   0.25, 0.5, 0.25,  0.15, 0.20, 0.40],
        // 右腿
        [0.5, 0, 0.375,    0.25, 0.5, 0.25,  0.15, 0.20, 0.40],
      ];

      let allPos = [], allNorm = [], allCol = [], allIdx = [];
      let vOffset = 0;
      for (let p of parts) {
        let b = genBox(p[0], p[1], p[2], p[3], p[4], p[5]);
        let r = p[6], g = p[7], bl = p[8];
        for (let i = 0; i < b.positions.length; i += 3) {
          allPos.push(b.positions[i], b.positions[i+1], b.positions[i+2]);
          allNorm.push(b.normals[i], b.normals[i+1], b.normals[i+2]);
          allCol.push(r, g, bl, 1.0);
        }
        for (let i of b.indices) allIdx.push(i + vOffset);
        vOffset += 24;
      }

      this.playerPosBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.playerPosBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(allPos), gl.STATIC_DRAW);
      this.playerNormBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.playerNormBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(allNorm), gl.STATIC_DRAW);
      this.playerColBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.playerColBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(allCol), gl.STATIC_DRAW);
      this.playerIdxBuf = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.playerIdxBuf);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(allIdx), gl.STATIC_DRAW);
      this.playerIdxCount = allIdx.length;

      // 带 directional 光照的 shader
      let vs = `
        attribute vec3 aPos; attribute vec3 aNormal; attribute vec4 aColor;
        uniform mat4 uProj; uniform mat4 uView; uniform vec3 uOffset;
        varying vec3 vNormal; varying vec4 vColor;
        void main() {
          gl_Position = uProj * uView * vec4(aPos + uOffset, 1.0);
          vNormal = aNormal; vColor = aColor;
        }`;
      let fs = `
        precision mediump float;
        varying vec3 vNormal; varying vec4 vColor;
        uniform vec3 uSunDir;
        void main() {
          vec3 n = normalize(vNormal);
          float light = max(dot(n, normalize(uSunDir)), 0.0);
          float amb = 0.35;
          float bright = light * 0.65 + amb;
          // AO: 顶面最亮 侧暗 底最暗
          float ao = 1.0;
          if (abs(n.y) < 0.1) ao = 0.80;
          else if (n.y < -0.5) ao = 0.60;
          vec3 color = vColor.rgb * bright * ao;
          gl_FragColor = vec4(color, 1.0);
        }`;
      let s1 = compileShader(gl, vs, gl.VERTEX_SHADER);
      let s2 = compileShader(gl, fs, gl.FRAGMENT_SHADER);
      this.playerProg = linkProgram(gl, s1, s2);
      this.playerLoc = {
        aPos: gl.getAttribLocation(this.playerProg, 'aPos'),
        aNormal: gl.getAttribLocation(this.playerProg, 'aNormal'),
        aColor: gl.getAttribLocation(this.playerProg, 'aColor'),
        uProj: gl.getUniformLocation(this.playerProg, 'uProj'),
        uView: gl.getUniformLocation(this.playerProg, 'uView'),
        uOffset: gl.getUniformLocation(this.playerProg, 'uOffset'),
        uSunDir: gl.getUniformLocation(this.playerProg, 'uSunDir'),
      };
    }
    gl.useProgram(this.playerProg);
    gl.uniformMatrix4fv(this.playerLoc.uProj, false, this.projMatrix);
    gl.uniformMatrix4fv(this.playerLoc.uView, false, this.viewMatrix);
    gl.uniform3f(this.playerLoc.uOffset, player.x - 0.5, player.y, player.z - 0.5);
    // 光照方向（和主 renderer 同步）
    let gameTime = (performance.now() - Game.startTime) / 1000;
    let dayCycle = (gameTime / 300) % 1.0;
    let sunAngle = dayCycle * Math.PI * 2 - Math.PI / 2;
    let sunY = Math.sin(sunAngle); let sunX = Math.cos(sunAngle);
    gl.uniform3f(this.playerLoc.uSunDir, sunX, Math.max(-0.3, sunY), 0.3);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.playerPosBuf);
    gl.enableVertexAttribArray(this.playerLoc.aPos);
    gl.vertexAttribPointer(this.playerLoc.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.playerNormBuf);
    gl.enableVertexAttribArray(this.playerLoc.aNormal);
    gl.vertexAttribPointer(this.playerLoc.aNormal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.playerColBuf);
    gl.enableVertexAttribArray(this.playerLoc.aColor);
    gl.vertexAttribPointer(this.playerLoc.aColor, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.playerIdxBuf);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.drawElements(gl.TRIANGLES, this.playerIdxCount, gl.UNSIGNED_SHORT, 0);
  }
}

// ============================================================
// 第七部分：玩家 & 物理
// ============================================================

class Player {
  constructor(world) {
    this.world = world;
    this.x = 8; this.y = 40; this.z = 8;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0;
    this.onGround = false;
    this.inWater = false;
    this.width = 0.6;
    this.height = 1.8;
    this.eyeHeight = 1.62;
    this.speed = 4.5;
    this.flySpeed = 12;
    this.flying = false;
    this.thirdPerson = false;
    this.health = 20;
    this.fallDistance = 0;
  }

  // 检查碰撞箱是否与方块相交
  checkCollision(x, y, z) {
    let hw = this.width / 2;
    let minX = Math.floor(x - hw), maxX = Math.floor(x + hw);
    let minY = Math.floor(y), maxY = Math.floor(y + this.height);
    let minZ = Math.floor(z - hw), maxZ = Math.floor(z + hw);
    for (let bx = minX; bx <= maxX; bx++) {
      for (let by = minY; by <= maxY; by++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          let b = this.world.getBlock(bx, by, bz);
          if (SOLID_BLOCKS.has(b)) return true;
        }
      }
    }
    return false;
  }

  // 检查头部是否浸在水里（用于溺水）
  checkHeadInWater() {
    let headY = this.y + this.eyeHeight;
    let hx = Math.floor(this.x), hy = Math.floor(headY), hz = Math.floor(this.z);
    return this.world.getBlock(hx, hy, hz) === BLOCK.WATER;
  }
  // 检查身体是否在水中（用于浮力/减速）
  checkWater(x, y, z) {
    let cy = y + 0.8; // 身体中段
    let cx = Math.floor(x), cz = Math.floor(z), cyi = Math.floor(cy);
    return this.world.getBlock(cx, cyi, cz) === BLOCK.WATER;
  }

  // 单轴移动 + 碰撞
  moveAxis(axis, delta) {
    let nx = this.x, ny = this.y, nz = this.z;
    if (axis === 0) nx += delta;
    else if (axis === 1) ny += delta;
    else nz += delta;
    if (!this.checkCollision(nx, ny, nz)) {
      this.x = nx; this.y = ny; this.z = nz;
      return false;
    } else {
      return true; // 碰撞了
    }
  }

  update(dt, input) {
    // 检查水中
    this.inWater = this.checkWater(this.x, this.y, this.z);
    let speed = this.flying ? this.flySpeed : (this.inWater ? this.speed * 0.5 : this.speed);

    // 计算移动方向
    // forward = (-sin(yaw), 0, -cos(yaw))（与 raycast 一致，yaw=0 朝 -Z）
    // right   = (-cos(yaw), 0,  sin(yaw))  = forward × up
    let fx = 0, fz = 0;
    let sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    if (input.forward) { fx += -sin; fz += -cos; }
    if (input.back)    { fx +=  sin; fz +=  cos; }
    if (input.left)    { fx += -cos; fz +=  sin; } // A = 左 = right 方向的反向
    if (input.right)   { fx +=  cos; fz += -sin; } // D = 右 = right 方向
    let len = Math.sqrt(fx*fx + fz*fz);
    if (len > 0) { fx /= len; fz /= len; }

    if (this.flying) {
      this.vx = fx * speed * dt;
      this.vz = fz * speed * dt;
      // 飞行上下：vy 直接设为位移量（不保留惯性），moveAxis 用 vy*dt → 所以这里设速度/秒
      if (input.jump) this.vy = speed;
      else if (input.shift) this.vy = -speed;
      else this.vy = 0;
    } else if (this.inWater) {
      this.vx = fx * speed * dt;
      this.vz = fz * speed * dt;
      this.vy -= 8 * dt;        // 水中重力（比空气小）
      this.vy = Math.max(this.vy, -4); // 限制下沉速度（速度/秒）
      if (input.jump) this.vy = 5;     // 水中上浮速度（速度/秒）
    } else {
      this.vx = fx * speed * dt;
      this.vz = fz * speed * dt;
      this.vy -= 28 * dt;       // 重力（单位：速度/秒²）
      if (input.jump && this.onGround) {
        this.vy = 8.4;          // 跳跃初速度（速度/秒）→ 约 1.26 格高
        this.onGround = false;
        this.fallDistance = 0;  // 跳跃时清零下落距离
      }
    }

    // 保存旧Y
    let oldY = this.y;

    // 单轴移动 + 碰撞检测（vy 是速度/秒，需乘 dt 得到位移）
    let collidedX = this.moveAxis(0, this.vx);       // vx 已经是 位移量(speed*dt)
    let collidedZ = this.moveAxis(2, this.vz);       // vz 已经是 位移量
    let collidedY = this.moveAxis(1, this.vy * dt);  // ★ vy 是速度/秒，必须乘 dt
    let prevVy = this.vy;  // 记录碰撞前的 vy（用于判断落地方向）

    // 落地检测
    if (collidedY && this.vy < 0) {
      this.onGround = true;
      // 摔伤：只有从 4 格以上的地方自由落下才算
      if (this.fallDistance > 4 && !this.flying) {
        let dmg = Math.floor(this.fallDistance - 3);
        this.health -= dmg;
        if (this.health < 0) this.health = 0;
        Game.showDamage();
      }
      this.fallDistance = 0;
    } else if (!collidedY && this.vy < 0 && !this.flying) {
      this.fallDistance += oldY - this.y;
    }
    if (collidedY && this.vy > 0) {
      this.vy = 0;
    }
    if (collidedX) this.vx = 0;
    if (collidedZ) this.vz = 0;
    if (collidedY && !this.flying) this.vy = 0;

    // 掉出世界
    if (this.y < -10) {
      this.health = 0;
    }
    // 溺水（头部浸水 15 秒后才开始扣血，给足时间去呼吸）
    let headInWater = this.checkHeadInWater();
    this.swimTime = headInWater ? (this.swimTime || 0) + dt : Math.max(0, (this.swimTime || 0) - dt * 3);
    if (this.swimTime > 15) {
      this.health -= 0.5 * dt; // 慢慢扣血
      Game.showDamage();
    }
  }

  // 射线检测（基于 Amanatides & Woo DDA 算法，可靠找到最近方块）
  // 约定：yaw=0 看向 -Z；pitch 正抬头看天上
  // forward = (-sin(yaw)*cos(pitch), sin(pitch), -cos(yaw)*cos(pitch))
  raycast(maxDist = 6) {
    let dx = -Math.sin(this.yaw) * Math.cos(this.pitch);
    let dy = Math.sin(this.pitch);
    let dz = -Math.cos(this.yaw) * Math.cos(this.pitch);
    let ox = this.x, oy = this.y + this.eyeHeight, oz = this.z;
    // 当前所在的方块坐标
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    // 步进方向（每个轴 +1 / -1 / 0）
    let stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
    let stepY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
    let stepZ = dz > 0 ? 1 : (dz < 0 ? -1 : 0);
    // 到下一个边界的距离（tMaxX = 沿 dx 到下一个 X 边界的距离）
    let tMaxX, tMaxY, tMaxZ, tDeltaX, tDeltaY, tDeltaZ;
    if (stepX !== 0) {
      let nextBX = stepX > 0 ? x + 1 : x;
      tMaxX = (nextBX - ox) / dx;
      tDeltaX = Math.abs(1 / dx);
    } else { tMaxX = Infinity; tDeltaX = Infinity; }
    if (stepY !== 0) {
      let nextBY = stepY > 0 ? y + 1 : y;
      tMaxY = (nextBY - oy) / dy;
      tDeltaY = Math.abs(1 / dy);
    } else { tMaxY = Infinity; tDeltaY = Infinity; }
    if (stepZ !== 0) {
      let nextBZ = stepZ > 0 ? z + 1 : z;
      tMaxZ = (nextBZ - oz) / dz;
      tDeltaZ = Math.abs(1 / dz);
    } else { tMaxZ = Infinity; tDeltaZ = Infinity; }
    // 起点如果落在固体方块里（不应发生，但稳妥处理）
    let startB = this.world.getBlock(x, y, z);
    if (startB !== BLOCK.AIR && startB !== BLOCK.WATER) {
      return { x, y, z, face: [-stepX, -stepY, -stepZ], dist: 0 };
    }
    // DDA 推进
    let t = 0;
    let face = [0, 0, 0];
    while (t < maxDist) {
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          x += stepX; t = tMaxX; tMaxX += tDeltaX; face = [-stepX, 0, 0];
        } else {
          z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = [0, 0, -stepZ];
        }
      } else {
        if (tMaxY < tMaxZ) {
          y += stepY; t = tMaxY; tMaxY += tDeltaY; face = [0, -stepY, 0];
        } else {
          z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = [0, 0, -stepZ];
        }
      }
      let b = this.world.getBlock(x, y, z);
      if (b !== BLOCK.AIR && b !== BLOCK.WATER) {
        return { x, y, z, face, dist: t };
      }
    }
    return null;
  }

  respawn() {
    this.x = 8; this.y = 40; this.z = 8;
    this.vx = this.vy = this.vz = 0;
    this.health = 20;
    this.fallDistance = 0;
    this.flying = false;
  }
}

// ============================================================
// 第八部分：游戏主循环
// ============================================================

const Game = {
  init() {
    this.canvas = document.getElementById("glcanvas");
    this.renderer = new Renderer(this.canvas);
    this.world = new World(Math.random() * 65536 | 0);
    this.player = new Player(this.world);

    // 物品栏
    this.hotbarBlocks = [BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.COBBLE, BLOCK.PLANKS, BLOCK.WOOD, BLOCK.SAND, BLOCK.GLASS, BLOCK.BRICK];
    this.selectedSlot = 0;
    this.buildHotbar();

    this.input = { forward: false, back: false, left: false, right: false, jump: false, shift: false };
    this.paused = false;
    this.dead = false;
    this.mouseLocked = false;
    this.mouseSensitivity = 0.0025;
    this.cameraMode = "first";  // "first" | "third"

    // 灵敏度滑块绑定
    let slider = document.getElementById("sens-slider");
    let sval = document.getElementById("sens-val");
    if (slider) {
      slider.addEventListener("input", () => {
        let pct = parseInt(slider.value);
        sval.textContent = pct;
        // 10% = 0.0005, 50% = 0.0025(默认), 200% = 0.01
        this.mouseSensitivity = 0.0005 + (pct / 100) * 0.0045;
      });
    }
    this.breakingBlock = null;
    this.breakingProgress = 0;
    this.placeCooldown = 0;

    this.setupInput();
    this.onResize();
    window.addEventListener("resize", () => this.onResize());

    // 找到合适的出生点
    this.findSpawnPoint();

    // 白天开始（偏移时间到早晨，cycle ≈ 0.2 太阳已升起）
    this.startTime = performance.now() - 120000;  // 300秒一天，120秒=正午
    this.lastTime = performance.now();
    this.frameCount = 0;
    this.fpsTimer = 0;
    this.fps = 0;

    // 隐藏加载界面
    document.getElementById("loading").style.opacity = "0";
    setTimeout(() => { document.getElementById("loading").style.display = "none"; }, 500);

    requestAnimationFrame((t) => this.loop(t));
  },

  findSpawnPoint() {
    // 先确保出生搜索范围 (64格半径) 的 chunk 已生成
    let preGenR = Math.ceil(64 / CHUNK_SIZE) + 1;
    for (let dx = -preGenR; dx <= preGenR; dx++) {
      for (let dz = -preGenR; dz <= preGenR; dz++) {
        this.world.ensureChunk(dx, dz);
      }
    }
    // 螺旋搜索 — 找一个真正的旱地表面（非水、上方是空气、>= 海平面）
    // 优先搜近处，逐步扩大范围，最远搜 64 格半径
    let found = false;
    for (let r = 0; r < 64 && !found; r++) {
      let count = r * 8 + 1;
      for (let i = 0; i < count && !found; i++) {
        let tx, tz;
        if (r === 0) { tx = 0; tz = 0; }
        else {
          // 沿环形采样
          let angle = (i / count) * Math.PI * 2;
          tx = Math.round(Math.cos(angle) * r * 2);
          tz = Math.round(Math.sin(angle) * r * 2);
        }
        // 从上往下找最高非空气方块
        for (let y = WORLD_HEIGHT - 1; y > 5; y--) {
          let b = this.world.getBlock(tx, y, tz);
          if (b === BLOCK.AIR) continue;
          if (b === BLOCK.WATER) break; // 这列最高是水，跳过
          // 找到固体表面 — 检查上方是不是空气
          if (this.world.getBlock(tx, y + 1, tz) === BLOCK.AIR) {
            console.log('[Spawn] found at', tx, y, tz, 'block=' + BLOCK_NAMES[b]);
            this.player.x = tx + 0.5;
            this.player.y = y + 1; // 站在方块顶上
            this.player.z = tz + 0.5;
            found = true;
            break;
          }
          break;
        }
      }
    }
    if (!found) {
      // 兜底：在高空生成（爽快地落到地上）
      this.player.x = 0.5;
      this.player.y = WORLD_HEIGHT - 5;
      this.player.z = 0.5;
    }
    // 确保出生点正下方有地面（强制生成并检查）
    let sx = Math.floor(this.player.x), sz = Math.floor(this.player.z);
    for (let y = WORLD_HEIGHT - 1; y >= 1; y--) {
      let b = this.world.getBlock(sx, y, sz);
      if (b !== BLOCK.AIR && b !== BLOCK.WATER) {
        this.player.y = y + 1.01; // 精确站在最高方块顶上
        break;
      }
    }
    // 预生成出生点周围区块
    let pcx = Math.floor(this.player.x / CHUNK_SIZE), pcz = Math.floor(this.player.z / CHUNK_SIZE);
    let loadingBar = document.getElementById("loading-bar");
    let loadingText = document.getElementById("loading-text");
    let total = (RENDER_DIST * 2 + 1) ** 2;
    let done = 0;
    for (let dx = -RENDER_DIST; dx <= RENDER_DIST; dx++) {
      for (let dz = -RENDER_DIST; dz <= RENDER_DIST; dz++) {
        let chunk = this.world.ensureChunk(pcx + dx, pcz + dz);
        let mesh = buildChunkMesh(this.world, chunk);
        chunk.glMesh = this.renderer.uploadMesh(mesh);
        chunk.dirty = false;
        done++;
        loadingBar.style.width = (done / total * 100) + "%";
      }
    }
    loadingText.textContent = "世界生成完成！";
  },

  buildHotbar() {
    let hotbar = document.getElementById("hotbar");
    hotbar.innerHTML = "";
    for (let i = 0; i < 9; i++) {
      let slot = document.createElement("div");
      slot.className = "slot" + (i === this.selectedSlot ? " active" : "");
      let bt = this.hotbarBlocks[i];
      // 画方块图标
      let c = document.createElement("canvas");
      c.width = c.height = 40;
      let ctx = c.getContext("2d");
      // 简单等距方块图标
      let colors = BLOCK_COLORS[bt];
      let col = colors[0];
      let r = (col>>16)&0xff, g = (col>>8)&0xff, b = col&0xff;
      // 顶面
      ctx.fillStyle = `rgb(${Math.min(255,r*1.1|0)},${Math.min(255,g*1.1|0)},${Math.min(255,b*1.1|0)})`;
      ctx.beginPath();
      ctx.moveTo(20,4); ctx.lineTo(36,12); ctx.lineTo(20,20); ctx.lineTo(4,12); ctx.closePath(); ctx.fill();
      // 左面
      ctx.fillStyle = `rgb(${r*0.7|0},${g*0.7|0},${b*0.7|0})`;
      ctx.beginPath();
      ctx.moveTo(4,12); ctx.lineTo(20,20); ctx.lineTo(20,36); ctx.lineTo(4,28); ctx.closePath(); ctx.fill();
      // 右面
      ctx.fillStyle = `rgb(${r*0.85|0},${g*0.85|0},${b*0.85|0})`;
      ctx.beginPath();
      ctx.moveTo(36,12); ctx.lineTo(20,20); ctx.lineTo(20,36); ctx.lineTo(36,28); ctx.closePath(); ctx.fill();

      slot.appendChild(c);
      let num = document.createElement("span");
      num.className = "num";
      num.textContent = i + 1;
      slot.appendChild(num);
      if (BLOCK_NAMES[bt]) {
        let name = document.createElement("span");
        name.className = "name";
        name.textContent = BLOCK_NAMES[bt];
        slot.appendChild(name);
      }
      slot.addEventListener("mousedown", (e) => { e.preventDefault(); this.selectSlot(i); });
      hotbar.appendChild(slot);
    }
  },

  selectSlot(i) {
    this.selectedSlot = i;
    document.querySelectorAll("#hotbar .slot").forEach((s, idx) => {
      s.classList.toggle("active", idx === i);
    });
  },

  setupInput() {
    document.addEventListener("keydown", (e) => {
      if (e.code === "KeyW") this.input.forward = true;
      if (e.code === "KeyS") this.input.back = true;
      if (e.code === "KeyA") this.input.left = true;
      if (e.code === "KeyD") this.input.right = true;
      if (e.code === "Space") { this.input.jump = true; e.preventDefault(); }
      if (e.code === "ShiftLeft") this.input.shift = true;
      if (e.code === "Escape") this.togglePause();
      if (e.code === "KeyF") this.player.flying = !this.player.flying;
      if (e.code === "KeyV") this.toggleCameraMode();
      // 数字键选择物品栏
      if (e.code >= "Digit1" && e.code <= "Digit9") {
        this.selectSlot(parseInt(e.code.slice(-1)) - 1);
      }
    });
    document.addEventListener("keyup", (e) => {
      if (e.code === "KeyW") this.input.forward = false;
      if (e.code === "KeyS") this.input.back = false;
      if (e.code === "KeyA") this.input.left = false;
      if (e.code === "KeyD") this.input.right = false;
      if (e.code === "Space") this.input.jump = false;
      if (e.code === "ShiftLeft") this.input.shift = false;
    });

    let canvas = this.canvas;
    canvas.addEventListener("click", () => {
      if (!this.paused) canvas.requestPointerLock();
    });
    document.addEventListener("pointerlockchange", () => {
      this.mouseLocked = document.pointerLockElement === canvas;
    });
    document.addEventListener("mousemove", (e) => {
      if (!this.mouseLocked || this.paused || this.dead) return;
      let sens = this.mouseSensitivity || 0.0025;
      this.player.yaw -= e.movementX * sens;
      this.player.pitch -= e.movementY * sens; // 鼠标下推→俯视→pitch 减（约定 pitch 正=仰视）
      this.player.pitch = Math.max(-Math.PI/2 + 0.01, Math.min(Math.PI/2 - 0.01, this.player.pitch));
      // 保持 yaw 在 0~2π
      if (this.player.yaw < 0) this.player.yaw += Math.PI * 2;
      if (this.player.yaw >= Math.PI * 2) this.player.yaw -= Math.PI * 2;
    });

    // 鼠标按键
    this.mouseLeftDown = false;
    this.mouseRightDown = false;
    document.addEventListener("mousedown", (e) => {
      if (!this.mouseLocked || this.paused || this.dead) return;
      if (e.button === 0) { // 左键破坏
        this.mouseLeftDown = true;
        this.breakingProgress = 0;
      }
      if (e.button === 2) { // 右键放置
        this.mouseRightDown = true;
        this.placeBlock();
        this.placeCooldown = 0.2; // 防连点
      }
    });
    document.addEventListener("mouseup", (e) => {
      if (e.button === 0) {
        this.mouseLeftDown = false;
        this.breakingProgress = 0;
      }
      if (e.button === 2) {
        this.mouseRightDown = false;
      }
    });
    document.addEventListener("contextmenu", (e) => e.preventDefault());

    // 滚轮切物品
    document.addEventListener("wheel", (e) => {
      if (!this.mouseLocked) return;
      if (e.deltaY > 0) this.selectSlot((this.selectedSlot + 1) % 9);
      else this.selectSlot((this.selectedSlot - 1 + 9) % 9);
    });
  },

  placeBlock() {
    let hit = this.player.raycast();
    if (!hit) return;
    let nx = hit.x + hit.face[0], ny = hit.y + hit.face[1], nz = hit.z + hit.face[2];
    let target = this.world.getBlock(nx, ny, nz);
    // 只允许放在空气或水里（替换水）
    if (target !== BLOCK.AIR && target !== BLOCK.WATER) return;
    // 检查不和玩家碰撞箱重叠
    let hw = this.player.width / 2;
    let pMinX = this.player.x - hw, pMaxX = this.player.x + hw;
    let pMinY = this.player.y, pMaxY = this.player.y + this.player.height;
    let pMinZ = this.player.z - hw, pMaxZ = this.player.z + hw;
    if (nx + 1 > pMinX && nx < pMaxX &&
        ny + 1 > pMinY && ny < pMaxY &&
        nz + 1 > pMinZ && nz < pMaxZ) return;
    this.world.setBlock(nx, ny, nz, this.hotbarBlocks[this.selectedSlot]);
  },

  breakBlock() {
    let hit = this.player.raycast();
    if (!hit) return;
    let b = this.world.getBlock(hit.x, hit.y, hit.z);
    if (b === BLOCK.BEDROCK) return;
    this.world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR);
  },

  toggleCameraMode() {
    this.cameraMode = this.cameraMode === "first" ? "third" : "first";
    this.player.thirdPerson = (this.cameraMode === "third");
    console.log("camera: " + this.cameraMode);
  },

  togglePause() {
    this.paused = !this.paused;
    document.getElementById("pause-menu").style.display = this.paused ? "flex" : "none";
    if (this.paused && document.pointerLockElement) document.exitPointerLock();
  },

  resume() { this.togglePause(); },

  respawn() {
    this.player.respawn();
    this.dead = false;
    document.getElementById("death-screen").style.display = "none";
    if (this.paused) this.togglePause();
  },

  save() {
    // 简单 localStorage 存储玩家位置和种子
    try {
      localStorage.setItem("mc_player", JSON.stringify({
        x: this.player.x, y: this.player.y, z: this.player.z,
        yaw: this.player.yaw, pitch: this.player.pitch,
        health: this.player.health
      }));
      localStorage.setItem("mc_seed", this.world.seed);
      alert("世界已保存！\n位置: " + this.player.x.toFixed(1) + ", " + this.player.y.toFixed(1) + ", " + this.player.z.toFixed(1));
    } catch (e) {
      alert("保存失败: " + e.message);
    }
  },

  loadSave() {
    try {
      let p = JSON.parse(localStorage.getItem("mc_player"));
      let seed = parseInt(localStorage.getItem("mc_seed"));
      if (seed) this.world = new World(seed);
      else this.world = new World(Math.random() * 65536 | 0);
      this.player = new Player(this.world);
      if (p) {
        this.player.x = p.x; this.player.y = p.y; this.player.z = p.z;
        this.player.yaw = p.yaw; this.player.pitch = p.pitch;
        this.player.health = p.health || 20;
      }
    } catch (e) {
      console.warn("No save found, starting new world");
    }
  },

  showDamage() {
    let overlay = document.getElementById("damage-overlay");
    overlay.style.opacity = "0.8";
    setTimeout(() => overlay.style.opacity = "0", 200);
  },

  updateHealthBar() {
    let bar = document.getElementById("health-bar");
    if (!bar) return;
    let h = Math.max(0, Math.ceil(this.player.health));
    if (bar.dataset.last === String(h)) return;
    bar.dataset.last = String(h);
    bar.innerHTML = "";
    for (let i = 0; i < 10; i++) {
      let heart = document.createElement("span");
      heart.textContent = i < h ? "❤" : "♡";
      heart.style.fontSize = "18px";
      heart.style.color = i < h ? "#ff4444" : "#444";
      heart.style.textShadow = "1px 1px 2px #000";
      bar.appendChild(heart);
    }
    if (h <= 0) bar.style.display = "none"; else bar.style.display = "flex";
  },

  onResize() {
    this.renderer.resize(window.innerWidth, window.innerHeight);
  },

  loop(now) {
    let dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    let gameTime = (now - this.startTime) / 1000;

    if (!this.paused) {
      if (!this.dead) this.player.update(dt, this.input);

      // 死亡检测
      if (this.player.health <= 0 && !this.dead) {
        this.dead = true;
        console.error('[DEATH] health dropped to 0! y=' + this.player.y + ' fall=' + this.player.fallDistance + ' onGround=' + this.player.onGround + ' inWater=' + this.player.inWater + ' swimTime=' + (this.player.swimTime||0));
        document.getElementById("death-screen").style.display = "flex";
        if (document.pointerLockElement) document.exitPointerLock();
      }

      // 持续左键破坏 — 每帧重新 raycast，跟随视角
      if (this.mouseLeftDown && !this.dead) {
        this.breakingProgress += dt;
        if (this.breakingProgress > 0.35) {
          this.breakBlock();
          this.breakingProgress = 0;
        }
      }
      // 右键长按持续放置（加冷却防止疯狂塞方块）
      if (this.mouseRightDown && !this.dead) {
        this.placeCooldown -= dt;
        if (this.placeCooldown <= 0) {
          this.placeBlock();
          this.placeCooldown = 0.2;
        }
      }

      // 选中方块高亮（render 前设置，render 内画线框）
      if (!this.dead) {
        let hit = this.player.raycast();
        if (hit) this.renderer.selBox = [hit.x, hit.y, hit.z];
      }

      // 渲染
      let stats = this.renderer.render(this.world, this.player, gameTime);

      // 血量条更新
      this.updateHealthBar();

      // HUD 更新
      this.frameCount++;
      this.fpsTimer += dt;
      if (this.fpsTimer >= 0.5) {
        this.fps = Math.round(this.frameCount / this.fpsTimer);
        this.frameCount = 0;
        this.fpsTimer = 0;
      }

      // 方向文字（新约定：yaw=0 北/-Z, π/2 西/-X, π 南/+Z, 3π/2 东/+X）
      let facing = "北";
      let ang = (this.player.yaw % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (ang > Math.PI*1.75 || ang <= Math.PI*0.25) facing = "北";
      else if (ang > Math.PI*0.25 && ang <= Math.PI*0.75) facing = "西";
      else if (ang > Math.PI*0.75 && ang <= Math.PI*1.25) facing = "南";
      else if (ang > Math.PI*1.25 && ang <= Math.PI*1.75) facing = "东";

      document.getElementById("fps-val").textContent = this.fps;
      document.getElementById("coords").textContent = `${this.player.x.toFixed(1)}, ${this.player.y.toFixed(1)}, ${this.player.z.toFixed(1)}`;
      document.getElementById("chunk-info").textContent = stats.renderedChunks + " / " + ((RENDER_DIST*2+1)**2);
      document.getElementById("block-count").textContent = stats.blockCount;
      document.getElementById("facing").textContent = facing;

      // 破坏进度十字准心
      let bp = document.getElementById("break-progress");
      if (this.breakingProgress > 0) {
        let pct = this.breakingProgress / 0.35;
        bp.style.background = `conic-gradient(transparent ${pct * 360}deg, rgba(255,255,255,0.6) ${pct * 360}deg)`;
        bp.style.borderRadius = "50%";
      } else {
        bp.style.background = "";
      }
    }

    requestAnimationFrame((t) => this.loop(t));
  }
};

// 启动
window.addEventListener("load", () => {
  Game.init();
});

