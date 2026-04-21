const TDX_BASE = 'https://tdx.transportdata.tw/api/basic';

/** Strip any prefix (e.g. 'TRA-') and return numeric station code only */
export const sanitizeStationId = (id: string): string => {
  if (!id) return '';
  const m = String(id).match(/(\d+)$/);
  return m ? m[1] : id;
};

export interface TrainDelayItem {
  TrainNo: string;
  DelayTime: number; // minutes; 0 = on time
}

export interface LiveBoardItem {
  TrainNo: string;
  Direction: 0 | 1; // 0=northbound 北上, 1=southbound 南下
  TrainTypeCode: string;
  TrainTypeName: { Zh_tw: string; En: string };
  ScheduledArrivalTime: string;
  ScheduledDepartureTime: string;
  DelayTime: number;
  DestinationStationName: { Zh_tw: string; En: string };
}

/** Fetch all current live train delays → Map of TrainNo → DelayTime (minutes) */
export async function fetchLiveTrainDelay(): Promise<Map<string, number>> {
  const url = `${TDX_BASE}/v2/Rail/TRA/LiveTrainDelay?$format=JSON`;
  const map = new Map<string, number>();
  try {
    const resp = await fetch(url);
    if (!resp.ok) return map;
    const data = await resp.json();
    const items: TrainDelayItem[] = Array.isArray(data)
      ? data
      : (data?.TrainLiveDelays ?? []);
    items.forEach((item) => {
      if (item.TrainNo != null) {
        map.set(String(item.TrainNo), typeof item.DelayTime === 'number' ? item.DelayTime : 0);
      }
    });
  } catch {
    // Live delay is optional; never block schedule results
  }
  return map;
}

/** Fetch 30-min live board for a specific station */
export async function fetchStationLiveBoard(stationId: string): Promise<LiveBoardItem[]> {
  const code = sanitizeStationId(stationId);
  if (!code) return [];
  const url = `${TDX_BASE}/v2/Rail/TRA/LiveBoard/Station/${code}?$format=JSON`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json();
    return Array.isArray(data) ? data : (data?.TrainLiveBoards ?? []);
  } catch {
    return [];
  }
}
