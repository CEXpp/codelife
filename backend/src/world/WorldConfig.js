export const WORLD_WIDTH = 2400;
export const WORLD_HEIGHT = 1600;

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_TICKS = 420; // Full year = 1680 ticks

export const BIOMES = {
  meadow: {
    id: 'meadow',
    name: '晨曦草甸',
    subtitle: '高光充沛 · 甘露丰茂',
    bounds: { x1: 0, y1: 0, x2: 1200, y2: 800 },
    color: '#10b981',
    sunBonus: 0.28,
    tempOffset: 3
  },
  canyon: {
    id: 'canyon',
    name: '晶簇峡谷',
    subtitle: '共鸣晶簇 · 声波协作区',
    bounds: { x1: 1200, y1: 0, x2: 2400, y2: 800 },
    color: '#8b5cf6',
    sunBonus: 0.05,
    tempOffset: -1
  },
  swamp: {
    id: 'swamp',
    name: '孢子沼泽',
    subtitle: '化学色相 · 毒与营养并存',
    bounds: { x1: 0, y1: 800, x2: 1200, y2: 1600 },
    color: '#f59e0b',
    sunBonus: -0.05,
    tempOffset: 1
  },
  vents: {
    id: 'vents',
    name: '深渊热泉',
    subtitle: '恒温避风港 · 寒冬生命绿洲',
    bounds: { x1: 1200, y1: 800, x2: 2400, y2: 1600 },
    color: '#06b6d4',
    sunBonus: -0.1,
    tempOffset: 7
  }
};

export const WORLD_LIMITS = {
  maxPopulation: 76,
  minAutoSeedPopulation: 6,
  maxResources: 165,
  maxStructures: 40,
  maxChronicleEvents: 160,
  maxLineageArchive: 450,
  visionRadius: 230,
  signalRadius: 310,
  memeRadius: 220,
  eatRadius: 28,
  coopRadius: 52,
  shareRadius: 50,
  attackRadius: 30,
  reproMateRadius: 54
};

export function getBiomeAt(x, y) {
  if (x < 1200 && y < 800) return 'meadow';
  if (x >= 1200 && y < 800) return 'canyon';
  if (x < 1200 && y >= 800) return 'swamp';
  return 'vents';
}

export function isHueToxic(hue, toxicCenters) {
  for (const center of toxicCenters) {
    const diff = Math.abs(hue - center);
    if (diff <= 42 || diff >= 318) return true;
  }
  return false;
}

const NAME_SYLLABLES_A = ['曦', '沧', '微', '星', '玄', '青', '汐', '灵', '森', '曜', '幽', '澄', '岚', '苍'];
const NAME_SYLLABLES_B = ['核', '光', '芽', '律', '脉冲', '丝', '晶', '羽', '游', '影', '环', '瞳', '歌', '脉'];

export function generateOrganismName(generation, rng = Math.random) {
  const a = NAME_SYLLABLES_A[Math.floor(rng() * NAME_SYLLABLES_A.length)];
  const b = NAME_SYLLABLES_B[Math.floor(rng() * NAME_SYLLABLES_B.length)];
  return `${a}${b}-${generation}`;
}
