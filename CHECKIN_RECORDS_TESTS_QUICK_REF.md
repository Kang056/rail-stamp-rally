# 簽到記錄測試 - 快速指南

## ✅ 完成清單

- [x] 創建 `tests/checkin-records.spec.ts` (20.51 KB, 13 個測試)
- [x] 創建詳細文檔 `CHECKIN_RECORDS_TESTS_README.md`
- [x] 所有測試通過語法驗證
- [x] 測試正確集成到 Playwright 套件
- [x] 與現有測試相容

## 📋 13 個測試

| # | 測試名稱 | 位置 | 功能 |
|---|---------|------|------|
| 1 | Checkin records panel opens | 行 32-59 | 面板打開功能 |
| 2 | Checkin count displayed | 行 64-85 | 計數顯示 |
| 3 | Empty state message | 行 90-122 | 空狀態提示 |
| 4 | Statistics card structure | 行 124-160 | 卡片結構 |
| 5 | Back button functionality | 行 162-194 | 返回按鈕 |
| 6 | Panel title display | 行 196-222 | 標題顯示 |
| 7 | Checkin count non-negative | 行 224-243 | 數值驗證 |
| 8 | Panel container structure | 行 245-264 | 容器結構 |
| 9 | Statistics format | 行 266-288 | 格式驗證 |
| 10 | Mobile viewport | 行 290-319 | 移動設計 |
| 11 | Desktop viewport | 行 321-350 | 桌面設計 |
| 12 | Statistics completeness | 行 352-377 | 完整性檢查 |
| 13 | Page stability | 行 379-409 | 穩定性測試 |

## 🚀 運行測試

```bash
# 環境設定 (首次)
cp .env.local.example .env.local
# 編輯 .env.local，填入 Supabase 憑證

# 運行簽到記錄測試
npm test -- tests/checkin-records.spec.ts

# 列出所有測試
npm test -- tests/checkin-records.spec.ts --list

# 調試模式
npm test -- tests/checkin-records.spec.ts --headed --workers=1

# 運行特定測試
npm test -- tests/checkin-records.spec.ts -g "Checkin count"

# UI 模式
npm test -- tests/checkin-records.spec.ts --ui
```

## 📍 涵蓋的功能

✅ **面板加載** - 打開簽到紀錄面板
✅ **記錄列表** - 驗證記錄正確顯示
✅ **統計信息** - 顯示簽到總數和統計數據
✅ **組件結構** - 驗證 UI 元素正確排列
✅ **響應式設計** - 測試移動和桌面視圖
✅ **數據驗證** - 確認數據準確性
✅ **穩定性** - 驗證頁面無錯誤

## 🔍 測試技術

- **框架**: Playwright (TypeScript)
- **視口**: 移動 (390x844) 和桌面 (1280x720)
- **定位器**: CSS 類、文本匹配、aria-label
- **等待策略**: networkidle、可見性超時
- **斷言**: 元素可見性、文本內容、數值驗證

## 📚 相關文件

| 文件 | 用途 |
|-----|------|
| `components/CheckinRecordsPanel.tsx` | 面板組件 |
| `components/CheckinRecordsPanel.module.css` | 樣式 |
| `app/page.tsx` | 狀態管理 |
| `lib/supabaseClient.ts` | API 函數 |
| `tests/checkin-records.spec.ts` | **本測試文件** |
| `CHECKIN_RECORDS_TESTS_README.md` | 詳細文檔 |

## ⚠️ 環境要求

```
必須設置:
✓ NEXT_PUBLIC_SUPABASE_URL
✓ NEXT_PUBLIC_SUPABASE_ANON_KEY

開發服務器:
✓ npm run dev (自動啟動)
✓ http://localhost:3000 (預設端口)
```

## 🎯 成功標準

```
Total: 13 tests in 1 file
  ✓ 13 passed (或 skipped 如果缺少環境變量)
  ✓ 0 failed
  ✓ 0 flaky
```

## 📞 故障排查

| 問題 | 解決方案 |
|-----|---------|
| 測試跳過 | 設置 Supabase 環境變量 |
| 超時 | 增加 timeout，檢查網絡 |
| 選擇器不匹配 | 使用 --headed 模式視覺調試 |
| 元素未找到 | 檢查組件是否已渲染 |

## 💡 提示

- 首次運行會下載瀏覽器 (~300MB)
- 使用 `--workers=1` 可獲得更穩定的結果
- 查看 `CHECKIN_RECORDS_TESTS_README.md` 了解更多細節
- 在 CI/CD 中使用無頭模式 (`--headed` 移除)

---

**建立時間**: 2025 年  
**測試類型**: Playwright E2E  
**覆蓋組件**: CheckinRecordsPanel  
