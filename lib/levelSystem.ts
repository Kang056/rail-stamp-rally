// lib/levelSystem.ts — Level & XP calculation for Rail Stamp Rally

export const LEVEL_THRESHOLDS = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66, 78, 91, 105, 120, 136, 153, 171, 190, 210, 231, 253, 276, 300, 325, 351, 398, 426, 455];
// Index 0 = LV1 requires 0 XP, Index 29 = LV30 requires 455 XP
export const MAX_LEVEL = 30;

export const CHECKIN_MILESTONES: { count: number; xp: number }[] = [
  { count: 10, xp: 10 },
  { count: 20, xp: 20 },
  { count: 50, xp: 50 },
  { count: 100, xp: 100 },
  { count: 200, xp: 200 },
  { count: 500, xp: 500 },
];

// Major station names (partial match)
const TRA_MAJOR_STATIONS = ['台北', '板橋', '桃園', '新竹', '苗栗', '台中', '彰化', '嘉義', '台南', '高雄', '基隆', '宜蘭', '花蓮', '台東', '屏東'];

const MRT_MAJOR_KEYWORDS = ['台北車站', '台北101', '板橋', '桃園機場', '高鐵左營', '台中高鐵', '市政府'];

// Terminal station name keywords per system (first/last station of each line)
const TERMINAL_KEYWORDS = ['淡水', '象山', '新店', '小碧潭', '南勢角', '頂埔', '迴龍', '中和', '南港展覽館', '動物園', '木柵', '岡山之路', '大寮', '西子灣', '小港', '鳳山西', '燕巢', '環北', '蘆竹南', '淡海', '安坑', '亞灣', '前鎮之星', '柳原', '高美濕地'];

export type RailwaySystemType = 'TRA' | 'HSR' | 'TRTC' | 'TYMC' | 'KRTC' | 'TMRT' | 'NTMC' | 'KLRT';

function isMrtSystem(system: RailwaySystemType): boolean {
  return ['TRTC', 'TYMC', 'KRTC', 'TMRT', 'NTMC'].includes(system);
}

function isLrtSystem(system: RailwaySystemType): boolean {
  return system === 'KLRT';
}

function isMajorStation(stationName: string, system: RailwaySystemType): boolean {
  if (system === 'TRA') {
    return TRA_MAJOR_STATIONS.some(k => stationName.includes(k));
  }
  if (isMrtSystem(system) || isLrtSystem(system)) {
    return MRT_MAJOR_KEYWORDS.some(k => stationName.includes(k));
  }
  return false;
}

function isTerminalStation(stationName: string): boolean {
  return TERMINAL_KEYWORDS.some(k => stationName.includes(k));
}

export function getStationXp(stationName: string, system: RailwaySystemType): number {
  if (system === 'HSR') return 3;

  if (system === 'TRA') {
    return isMajorStation(stationName, system) ? 3 : 1;
  }

  if (isMrtSystem(system) || isLrtSystem(system)) {
    if (isMajorStation(stationName, system)) return 3;
    if (isTerminalStation(stationName)) return 2;
    return 1;
  }

  return 1;
}

export function getMilestoneXp(checkinCount: number): number {
  return CHECKIN_MILESTONES
    .filter(m => checkinCount >= m.count)
    .reduce((sum, m) => sum + m.xp, 0);
}

export function calculateTotalXp(
  collectedBadgesMap: Map<string, { unlocked_at: string; badge_image_url: string | null }>,
  geojson: any,
  checkinCount: number
): number {
  let xp = 0;

  if (geojson) {
    geojson.features.forEach((f: any) => {
      if (f.properties.feature_type === 'station') {
        const stationId = f.properties.station_id as string;
        if (collectedBadgesMap.has(stationId)) {
          xp += getStationXp(f.properties.station_name, f.properties.system_type);
        }
      }
    });
  }

  xp += getMilestoneXp(checkinCount);

  return xp;
}

export interface LevelInfo {
  level: number;
  currentXp: number;
  nextLevelXp: number;
  progressPercent: number;
  isMax: boolean;
  /** XP earned within the current level (0 → rangeXp) */
  earnedInLevel: number;
  /** Total XP span for the current level */
  rangeXp: number;
}

export function getLevelInfo(totalXp: number): LevelInfo {
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }

  if (level >= MAX_LEVEL) {
    return {
      level: MAX_LEVEL,
      currentXp: totalXp,
      nextLevelXp: LEVEL_THRESHOLDS[MAX_LEVEL - 1],
      progressPercent: 100,
      isMax: true,
      earnedInLevel: totalXp - LEVEL_THRESHOLDS[MAX_LEVEL - 1],
      rangeXp: 0,
    };
  }

  const currentLevelXp = LEVEL_THRESHOLDS[level - 1];
  const nextLevelXp = LEVEL_THRESHOLDS[level];
  const rangeXp = nextLevelXp - currentLevelXp;
  const earnedInLevel = totalXp - currentLevelXp;
  const progressPercent = Math.min(100, Math.round((earnedInLevel / rangeXp) * 100));

  return {
    level,
    currentXp: totalXp,
    nextLevelXp,
    progressPercent,
    isMax: false,
    earnedInLevel,
    rangeXp,
  };
}
