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
  DestinationStationName?: { Zh_tw: string; En: string };
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

// ─────────────────────────────────────────────────────────────────────────────
// HSR (高鐵) Schedule
// ─────────────────────────────────────────────────────────────────────────────

export interface HsrTrainResult {
  trainNo: string;
  departureTime: string;
  arrivalTime: string;
  travelTime: string;
  standardFare?: number; // 自由座成人票
}

async function queryHsrFare(originId: string, destId: string): Promise<number | undefined> {
  const url = `${TDX_BASE}/v2/Rail/THSR/ODFare/${originId}/to/${destId}?$format=JSON`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return undefined;
    const data = await resp.json();
    const fares: any[] = Array.isArray(data) ? data.flatMap((d: any) => d.Fares ?? []) : [];
    // CabinClass=1 自由座, TicketType=1 成人, FareClass=1 全票
    const found = fares.find((f: any) => f.CabinClass === 1 && f.TicketType === 1 && f.FareClass === 1);
    return found?.Price;
  } catch {
    return undefined;
  }
}

export async function queryHsrODSchedule(
  originId: string,
  destId: string,
  date: string,
): Promise<HsrTrainResult[]> {
  const safeOrigin = sanitizeStationId(originId);
  const safeDest = sanitizeStationId(destId);
  const [scheduleResp, fare] = await Promise.all([
    fetch(
      `${TDX_BASE}/v2/Rail/THSR/DailyTimetable/OD/${safeOrigin}/to/${safeDest}/${date}?$format=JSON`,
    ),
    queryHsrFare(safeOrigin, safeDest),
  ]);

  if (!scheduleResp.ok) {
    throw new Error(`TDX API 回應錯誤: ${scheduleResp.status}`);
  }

  const data = await scheduleResp.json();
  const items: any[] = Array.isArray(data) ? data : [];

  return items.map((item: any) => {
    const trainNo = item.DailyTrainInfo?.TrainNo ?? '';
    const depTime = item.OriginStopTime?.DepartureTime ?? '';
    const arrTime = item.DestinationStopTime?.ArrivalTime ?? '';

    let travelTime = '';
    if (depTime && arrTime) {
      const [dh, dm] = depTime.split(':').map(Number);
      const [ah, am] = arrTime.split(':').map(Number);
      let diffMin = ah * 60 + am - (dh * 60 + dm);
      if (diffMin < 0) diffMin += 24 * 60;
      if (diffMin > 0) {
        const h = Math.floor(diffMin / 60);
        const m = diffMin % 60;
        travelTime = h > 0 ? `${h}時${m}分` : `${m}分`;
      }
    }

    return { trainNo, departureTime: depTime, arrivalTime: arrTime, travelTime, standardFare: fare };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Metro (捷運) Service Info
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip Metro operator prefix from station ID.
 * e.g. 'TRTC-BL01' → 'BL01', 'KRTC-R01' → 'R01'
 */
export function sanitizeMetroId(id: string): string {
  const m = id.match(/^[A-Z]+-(.+)$/);
  return m ? m[1] : id;
}

export interface MetroServiceItem {
  lineNo: string;
  tripHeadSign: string;
  firstTrainTime: string;
  lastTrainTime: string;
  peakHeadwayMins?: number;
  offPeakHeadwayMins?: number;
}

export interface MetroQueryResult {
  fare?: number;
  travelDistance?: number;
  originServices: MetroServiceItem[];
}

export async function queryMetroServiceInfo(
  operatorId: string,
  originRawId: string,
  destRawId?: string,
): Promise<MetroQueryResult> {
  const originId = sanitizeMetroId(originRawId);
  const destId = destRawId ? sanitizeMetroId(destRawId) : undefined;

  const firstLastUrl =
    `${TDX_BASE}/v2/Rail/Metro/FirstLastTimetable/${operatorId}` +
    `?$filter=StationID eq '${encodeURIComponent(originId)}'&$format=JSON`;

  const fareUrl = destId
    ? `${TDX_BASE}/v2/Rail/Metro/ODFare/${operatorId}` +
      `?$filter=OriginStationID eq '${encodeURIComponent(originId)}' and DestinationStationID eq '${encodeURIComponent(destId)}'&$format=JSON`
    : null;

  const [firstLastResp, fareResp] = await Promise.all([
    fetch(firstLastUrl),
    fareUrl ? fetch(fareUrl) : Promise.resolve(null),
  ]);

  if (!firstLastResp.ok) {
    throw new Error(`TDX API 回應錯誤: ${firstLastResp.status}`);
  }

  const firstLastData = await firstLastResp.json();
  const items: any[] = Array.isArray(firstLastData) ? firstLastData : [];

  // Unique line numbers from results
  const lineNos = [...new Set(items.map((i: any) => i.LineNo as string))];

  // Fetch frequency for each line in parallel
  const freqResults = await Promise.all(
    lineNos.map((lineNo) =>
      fetch(
        `${TDX_BASE}/v2/Rail/Metro/Frequency/${operatorId}` +
          `?$filter=LineNo eq '${encodeURIComponent(lineNo)}'&$format=JSON`,
      )
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ),
  );

  const freqByLine = new Map<string, any[]>();
  lineNos.forEach((lineNo, i) => {
    freqByLine.set(lineNo, Array.isArray(freqResults[i]) ? freqResults[i] : []);
  });

  // Build service items
  const todayWeekday = new Date().getDay(); // 0=Sun, 6=Sat
  const isWeekend = todayWeekday === 0 || todayWeekday === 6;

  const originServices: MetroServiceItem[] = items.map((item: any) => {
    const lineNo = item.LineNo as string;
    const freqItems = freqByLine.get(lineNo) ?? [];

    const relevantFreq =
      freqItems.find((f: any) => {
        const svc = f.ServiceDay;
        if (!svc) return true;
        return isWeekend ? svc.Saturday === true || svc.Sunday === true : svc.Monday === true;
      }) ?? freqItems[0];

    const headways: any[] = relevantFreq?.Headways ?? [];
    const peakHw = headways.find((h: any) => h.PeakFlag === '1' || h.PeakFlag === 1);
    const offPeakHw = headways.find((h: any) => h.PeakFlag === '0' || h.PeakFlag === 0);

    return {
      lineNo,
      tripHeadSign: item.TripHeadSign ?? '',
      firstTrainTime: item.FirstTrainTime ?? '',
      lastTrainTime: item.LastTrainTime ?? '',
      peakHeadwayMins: peakHw
        ? Math.round((peakHw.MinHeadwayMins + peakHw.MaxHeadwayMins) / 2)
        : undefined,
      offPeakHeadwayMins: offPeakHw
        ? Math.round((offPeakHw.MinHeadwayMins + offPeakHw.MaxHeadwayMins) / 2)
        : undefined,
    };
  });

  // Parse fare
  let fare: number | undefined;
  let travelDistance: number | undefined;
  if (fareResp) {
    try {
      const fareData = await fareResp.json();
      const fareItems: any[] = Array.isArray(fareData) ? fareData : [];
      if (fareItems.length > 0) {
        travelDistance = fareItems[0]?.TravelDistance;
        const fares: any[] = fareItems[0]?.Fares ?? [];
        const adultFare = fares.find((f: any) => f.TicketType === 1 && f.FareClass === 1);
        fare = adultFare?.Price;
      }
    } catch {
      // Fare is optional
    }
  }

  return { fare, travelDistance, originServices };
}

// ─────────────────────────────────────────────────────────────────────────────
// THSR Station Board (today's schedule at one station)
// ─────────────────────────────────────────────────────────────────────────────

export interface HsrStationStop {
  trainNo: string;
  departureTime: string; // HH:mm
  direction: number;     // 0 = southbound 南下, 1 = northbound 北上
  endingStationName: string;
}

export async function fetchHsrStationBoard(stationId: string): Promise<HsrStationStop[]> {
  const safeId = sanitizeStationId(stationId);
  if (!safeId) return [];

  const url = `${TDX_BASE}/v2/Rail/THSR/DailyTimetable/Today?$format=JSON`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json();
    const trains: any[] = Array.isArray(data) ? data : [];

    const now = new Date();
    const windowStart = now.getHours() * 60 + now.getMinutes() - 10; // include trains 10 min ago

    const result: HsrStationStop[] = [];
    for (const train of trains) {
      const stopTimes: any[] = train.StopTimes ?? [];
      const stop = stopTimes.find((s: any) => String(s.StationID) === safeId);
      if (!stop) continue;
      const depTime: string = stop.DepartureTime ?? stop.ArrivalTime ?? '';
      if (!depTime) continue;
      const [h, m] = depTime.split(':').map(Number);
      if (h * 60 + m < windowStart) continue;
      result.push({
        trainNo: train.DailyTrainInfo?.TrainNo ?? '',
        departureTime: depTime,
        direction: train.DailyTrainInfo?.Direction ?? 0,
        endingStationName: train.DailyTrainInfo?.EndingStationName?.Zh_tw ?? '',
      });
    }

    return result
      .sort((a, b) => a.departureTime.localeCompare(b.departureTime))
      .slice(0, 20);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Metro Live Board (real-time next-train ETAs at one station)
// ─────────────────────────────────────────────────────────────────────────────

export interface MetroLiveBoardItem {
  lineId: string;
  destinationName: string;
  estimatedSeconds: number; // seconds until arrival; -1 = unavailable
  direction: number;        // 0 or 1
}

export async function fetchMetroLiveBoard(
  operatorId: string,
  stationUID: string,
): Promise<MetroLiveBoardItem[]> {
  // stationUID e.g. 'TRTC-BL01' — use directly in OData filter
  const url =
    `${TDX_BASE}/v2/Rail/Metro/LiveBoard/${operatorId}` +
    `?$filter=StationUID eq '${stationUID}'&$format=JSON`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json();
    const items: any[] = Array.isArray(data) ? data : [];
    return items
      .map((item: any) => ({
        lineId: item.LineID ?? item.LineNo ?? '',
        destinationName: item.DestinationName?.Zh_tw ?? item.DestinationName ?? '',
        estimatedSeconds:
          typeof item.EstimatedTime === 'number' ? item.EstimatedTime : -1,
        direction: item.Direction ?? 0,
      }))
      .filter((item) => item.estimatedSeconds >= 0)
      .sort((a, b) => a.estimatedSeconds - b.estimatedSeconds);
  } catch {
    return [];
  }
}

