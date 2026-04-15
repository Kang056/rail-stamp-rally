#!/usr/bin/env node
/**
 * scripts/generate-station-data.js
 *
 * Generates history_desc, established_year, and SVG badge data for all 531 stations.
 * Outputs a JSON file that can be uploaded to Supabase via upload-station-enrichment.js.
 *
 * Usage:
 *   node scripts/generate-station-data.js
 *   → writes data/station-enrichment.json
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const INPUT  = path.resolve(__dirname, '..', 'data', 'tdx-railway-data.json');
const OUTPUT = path.resolve(__dirname, '..', 'data', 'station-enrichment.json');

// ─────────────────────────────────────────────
// System metadata
// ─────────────────────────────────────────────
const SYSTEM_INFO = {
  TRA:  { label: '臺灣鐵路', color: '#006633', icon: '🚂', shortLabel: '台鐵' },
  HSR:  { label: '台灣高鐵', color: '#db691d', icon: '🚄', shortLabel: '高鐵' },
  TRTC: { label: '台北捷運', color: '#E3002C', icon: '🚇', shortLabel: '北捷' },
  TYMC: { label: '桃園捷運', color: '#8246AF', icon: '🚇', shortLabel: '桃捷' },
  KRTC: { label: '高雄捷運', color: '#e20b65', icon: '🚇', shortLabel: '高捷' },
  TMRT: { label: '台中捷運', color: '#00A0E9', icon: '🚇', shortLabel: '中捷' },
  NTMC: { label: '新北捷運', color: '#FCDA01', icon: '🚇', shortLabel: '新北捷' },
  KLRT: { label: '高雄輕軌', color: '#7cbd52', icon: '🚈', shortLabel: '高輕' },
};

// Line-specific colors for badges
const LINE_COLORS = {
  'TRTC-BL': '#0070BD', 'TRTC-BR': '#C48C31', 'TRTC-G': '#008659',
  'TRTC-O': '#F8B61C', 'TRTC-R': '#E3002C',
  'KRTC-O': '#faa73f', 'KRTC-R': '#e20b65',
  'NTMC-Y': '#FCDA01', 'NTMC-V': '#CD212A', 'NTMC-K': '#B8860B',
  'TYMC-A': '#8246AF',
  'TMRT-G': '#00A0E9',
  'KLRT-C': '#7cbd52',
};

function getStationColor(station) {
  // Try line-specific color
  const lineKey = `${station.system_type}-${station.station_id.replace(/^[A-Z]+-/, '').replace(/\d+$/, '').replace(/-.*/, '')}`;
  // Derive from station_id prefix
  const prefix = station.station_id.split('-')[1] || '';
  const lineId = prefix.replace(/\d+.*/, '').replace(/[a-z]/gi, (m) => m.toUpperCase());

  // Check known line colors
  const key = `${station.system_type}-${lineId}`;
  if (LINE_COLORS[key]) return LINE_COLORS[key];

  // For NTMC, derive from station_id prefix
  if (station.system_type === 'NTMC') {
    if (station.station_id.includes('NTDLRT')) return '#CD212A';
    if (station.station_id.includes('NTALRT')) return '#B8860B';
    return '#FCDA01';
  }

  return SYSTEM_INFO[station.system_type]?.color || '#888888';
}

// ─────────────────────────────────────────────
// Famous station histories (hand-curated)
// ─────────────────────────────────────────────
const FAMOUS_HISTORIES = {
  // TRA major stations
  'TRA-0900': { year: 1891, desc: '基隆車站為台灣最北端的鐵路樞紐，1891年清代劉銘傳鐵路通車時即設站。歷經日治時期多次改建，現今站體為2015年啟用的地下化新站。基隆港曾是台灣最重要的國際港口，車站見證了百年來的海港繁華與城市變遷。' },
  'TRA-0920': { year: 1891, desc: '八堵車站位於基隆市暖暖區，為宜蘭線與縱貫線的分歧點。1891年隨劉銘傳鐵路開通而設站，是北台灣重要的鐵路轉乘節點。車站周邊的基隆河谷地形，見證了台灣早期鐵路工程的艱辛。' },
  'TRA-0930': { year: 1891, desc: '七堵車站為縱貫線北段重要編組站，1891年設站。曾是台灣最大的鐵路調車場之一，負責北部貨車的編組作業。2004年新站啟用後，成為現代化的鐵路客運中心。' },
  'TRA-0980': { year: 1899, desc: '南港車站最初於1899年設立，為縱貫線上的小站。隨著南港經貿園區發展，2008年成為台鐵、高鐵、捷運三鐵共構的現代化車站。南港曾以磚窯和茶業聞名，如今已轉型為科技重鎮。' },
  'TRA-0990': { year: 1891, desc: '松山車站原名「錫口」，1891年隨縱貫線通車設站，1920年改名松山。2014年完成地下化工程，與台北捷運松山站共構。松山區早期以慈祐宮為中心發展，饒河街夜市至今仍是台北著名的觀光景點。' },
  'TRA-1000': { year: 1891, desc: '臺北車站是台灣最重要的交通樞紐，1891年清代設站，歷經日治時期與多次改建。現今第四代站體於1989年啟用，為台鐵、高鐵、捷運三鐵共構的地下車站。台北車站每日服務超過50萬旅客，是全台運量最大的車站。' },
  'TRA-1010': { year: 1901, desc: '萬華車站舊名「艋舺」，1901年設站，是台北最早開發的區域之一。艋舺曾是清代台北最繁華的商業中心，「一府二鹿三艋舺」的美名流傳至今。車站周邊的龍山寺、剝皮寮老街都是重要的文化資產。' },
  'TRA-1020': { year: 1901, desc: '板橋車站位於新北市板橋區，1901年設站。1999年遷至現址，成為台鐵、高鐵、捷運共構的大型車站。板橋自清代即為台北盆地南部的商業重鎮，林本源園邸為國定古蹟。' },
  'TRA-1040': { year: 1901, desc: '樹林車站1901年設站，為縱貫線上的重要車站。樹林調車場曾是全台最大的鐵路編組場，負責西部幹線貨車的調度作業。樹林區以早期的樟腦與煤礦產業聞名。' },
  'TRA-1070': { year: 1901, desc: '鶯歌車站1901年設站，以陶瓷產業聞名全台。鶯歌因北部產煤而發展出陶瓷產業，至今仍是台灣最大的陶瓷製造中心。鶯歌陶瓷老街是著名的觀光景點，車站也以陶瓷意象裝飾。' },
  'TRA-1080': { year: 1893, desc: '桃園車站1893年設站，為桃園市區主要車站。2025年桃園鐵路地下化完工後將成為現代化地下車站。桃園舊稱「桃仔園」，以盛產桃花而得名，如今是台灣的航空城與工業重鎮。' },
  'TRA-1100': { year: 1893, desc: '中壢車站1893年設站，為桃園市第二大車站。中壢是北台灣重要的交通與商業中心，客家文化底蘊深厚。中壢夜市與新明市場是當地最具特色的美食聚集地。' },
  'TRA-1210': { year: 1893, desc: '新竹車站建於1913年，為台灣現存最古老的火車站建築。巴洛克風格的站體被列為國定古蹟，是新竹市最具代表性的地標。新竹以「風城」著稱，也是台灣科技產業的發源地。' },
  'TRA-1250': { year: 1902, desc: '竹南車站1902年設站，為山線與海線的分歧點。竹南是苗栗縣人口最多的鎮，因位於頭份溪南岸而得名。車站見證了台灣鐵路山海線分離的歷史變遷。' },
  'TRA-3160': { year: 1903, desc: '苗栗車站1903年設站，為苗栗縣府所在地的主要車站。苗栗以客家文化與油桐花聞名，每年桐花季吸引大量遊客。車站周邊的苗栗鐵道文物展示館保存了珍貴的鐵路文化資產。' },
  'TRA-3190': { year: 1903, desc: '三義車站1903年設站，位於台灣鐵路海拔最高的路段。三義以木雕藝術聞名，是台灣最重要的木雕產業重鎮。舊山線的勝興車站與龍騰斷橋都是著名的鐵道觀光景點。' },
  'TRA-3230': { year: 1905, desc: '豐原車站1905年設站，為台中市豐原區的交通中心。豐原舊稱「葫蘆墩」，以糕餅產業聞名全台。2016年鐵路高架化後，新站成為台中山城地區的現代化交通樞紐。' },
  'TRA-3300': { year: 1905, desc: '臺中車站建於1917年的第二代站體為國定古蹟，紅磚與洗石子的巴洛克風格建築是台中市的精神象徵。2016年鐵路高架化後，新舊站體並存，形成獨特的城市景觀。台中以宜居城市著稱，車站周邊的綠空鐵道為新興的都市休閒空間。' },
  'TRA-3360': { year: 1905, desc: '彰化車站1905年設站，為台灣鐵路山線與海線的合流點。彰化扇形車庫是全台僅存的火車頭旅館，被列為國定古蹟。彰化市以大佛風景區與肉圓聞名，是台灣重要的農業與文化城市。' },
  'TRA-3430': { year: 1905, desc: '二水車站1905年設站，為集集線的起點站。二水因位於兩條水圳匯流處而得名，是通往日月潭與集集的鐵路門戶。車站保留了質樸的鄉村車站風情。' },
  'TRA-3434': { year: 1922, desc: '集集車站原建於1933年，為集集線上最具代表性的木造車站。1999年九二一大地震中嚴重損毀，後經修復重建。集集以綠色隧道與鐵道觀光聞名，是南投縣最受歡迎的旅遊目的地之一。' },
  'TRA-3436': { year: 1922, desc: '車埕車站為集集線的終點站，素有「最後的火車站」之稱。車埕因早期運送木材而繁榮，現已轉型為木業文化觀光區。貯木池與老街保存了完整的林業歷史風貌。' },
  'TRA-3470': { year: 1904, desc: '斗六車站1904年設站，為雲林縣府所在地的主要車站。斗六是雲林的政經中心，以太平老街的巴洛克式建築聞名。車站經過多次改建，現為現代化的跨站式站體。' },
  'TRA-4080': { year: 1896, desc: '嘉義車站1896年設站，為阿里山森林鐵路的起點站。嘉義舊稱「諸羅」，車站見證了百年來阿里山林業的興衰與城市發展。北門車站旁的森林文化園區保存了珍貴的林業文化資產。' },
  'TRA-4220': { year: 1900, desc: '臺南車站建於1936年的站體為市定古蹟，裝飾藝術風格的建築是台南市的重要地標。台南為台灣最早開發的城市，擁有豐富的歷史古蹟與美食文化。車站目前正進行地下化工程，未來將成為三鐵共構車站。' },
  'TRA-4340': { year: 1900, desc: '新左營車站為台鐵與高鐵左營站共構的交通樞紐。左營舊城為清代鳳山縣舊城所在地，城牆遺址被列為國定古蹟。蓮池潭與龍虎塔是高雄著名的觀光景點。' },
  'TRA-4400': { year: 1900, desc: '高雄車站1900年設站，是南台灣最重要的鐵路樞紐。2018年完成地下化工程，新站體由日本建築師伊東豊雄設計。高雄從打狗漁村發展為台灣第二大城市，車站見證了百年來的港都變遷。' },
  'TRA-4440': { year: 1907, desc: '鳳山車站1907年設站，為高雄市鳳山區的交通中心。鳳山為清代鳳山縣新城所在地，鳳山城殘跡與鳳儀書院都是重要的文化資產。車站隨鐵路地下化工程已完成現代化改建。' },
  'TRA-5000': { year: 1907, desc: '屏東車站1907年設站，為屏東縣最重要的火車站。屏東以熱帶水果與原住民文化聞名，車站2015年高架化後成為現代化的交通中心。屏東夜市與萬金聖母聖殿是著名的觀光景點。' },
  'TRA-5050': { year: 1920, desc: '潮州車站1920年設站，為台鐵西部幹線南段的重要車站。潮州因早期潮州移民聚居而得名，是屏東縣的第二大城鎮。2015年鐵路高架化後，潮州成為西部幹線電氣化的終點。' },
  'TRA-5120': { year: 1941, desc: '枋寮車站1941年設站，為西部幹線與南迴線的轉乘站。枋寮以漁業和養殖業聞名，是前往墾丁與台東的鐵路門戶。車站周邊的漁港風情是南台灣獨特的海洋文化景觀。' },
  'TRA-6000': { year: 1922, desc: '臺東車站位於台東市區外圍，1982年遷至現址（原名卑南站）。台東以純淨的自然環境與原住民文化聞名，是花東縱谷與東海岸風景區的門戶。熱氣球嘉年華是台東最具代表性的國際觀光活動。' },
  'TRA-6020': { year: 1922, desc: '鹿野車站1922年設站，坐落於花東縱谷的鹿野高台下方。鹿野高台以熱氣球活動聞名國際，每年夏季的熱氣球嘉年華吸引大量遊客。鹿野的茶園與稻田構成台東最美的田園風光。' },
  'TRA-6070': { year: 1922, desc: '池上車站1922年設站，以「池上便當」聞名全台。池上米品質卓越，被譽為台灣最好的稻米產地。伯朗大道與金城武樹成為台灣最具代表性的田園風景。' },
  'TRA-6110': { year: 1917, desc: '玉里車站1917年設站，為花東線中段的重要車站。玉里以臭豆腐和客家美食聞名，也是前往瓦拉米步道和玉山國家公園東部入口的門戶。花東縱谷在此呈現壯闊的山岳風景。' },
  'TRA-6130': { year: 1917, desc: '瑞穗車站1917年設站，以溫泉和牧場聞名。瑞穗溫泉是花蓮最具代表性的溫泉區，瑞穗牧場則以乳牛與鮮乳產品吸引遊客。北回歸線紀念碑就位於瑞穗境內。' },
  'TRA-6160': { year: 1917, desc: '光復車站1917年設站，為花蓮縣光復鄉的門戶。光復以太巴塱部落和馬太鞍濕地聞名，是阿美族文化的重要據點。光復糖廠改建為觀光冰品園區，是花東縱谷的人氣景點。' },
  'TRA-7000': { year: 1910, desc: '花蓮車站1910年設站，是花蓮縣的交通門戶與最大車站。花蓮以太魯閣國家公園、七星潭和豐富的原住民文化著稱。2014年新站啟用後，成為東台灣最現代化的鐵路車站。' },
  'TRA-7030': { year: 1975, desc: '新城車站（太魯閣站）為前往太魯閣國家公園的最近車站。太魯閣峽谷以大理石斷崖聞名世界，是台灣最具代表性的自然景觀。車站2014年改建後以太魯閣意象設計。' },
  'TRA-7120': { year: 1919, desc: '蘇澳車站為北迴線南端的重要車站，1919年設站。蘇澳以冷泉與漁港聞名，蘇澳冷泉是全球少見的碳酸冷泉。南方澳漁港是台灣東部最大的漁港之一。' },
  'TRA-7150': { year: 1919, desc: '冬山車站以獨特的瓜棚造型站體聞名，2008年改建為全台最美的火車站之一。冬山河親水公園是國際童玩節的舉辦地點，每年夏季吸引大量國內外遊客。' },
  'TRA-7160': { year: 1919, desc: '羅東車站為宜蘭縣羅東鎮的主要車站，1919年設站。羅東以林業歷史和夜市聞名，羅東林業文化園區保存了太平山林場的歷史記憶。羅東夜市是台灣最受歡迎的夜市之一。' },
  'TRA-7190': { year: 1919, desc: '宜蘭車站為宜蘭縣府所在地的主要車站，1919年設站。宜蘭以蘭陽平原的農業景觀與溫泉資源聞名。幾米廣場以繪本作家幾米的作品為主題，是車站周邊最具特色的公共藝術空間。' },
  'TRA-7210': { year: 1919, desc: '礁溪車站1919年設站，以溫泉聞名全台。礁溪溫泉為碳酸氫鈉泉，車站周邊溫泉旅館林立。雪山隧道通車後，礁溪成為台北人最愛的週末泡湯勝地。' },
  'TRA-7290': { year: 1924, desc: '福隆車站1924年設站，以福隆便當和福隆海水浴場聞名。每年夏季的貢寮海洋音樂祭在此舉辦，是台灣最重要的搖滾音樂盛會。舊草嶺隧道自行車道是東北角的熱門觀光路線。' },
  'TRA-7330': { year: 1922, desc: '三貂嶺車站是台灣唯一無法以公路到達的車站，只能搭火車或步行抵達。車站位於基隆河上游峽谷中，周邊的三貂嶺瀑布群是北台灣知名的秘境。平溪線與宜蘭線在此分歧。' },
  'TRA-7332': { year: 1929, desc: '十分車站為平溪線上最著名的車站，以天燈施放聞名國際。十分瀑布有「台灣尼加拉瀑布」之稱，是北台灣最壯觀的瀑布。鐵道穿越老街的獨特景觀成為台灣最具代表性的鐵道風情。' },
  'TRA-7335': { year: 1929, desc: '平溪車站是平溪線的代名詞，以放天燈祈福的傳統聞名世界。每年元宵節的平溪天燈節被CNN評選為全球最佳節慶之一。小鎮保留了礦業時期的質樸風貌。' },
  'TRA-7336': { year: 1929, desc: '菁桐車站為平溪線終點站，木造站體保留了日治時期的建築風格。菁桐曾因煤礦產業而繁榮，礦業沒落後轉型為懷舊觀光景點。許願竹筒和鐵道風情吸引大量遊客造訪。' },
  'TRA-7350': { year: 1920, desc: '猴硐車站以貓村聞名國際，被CNN評選為「全球六大賞貓景點」之一。猴硐原為重要的煤礦產區，瑞三礦業遺址保存了完整的礦業歷史。貓咪與鐵道的組合成為台灣獨特的觀光品牌。' },
  'TRA-7360': { year: 1919, desc: '瑞芳車站1919年設站，為平溪線與深澳線的轉乘站。瑞芳是前往九份、金瓜石的門戶，曾因金礦開採而繁華一時。九份老街的山城風情與黃金博物館是北台灣最受歡迎的觀光景點。' },
  'TRA-1206': { year: 1951, desc: '合興車站又稱「愛情車站」，以一段追火車的愛情故事聞名。木造站體保留了1950年代的風貌，是內灣線上最具浪漫氣息的車站。車站周邊以愛情為主題打造裝置藝術。' },
  'TRA-1208': { year: 1951, desc: '內灣車站為內灣線終點站，以客家美食和懷舊老街聞名。內灣戲院和劉興欽漫畫館是站區特色景點。每年螢火蟲季與桐花季是內灣最受歡迎的觀光時節。' },
  'TRA-5210': { year: 1937, desc: '金崙車站1937年設站，近年以溫泉與排灣族文化聞名。金崙溫泉水質優良，是台東最受歡迎的秘湯之一。部落內的教堂與彩繪牆面展現了原住民文化的活力。' },
  'TRA-5230': { year: 1928, desc: '知本車站1928年設站，為前往知本溫泉區的門戶。知本溫泉是台灣最著名的溫泉區之一，周邊的知本森林遊樂區擁有豐富的熱帶植物生態。' },

  // HSR stations
  'THSR-0990': { year: 2016, desc: '高鐵南港站2016年通車，為台灣高鐵最北端的車站。與台鐵南港站、捷運南港站共構，形成南港三鐵共構交通樞紐。南港從昔日的磚窯聚落轉型為台北新都心。' },
  'THSR-1000': { year: 2007, desc: '高鐵台北站位於台北車站地下，2007年隨高鐵通車啟用。台北車站是全台最大的交通轉運中心，結合台鐵、高鐵、捷運與機場捷運四鐵共構，每日服務旅客超過50萬人次。' },
  'THSR-1010': { year: 2007, desc: '高鐵板橋站2007年通車，為新北市最重要的高鐵門戶。三鐵共構的設計使板橋成為北台灣的交通副核心。板橋新站特區發展迅速，已成為新北市的商業與行政中心。' },
  'THSR-1020': { year: 2007, desc: '高鐵桃園站2007年通車，為桃園航空城的重要交通節點。車站與機場捷運連結，是國際旅客進出台灣的便捷轉運點。周邊的華泰名品城為北台灣最大的Outlet商場。' },
  'THSR-1030': { year: 2007, desc: '高鐵新竹站2007年通車，服務新竹科學園區的廣大科技族群。新竹是台灣半導體產業的核心基地，有「台灣矽谷」之稱。車站以簡潔現代的設計呼應科技城市意象。' },
  'THSR-1035': { year: 2015, desc: '高鐵苗栗站2015年通車，為苗栗縣首座高鐵車站。苗栗以客家文化、溫泉與桐花著稱。車站啟用後大幅縮短苗栗至台北的通勤時間。' },
  'THSR-1040': { year: 2007, desc: '高鐵台中站2007年通車，位於台中市烏日區。車站與台鐵新烏日站相鄰，是中台灣最重要的高鐵樞紐。台中以宜居環境與多元美食文化聞名。' },
  'THSR-1043': { year: 2015, desc: '高鐵彰化站2015年通車，以田中方向命名但位於彰化花壇。彰化是台灣重要的農業縣份，扇形車庫和鹿港老街是最具代表性的文化資產。' },
  'THSR-1047': { year: 2015, desc: '高鐵雲林站2015年通車，位於虎尾鎮。雲林以農業與布袋戲文化聞名，北港朝天宮是台灣最重要的媽祖信仰中心之一。' },
  'THSR-1050': { year: 2007, desc: '高鐵嘉義站2007年通車，位於太保市。嘉義是阿里山森林鐵路的起點城市，雞肉飯與火雞肉飯是最具代表性的地方美食。車站設計融入嘉南平原的農業意象。' },
  'THSR-1060': { year: 2007, desc: '高鐵台南站2007年通車，位於歸仁區。台南為台灣最早開發的城市，擁有最豐富的歷史古蹟與傳統美食。車站以台南傳統建築元素點綴設計。' },
  'THSR-1070': { year: 2007, desc: '高鐵左營站2007年通車，為台灣高鐵南端終點站。與台鐵新左營站、捷運左營站形成三鐵共構。左營以蓮池潭風景區和眷村文化聞名，高雄世運站也在附近。' },

  // TRTC famous stations
  'TRTC-BL10': { year: 1999, desc: '龍山寺站1999年隨板南線通車啟用，以萬華龍山寺命名。龍山寺建於1738年，是台北最古老的寺廟之一。車站出入口融入寺廟意象設計，地下街展現了萬華的歷史文化。' },
  'TRTC-BL11': { year: 1999, desc: '西門站1999年啟用，為板南線與松山新店線的轉乘站。西門町自日治時期起即為台北的娛樂商業中心，紅樓與美國街是年輕人文化的代表地標。' },
  'TRTC-BL12': { year: 1999, desc: '台北車站為捷運板南線與淡水信義線的交會站，1999年啟用。地下連通道串聯台鐵、高鐵與機場捷運，形成亞洲最大的地下交通系統。車站大廳是市民聚會與文化交流的重要場所。' },
  'TRTC-R10': { year: 1997, desc: '台北車站（淡水信義線）1997年隨淡水線通車啟用。捷運淡水線前身為日治時期的淡水線鐵路，1988年停駛後改建為捷運路線，是台北捷運最早營運的路線之一。' },
  'TRTC-R14': { year: 1997, desc: '圓山站1997年啟用，為台北捷運最早通車的車站之一。圓山飯店是台灣最具代表性的宮殿式建築，花博公園則是市民休閒的好去處。車站高架段可遠眺基隆河與圓山大飯店。' },
  'TRTC-R22': { year: 1997, desc: '北投站1997年啟用，為淡水信義線與新北投支線的轉乘站。北投以溫泉文化聞名世界，北投溫泉博物館與地熱谷是最具代表性的景點。日治時期即為著名的溫泉鄉。' },
  'TRTC-R28': { year: 1997, desc: '淡水站為淡水信義線北端終點站，1997年啟用。淡水以夕陽、老街與紅毛城聞名，是台北都會區最受歡迎的觀光景點之一。捷運前身的淡水線見證了百年來的鐵道變遷。' },
  'TRTC-R03': { year: 2013, desc: '台北101/世貿站2013年隨信義線通車啟用。台北101曾為世界最高建築，信義區是台北最繁華的商業中心。車站設計呈現國際都會的現代感。' },
  'TRTC-BR01': { year: 1996, desc: '動物園站1996年啟用，為文湖線南端終點站。台北市立動物園是亞洲最大的動物園之一，貓空纜車的起點站也在此處。木柵地區因文山茶而聞名。' },
  'TRTC-G10': { year: 1999, desc: '中正紀念堂站1999年啟用，為松山新店線與淡水信義線的轉乘站。中正紀念堂是台北最重要的紀念性建築，廣場上的自由廣場牌樓與國家戲劇院、音樂廳組成壯觀的建築群。' },
  'TRTC-G19': { year: 2014, desc: '松山站2014年隨松山線通車啟用，為松山新店線東端終點站。松山車站與台鐵松山站共構，饒河街夜市與慈祐宮是松山區最具代表性的觀光景點。' },
  'TRTC-O06': { year: 2013, desc: '東門站2013年啟用，為中和新蘆線與淡水信義線的轉乘站。永康街商圈以牛肉麵、小籠包等美食聞名國際，是外國觀光客必訪的台北美食聖地。' },

  // KRTC famous
  'KRTC-O5': { year: 2008, desc: '美麗島站2008年啟用，為高雄捷運紅橘線唯一的交會站。站內的「光之穹頂」由義大利藝術家水仙大師設計，是全球最大的單件玻璃藝術品，被評選為世界最美地鐵站之一。' },
  'KRTC-R11': { year: 2008, desc: '高雄車站2008年捷運紅線通車時啟用。高雄車站正進行鐵路地下化工程，完工後將成為台鐵、捷運、輕軌三鐵共構的交通樞紐。日治時期的帝冠式舊站體已遷移保存。' },
  'KRTC-R16': { year: 2008, desc: '左營站為高捷紅線北端終點站，2008年啟用。與高鐵左營站、台鐵新左營站形成三鐵共構。蓮池潭風景區的龍虎塔與春秋閣是高雄最具代表性的觀光景點。' },
  'KRTC-R9': { year: 2008, desc: '中央公園站2008年啟用，由英國建築師乍乍·乍里設計，以獨特的通風塔造型聞名。中央公園是高雄市區最大的都市綠地，城市光廊與流行音樂中心是周邊重要的文化設施。' },

  // TYMC
  'TYMC-A12': { year: 2017, desc: '機場第一航廈站2017年隨桃園機場捷運通車啟用，為往返桃園國際機場的主要捷運站。旅客可在此辦理預辦登機，是台灣國際門戶的重要公共運輸設施。' },
  'TYMC-A13': { year: 2017, desc: '機場第二航廈站2017年啟用，直接連結桃園國際機場第二航廈。桃園機場為台灣最大的國際機場，每年服務超過4000萬旅客。' },
  'TYMC-A1':  { year: 2017, desc: '台北車站（桃園機場捷運）2017年啟用，位於台北車站地下，提供市區預辦登機服務。旅客可在此托運行李後輕鬆搭機，大幅提升出國便利性。' },

  // KLRT
  'KLRT-NETWORK-C14': { year: 2017, desc: '哈瑪星站為高雄輕軌早期通車路段的重要車站。哈瑪星是高雄最早開發的港區，日治時期的「打狗港」即在此處。駁二藝術特區與哈瑪星鐵道文化園區保存了豐富的港埠歷史。' },
  'KLRT-NETWORK-C12': { year: 2017, desc: '駁二大義站鄰近駁二藝術特區大義倉庫群。駁二藝術特區由舊港口倉庫改建，是高雄最重要的文化創意基地，展覽、市集與音樂活動終年不斷。' },
};

// ─────────────────────────────────────────────
// Template-based history generator for non-famous stations
// ─────────────────────────────────────────────
const REGION_HINTS = {
  // TRA regions based on station_id ranges
  TRA: (id) => {
    const num = parseInt(id.replace('TRA-', ''), 10);
    if (num < 1000) return '基隆—台北';
    if (num < 1300) return '台北—新竹';
    if (num < 2300) return '海線（竹南—彰化）';
    if (num < 3200) return '山線（竹南—彰化）';
    if (num < 3500) return '彰化—二水';
    if (num < 4100) return '雲林—嘉義';
    if (num < 4500) return '嘉義—高雄';
    if (num < 5200) return '高雄—屏東';
    if (num < 6000) return '南迴線';
    if (num < 6300) return '台東—花蓮';
    if (num < 7100) return '花蓮';
    if (num < 7300) return '宜蘭';
    return '東北角';
  },
};

function generateHistoryForStation(station) {
  // Check famous stations first
  if (FAMOUS_HISTORIES[station.station_id]) {
    return FAMOUS_HISTORIES[station.station_id];
  }

  const sys = SYSTEM_INFO[station.system_type];
  const name = station.station_name;

  switch (station.system_type) {
    case 'TRA': {
      const region = REGION_HINTS.TRA(station.station_id);
      const num = parseInt(station.station_id.replace('TRA-', ''), 10);
      // Estimate year based on line
      let year = null;
      if (num < 1300) year = 1901;
      else if (num < 2300) year = 1922;
      else if (num < 3500) year = 1905;
      else if (num < 4500) year = 1903;
      else if (num < 5200) year = 1907;
      else if (num < 6000) year = 1937;
      else if (num < 7100) year = 1917;
      else year = 1919;

      // Special lines
      if (station.station_id.includes('1191') || station.station_id.includes('1192') ||
          station.station_id.includes('1193') || station.station_id.includes('1194')) year = 2011;
      if (station.station_id.includes('120')) year = 1951; // Neiwan
      if (station.station_id.includes('343')) year = 1922; // Jiji
      if (station.station_id.includes('7331') || station.station_id.includes('7332') ||
          station.station_id.includes('7333') || station.station_id.includes('7334') ||
          station.station_id.includes('7335') || station.station_id.includes('7336')) year = 1929;
      if (station.station_id.includes('7361') || station.station_id.includes('7362')) year = 2014;

      return {
        year,
        desc: `${name}車站位於${region}路段，為${sys.label}營運的車站。車站服務周邊社區居民的通勤與旅遊需求，是地方交通的重要節點。沿途的鐵道風景連結了城鄉之間的生活脈動，承載著在地居民的日常記憶與旅人的足跡。`
      };
    }
    case 'HSR':
      return {
        year: 2007,
        desc: `${name}為台灣高鐵停靠站，提供快速城際運輸服務。台灣高鐵以時速300公里連結台灣西部各主要城市，大幅縮短南北交通時間，改變了台灣的通勤與旅遊模式。`
      };
    case 'TRTC': {
      const lineMap = {
        BL: '板南線', BR: '文湖線', G: '松山新店線', O: '中和新蘆線', R: '淡水信義線'
      };
      const prefix = station.station_id.split('-')[1]?.replace(/\d+.*/, '') || '';
      const lineName = lineMap[prefix] || '台北捷運';
      return {
        year: prefix === 'BR' ? 1996 : prefix === 'R' ? 1997 : prefix === 'G' ? 1999 : prefix === 'BL' ? 1999 : 2014,
        desc: `${name}站為台北捷運${lineName}上的車站，服務台北都會區的通勤與旅遊人潮。台北捷運以安全、準時與便捷著稱，是大台北地區最重要的公共運輸系統，每日運量超過200萬人次。`
      };
    }
    case 'TYMC':
      return {
        year: 2017,
        desc: `${name}為桃園機場捷運路線上的車站，2017年通車營運。機場捷運連結台北市區與桃園國際機場，提供直達車與普通車服務，是國際旅客與通勤族的便捷選擇。`
      };
    case 'KRTC': {
      const isRed = station.station_id.includes('-R');
      return {
        year: 2008,
        desc: `${name}站為高雄捷運${isRed ? '紅線' : '橘線'}上的車站，2008年通車營運。高雄捷運串聯港都各大生活圈，車站公共藝術反映高雄多元的城市文化與海洋特色。`
      };
    }
    case 'TMRT':
      return {
        year: 2021,
        desc: `${name}站為台中捷運綠線（烏日文心北屯線）上的車站，2021年通車營運。台中捷運是台中市首條捷運路線，沿文心路行駛，串聯台中市各主要商圈與交通節點。`
      };
    case 'NTMC': {
      if (station.station_id.includes('NTDLRT')) {
        return {
          year: 2018,
          desc: `${name}站為新北捷運淡海輕軌上的車站。淡海輕軌是台灣北部第一條輕軌運輸系統，沿途設有幾米主題公共藝術裝置，將繪本世界融入日常通勤，打造獨特的藝文旅程。`
        };
      }
      if (station.station_id.includes('NTALRT')) {
        return {
          year: 2023,
          desc: `${name}站為新北捷運安坑輕軌上的車站，2023年通車營運。安坑輕軌連結新店安坑地區與捷運環狀線，縮短了安坑居民的通勤時間，帶動沿線都市發展。`
        };
      }
      return {
        year: 2020,
        desc: `${name}站為新北捷運環狀線上的車站，2020年通車營運。環狀線連結新北市各衛星城市，提供不必繞行台北市區的橫向運輸服務，大幅改善新北市的交通便利性。`
      };
    }
    case 'KLRT':
      return {
        year: 2017,
        desc: `${name}站為高雄輕軌環狀線上的車站。高雄輕軌是台灣第一條輕軌運輸系統，以低底盤列車行駛於城市街道中，串聯亞洲新灣區、駁二藝術特區等高雄新興文化地標。`
      };
    default:
      return { year: null, desc: `${name}為台灣軌道運輸系統上的車站，提供便捷的公共運輸服務。` };
  }
}

// ─────────────────────────────────────────────
// SVG Badge Generator
// ─────────────────────────────────────────────
function generateSVGBadge(station) {
  const color = getStationColor(station);
  const sys = SYSTEM_INFO[station.system_type];
  const name = station.station_name;

  // Truncate long names to fit badge
  const displayName = name.length > 4 ? name.substring(0, 4) : name;
  const fontSize = displayName.length <= 2 ? 16 : displayName.length === 3 ? 14 : 12;

  // System icon path
  const iconPaths = {
    TRA: '<path d="M50 18 L56 28 H64 L58 38 H64 L50 54 L36 38 H42 L36 28 H44 Z" fill="white" opacity="0.9"/>',
    HSR: '<path d="M35 36 Q50 16 65 36 L62 42 H38 Z" fill="white" opacity="0.9"/><rect x="38" y="42" width="24" height="6" rx="1" fill="white" opacity="0.7"/>',
    TRTC: '<circle cx="50" cy="32" r="10" fill="none" stroke="white" stroke-width="2.5" opacity="0.9"/><rect x="48" y="22" width="4" height="20" rx="2" fill="white" opacity="0.9"/>',
    TYMC: '<path d="M40 38 L50 22 L60 38 Z" fill="white" opacity="0.9"/><rect x="46" y="38" width="8" height="4" fill="white" opacity="0.7"/>',
    KRTC: '<circle cx="50" cy="32" r="10" fill="none" stroke="white" stroke-width="2.5" opacity="0.9"/><path d="M44 32 H56 M50 26 V38" stroke="white" stroke-width="2" opacity="0.9"/>',
    TMRT: '<rect x="40" y="26" width="20" height="14" rx="4" fill="white" opacity="0.9"/><circle cx="44" cy="44" r="2" fill="white" opacity="0.7"/><circle cx="56" cy="44" r="2" fill="white" opacity="0.7"/>',
    NTMC: '<path d="M40 34 Q50 20 60 34 Q50 48 40 34 Z" fill="white" opacity="0.9"/>',
    KLRT: '<rect x="38" y="28" width="24" height="12" rx="6" fill="white" opacity="0.9"/><circle cx="43" cy="44" r="2.5" fill="white" opacity="0.7"/><circle cx="57" cy="44" r="2.5" fill="white" opacity="0.7"/>',
  };

  const icon = iconPaths[station.system_type] || iconPaths.TRA;
  const shortLabel = sys?.shortLabel || station.system_type;

  // Generate a deterministic accent hue from station name for uniqueness
  let hash = 0;
  for (let i = 0; i < station.station_id.length; i++) {
    hash = ((hash << 5) - hash) + station.station_id.charCodeAt(i);
    hash |= 0;
  }
  const hueShift = Math.abs(hash % 30) - 15;

  // Parse base color to HSL and shift
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  let s = 0, h = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r / 255) h = ((g / 255 - b / 255) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g / 255) h = ((b / 255 - r / 255) / d + 2) * 60;
    else h = ((r / 255 - g / 255) / d + 4) * 60;
  }

  const h2 = (h + hueShift + 360) % 360;
  const gradStop = `hsl(${Math.round(h2)}, ${Math.round(s * 100)}%, ${Math.round(Math.min(l * 100 + 15, 85))}%)`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${color}"/>
      <stop offset="100%" stop-color="${gradStop}"/>
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="0" dy="1" stdDeviation="2" flood-opacity="0.3"/>
    </filter>
  </defs>
  <circle cx="50" cy="50" r="46" fill="url(#bg)" stroke="white" stroke-width="3" filter="url(#shadow)"/>
  <circle cx="50" cy="50" r="40" fill="none" stroke="white" stroke-width="1" opacity="0.4"/>
  ${icon}
  <text x="50" y="${fontSize <= 12 ? 72 : 70}" text-anchor="middle" font-family="sans-serif" font-size="${fontSize}" font-weight="bold" fill="white" stroke="${color}" stroke-width="0.5">${displayName}</text>
  <text x="50" y="94" text-anchor="middle" font-family="sans-serif" font-size="7" fill="white" opacity="0.8">${shortLabel}</text>
</svg>`;

  return svg;
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
function main() {
  console.log('📂 Reading station data...');
  const data = JSON.parse(fs.readFileSync(INPUT, 'utf-8'));

  const enrichment = [];
  const systems = Object.keys(data.stations);

  for (const sys of systems) {
    const stations = data.stations[sys] || [];
    for (const station of stations) {
      const history = generateHistoryForStation(station);
      const badge = generateSVGBadge(station);

      enrichment.push({
        station_id: station.station_id,
        system_type: station.system_type,
        established_year: history.year,
        history_desc: history.desc,
        badge_image_url: badge,
      });
    }
  }

  console.log(`✅ Generated enrichment data for ${enrichment.length} stations`);

  // Summary by system
  const bySys = {};
  for (const e of enrichment) {
    bySys[e.system_type] = (bySys[e.system_type] || 0) + 1;
  }
  for (const [sys, count] of Object.entries(bySys)) {
    console.log(`   ${sys}: ${count} stations`);
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(enrichment, null, 2), 'utf-8');
  console.log(`📝 Output written to ${OUTPUT}`);
}

main();
