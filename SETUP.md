# 部署指引（約 5 分鐘，做一次）

## 1. 建立 Google Sheet

去 [sheets.new](https://sheets.new) 開一個新試算表，改名（例：`旅行分帳`）。
底部建立 **三個分頁**，第一行（標題列）照抄：

**`Config`**（key-value 設定）

| key | value |
|-----|-------|
| currency | JPY |
| categories | 住宿,食物,交通,補給,零食,門票,其他 |

**`Families`**（家庭清單）

| id | name | active |
|----|------|--------|
| f1 | 家庭一 | TRUE |
| f2 | 家庭二 | TRUE |
| f3 | 家庭三 | TRUE |

**`Expenses`**（開支，只需標題列，資料由 app 自動加）

| id | date | category | payer | amount | participants | note | createdAt | deleted | trip |
|----|------|----------|-------|--------|--------------|------|-----------|---------|------|

> 分頁名同標題大小寫要一樣。
>
> 💡 **其實你可以由一張完全空白嘅 Google Sheet 開始** —— `Code.gs` 係通用資料層，會按前端需要**自動建立**所有分頁同欄位（`Config`／`Families`／`Trips`／`Expenses` 都唔使自己整）。上面啲表只係畀你參考結構。
>
> 🔒 **只需部署呢一次。** 之後所有新功能改動都淨係改前端（自動經 GitHub Pages 更新），Apps Script 唔使再重新部署 —— 除非真係要加全新嘅伺服器行為（呢個 app 幾乎唔會）。

## 2. 貼上後端程式碼

1. 試算表選單：**擴充功能 → Apps Script**。
2. 刪走預設 `Code.gs` 內容，貼上本專案 `Code.gs` 全部內容 → 儲存（💾）。

## 3. 部署為網頁應用程式

1. 右上 **部署 → 新增部署**。
2. 類型選 **網頁應用程式**。
3. 設定：**執行身分 = 我自己**；**具存取權的使用者 = 任何人**。
4. **部署** → 首次會要你授權（選你嘅 Google 帳號 → 進階 → 前往 → 允許）。
5. 複製 **網頁應用程式 URL**（形如 `https://script.google.com/macros/s/XXXX/exec`）。
6. 瀏覽器貼上 `那條URL?action=bootstrap`，見到 `{"ok":true,...}` 即成功。

> 之後每次改咗 `Code.gs`，要 **部署 → 管理部署 → ✏️ 編輯 → 版本：新版本 → 部署** 先生效。

## 4. 接上前端 + 上 GitHub Pages

1. 開 `index.html`，把頂部
   ```js
   const API_URL = "貼上你嘅 Web App URL";
   ```
   換成第 3 步複製嘅 URL。
2. 將 `index.html` 同 `settlement.js` 放入 `wyho1029/Expenses` repo（push 上去）。
3. GitHub repo → **Settings → Pages** → Source 選 `main` 分支、`/ (root)` → 儲存。
4. 等一兩分鐘，開 **`https://wyho1029.github.io/Expenses/`**，分享畀各家庭。

搞掂！每家開同一條連結就記得到數、睇得到即時結算。
