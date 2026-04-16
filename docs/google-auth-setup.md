# Google OAuth 登入設定指南

## 概覽

Rail Stamp Rally 使用 Supabase Auth + Google OAuth 實現會員登入（不需輸入帳號密碼）。

## 設定步驟

### 1. Google Cloud Console

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立或選擇專案
3. 前往 **APIs & Services > Credentials**
4. 建立 **OAuth 2.0 Client ID**（Web application 類型）
5. 設定 **Authorized redirect URIs**：
   ```
   https://gbqqraygsbcehaxpqura.supabase.co/auth/v1/callback
   ```
6. 記下 **Client ID** 和 **Client Secret**

### 2. Supabase Dashboard

1. 前往 [Supabase Dashboard](https://supabase.com/dashboard) > 你的專案
2. 前往 **Authentication > Providers**
3. 啟用 **Google** provider
4. 填入 Google Cloud Console 取得的：
   - **Client ID**
   - **Client Secret**
5. 儲存設定

### 3. 確認 Site URL

1. 在 Supabase Dashboard > **Authentication > URL Configuration**
2. 設定 **Site URL** 為你的應用網址：
   - 本地開發：`http://localhost:3000`
   - GitHub Pages：`https://<username>.github.io/rail-stamp-rally`
3. 在 **Redirect URLs** 中加入允許的回調網址：
   - `http://localhost:3000`
   - `http://localhost:3000/rail-stamp-rally`
   - `https://<username>.github.io/rail-stamp-rally`

## 前端實作

`AuthButton` 元件 (`components/AuthButton.tsx`) 已實作：

- `supabase.auth.signInWithOAuth({ provider: 'google' })` — 觸發 Google 登入流程
- `supabase.auth.onAuthStateChange()` — 監聽登入狀態變化
- OAuth redirect 後自動完成 session 建立（Supabase JS v2 PKCE flow）
- 顯示使用者頭像與登出按鈕

## 運作流程

1. 使用者點擊「使用 Google 登入」
2. 跳轉至 Google OAuth 授權頁面
3. 授權後導回 Supabase Auth callback
4. Supabase 完成 token 交換後 redirect 回應用
5. Supabase JS client 自動從 URL 讀取 token 並建立 session
6. `onAuthStateChange` 觸發 → UI 更新為已登入狀態
