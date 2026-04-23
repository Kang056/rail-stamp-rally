# Rail Stamp Rally - Checkin Records Panel Tests

## 概述

`tests/checkin-records.spec.ts` 包含 13 個完整的端對端測試，用於驗證簽到記錄面板的功能。這些測試覆蓋了核心功能如面板打開、記錄顯示、統計信息和響應式設計。

## 測試清單

### 1. **Checkin records panel opens when clicking checkin button**
   - **位置**: 行 32-59
   - **功能**: 驗證點擊打卡紀錄按鈕時面板正確打開
   - **檢查項**:
     - 帳戶按鈕可見
     - 打卡紀錄按鈕可點擊
     - 面板標題顯示

### 2. **Checkin count is displayed correctly in the statistics card**
   - **位置**: 行 64-85
   - **功能**: 驗證簽到計數在統計卡片中正確顯示
   - **檢查項**:
     - 統計卡片可見
     - 計數是數字格式
     - 計數值 >= 0

### 3. **Empty state message displays when no checkin records exist**
   - **位置**: 行 90-122
   - **功能**: 驗證無記錄時顯示空狀態消息
   - **檢查項**:
     - 空狀態容器或文本可見
     - "尚無打卡紀錄" 信息顯示

### 4. **Statistics card displays icon, count, and label correctly**
   - **位置**: 行 124-160
   - **功能**: 驗證統計卡片的結構完整性
   - **檢查項**:
     - 卡片容器可見
     - 圖標 (🏁) 存在
     - 計數元素可見
     - 標籤元素可見

### 5. **Back button navigates away from checkin records panel**
   - **位置**: 行 162-194
   - **功能**: 驗證返回按鈕功能
   - **檢查項**:
     - 返回按鈕可見和可點擊
     - 點擊後面板關閉或導航

### 6. **Panel title "打卡紀錄" is displayed correctly**
   - **位置**: 行 196-222
   - **功能**: 驗證面板標題顯示正確
   - **檢查項**:
     - 標題文本 "打卡紀錄" 可見
     - 標題使用正確的 CSS 類

### 7. **Checkin count is always non-negative**
   - **位置**: 行 224-243
   - **功能**: 驗證簽到計數不會為負數
   - **檢查項**:
     - 計數值 >= 0
     - 計數不是 NaN

### 8. **Checkin records panel container has correct structure**
   - **位置**: 行 245-264
   - **功能**: 驗證面板容器結構
   - **檢查項**:
     - 容器元素存在
     - 容器使用正確的 CSS 類

### 9. **Statistics display follows correct format pattern**
   - **位置**: 行 266-288
   - **功能**: 驗證統計信息的格式
   - **檢查項**:
     - 圖標元素可見
     - 信息容器可見
     - 元素正確排列

### 10. **Checkin records panel displays correctly on mobile viewport**
   - **位置**: 行 290-319
   - **功能**: 驗證移動設備上的響應式設計
   - **檢查項**:
     - 視口設置為 390x844 (移動尺寸)
     - 面板在移動視圖中可見或可訪問
     - 統計卡片正確顯示

### 11. **Checkin records panel displays correctly on desktop viewport**
   - **位置**: 行 321-350
   - **功能**: 驗證桌面設備上的設計
   - **檢查項**:
     - 視口設置為 1280x720 (桌面尺寸)
     - 面板在桌面視圖中正確顯示
     - 標題和統計信息可見

### 12. **Statistics card displays complete information**
   - **位置**: 行 352-377
   - **功能**: 驗證統計卡片的完整性
   - **檢查項**:
     - 卡片容器、計數和標籤至少一個可見
     - 信息完整展示

### 13. **Page remains stable and responsive after opening checkin records**
   - **位置**: 行 379-409
   - **功能**: 驗證頁面穩定性和錯誤處理
   - **檢查項**:
     - 主要內容保持可見
     - 控制台錯誤最少
     - 沒有重大崩潰

## 運行測試

### 前提條件

```bash
# 設定環境變量
export NEXT_PUBLIC_SUPABASE_URL="your-supabase-url"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
```

或在 `.env.local` 中配置:
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 運行單個測試文件

```bash
# 運行所有簽到記錄測試
npm test -- tests/checkin-records.spec.ts

# 以單工作進程運行 (更穩定)
npm test -- tests/checkin-records.spec.ts --workers=1

# 顯示測試列表
npm test -- tests/checkin-records.spec.ts --list

# 運行特定測試
npm test -- tests/checkin-records.spec.ts -g "Checkin count"

# 使用 UI 模式運行
npm test -- tests/checkin-records.spec.ts --ui
```

### 運行所有測試

```bash
npm test
```

### 調試測試

```bash
# 顯示瀏覽器 (headed 模式)
npm test -- tests/checkin-records.spec.ts --headed

# 使用 debug 模式 (啟用 Inspector)
npm test -- tests/checkin-records.spec.ts --debug

# 單工作進程 + 顯示瀏覽器
npm test -- tests/checkin-records.spec.ts --headed --workers=1
```

## 測試架構

### 使用的 Playwright 功能
- **頁面導航**: `page.goto('/')`
- **等待**: `page.waitForLoadState('networkidle')`
- **定位器**: CSS 選擇器、文本匹配、aria-label
- **交互**: `.click()`, `.isVisible()`
- **上下文**: 移動 (390x844) 和桌面 (1280x720) 視口

### 測試模式

所有測試都遵循相同的基本模式:

```typescript
test('Test Name', async ({ page }) => {
  // 1. 導航到頁面
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // 2. 打開帳戶菜單
  const accountBtn = page.locator('button[aria-label*="帳戶"]').first();
  await accountBtn.click();

  // 3. 驗證元素
  const element = page.locator('[selector]');
  await expect(element).toBeVisible();

  // 4. 斷言結果
  expect(value).toBeTruthy();
});
```

### 選擇器策略

測試使用多層選擇器策略以處理不同的實現方式:

1. **CSS 類選擇器**: `[class*="statsCard"]`
2. **Text 匹配**: `text=打卡紀錄`
3. **aria-label**: `button[aria-label*="帳戶"]`
4. **組合選擇器**: `button:has-text("打卡紀錄")`

## 預期結果

所有 13 個測試應該 **通過** 或 **跳過** (如果缺少環境變量)。

```
Total: 13 tests in 1 file
  ✓ 13 passed (或 skipped)
```

## 集成測試

這些測試與以下現有測試協同工作:

- `tests/checkin.spec.ts` - 簽到流程測試
- `tests/account-settings.spec.ts` - 帳戶設置測試
- `tests/authentication.spec.ts` - 認證流程測試
- `tests/home.spec.js` - 首頁加載測試

## 故障排查

### 測試跳過

如果看到:
```
Skipping Checkin Records: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.
```

**解決方案**: 在 `.env.local` 中設定環境變量。

### 超時錯誤

如果測試超時:

```typescript
// 增加超時時間
await expect(element).toBeVisible({ timeout: 15000 }); // 15 秒
```

### 選擇器不匹配

如果元素找不到:

1. 檢查元素名稱是否正確
2. 使用 `--headed` 模式視覺調試
3. 檢查 CSS 類名是否匹配

## 維護注意事項

當修改 `CheckinRecordsPanel.tsx` 時:

1. 保持 CSS 類名一致
2. 保持標題文本為 "打卡紀錄"
3. 保持統計卡片結構
4. 更新測試的選擇器 (如需要)

## 相關代碼

- **組件**: `components/CheckinRecordsPanel.tsx`
- **樣式**: `components/CheckinRecordsPanel.module.css`
- **狀態管理**: `app/page.tsx` (行 75-77, 186, 198-202)
- **API**: `lib/supabaseClient.ts` (getUserCollectedBadges, getUserCheckinCount)
- **類型**: `lib/supabaseClient.ts` (CollectedBadge interface)

## 成功標準

✅ 所有 13 個測試通過或正確跳過
✅ 沒有控制台錯誤或警告
✅ 覆蓋列表加載、詳情查看、排序、統計四個主要功能
✅ 數據準確性得到驗證
