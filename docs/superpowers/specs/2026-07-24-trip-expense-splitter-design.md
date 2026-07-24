# 旅行分帳 App — 設計文件

日期：2026-07-24
狀態：待實作

## 1. 目標

多個家庭一齊去旅行，各自喺唔同日子俾唔同開支（民宿、食飯、補給、門票…）。要一個網頁，等**每個家庭各自喺自己手機記數、即時睇到同一份數**，最後結算時**自動計出邊個要俾錢邊個**。

核心難點：唔係每筆開支所有家庭都有份 —— 要逐筆勾選參與嘅家庭，結算時自動剔除唔相關嘅開支。

## 2. 非目標（YAGNI，之後有需要先加）

- 多幣值 / 匯率換算（一個 trip 只用一種貨幣）。
- 登入 / 密碼 / 權限（有連結就用得，旅行朋友之間夠用）。
- 「Day 1 / Day 5」旅程日標籤（直接用真實日期）。
- 按人頭分攤（一律按家庭平分）。
- 即時 websocket 推送（用刷新／切頁攞最新已足夠）。
- 相片收據、通知、匯出 PDF 等。

## 3. 架構

```
[家庭手機瀏覽器]
   ↓ fetch (GET 讀 / POST 寫)
[GitHub Pages: wyho1029.github.io/Expenses  ← 單一 index.html]
   ↓ fetch
[Google Apps Script Web App (JSON API)]
   ↓ 讀寫
[Google Sheet (資料庫)]
```

- **前端**：單一 `index.html`（原生 HTML/CSS/JS，無框架、無外部依賴），放喺 `wyho1029/Expenses` repo，GitHub Pages 服務於 `wyho1029.github.io/Expenses`。用相對路徑（project page 係子路徑）。
- **後端／資料**：一個 Google Sheet 做資料庫；一段綁定該 Sheet 的 Google Apps Script 部署為 Web App，提供讀／寫 JSON API。
- **CORS 處理**：讀取用 `GET`；寫入用 `POST` 且 `Content-Type: text/plain`（送 JSON 字串），屬「simple request」可避開 Apps Script 處理唔到的 preflight。
- **並發**：Apps Script 寫入時用 `LockService` 上鎖（短 timeout）。開支以「每筆一行、以新增為主」，天然避免撞車；改／刪按 id 定位單行。

## 4. 資料模型（Google Sheet）

三個分頁：

### `Config`（key-value，單行設定）
| key | 例 | 說明 |
|-----|-----|------|
| currency | `JPY` | ISO 貨幣碼，全 app 顯示用 |
| categories | `住宿,食物,交通,補給,零食,門票,其他` | 逗號分隔，可自訂 |

### `Families`
| id | name | active |
|----|------|--------|
| f1 | 家庭一 | TRUE |
| f2 | 家庭二 | TRUE |

- 可新增（家庭四、五…）、改名、停用（`active=FALSE`，保留歷史數不刪）。

### `Expenses`
| id | date | category | payer | amount | participants | note | createdAt | deleted |
|----|------|----------|-------|--------|--------------|------|-----------|---------|
| e1700000000 | 2026-07-24 | 住宿 | f1 | 30000 | f1,f2,f3 | 民宿兩晚 | (ISO) | FALSE |

- `payer`、`participants` 存 family id。
- `deleted=TRUE` 為軟刪除（結算時略過）。

## 5. API（Apps Script Web App）

單一 endpoint，用 `action` 分流。回傳 `{ok:true, data:...}` 或 `{ok:false, error:"..."}`。

- `GET ?action=bootstrap` → `{config, families, expenses}`（一次過攞晒，前端載入用）。
- `POST {action:"addExpense", ...}` → 新增一行，回傳新 id。
- `POST {action:"updateExpense", id, ...}` → 改一行。
- `POST {action:"deleteExpense", id}` → 設 `deleted=TRUE`。
- `POST {action:"addFamily"|"renameFamily"|"setFamilyActive", ...}`。
- `POST {action:"setConfig", key, value}` → 改貨幣／類別。

寫入前 `LockService.getScriptLock().tryLock(...)`。

## 6. 前端 UI（單頁，分區塊 / tab）

貨幣符號一律用 `Config.currency`。

### A. 入數（主畫面）
- **日期**：`<input type="date">`，預設今日；可揀返之前日子（= day-back 補填）。
- **類別**：下拉（來自 `Config.categories`）。
- **俾錢家庭**：下拉（`Families` 中 active）。預設 = 呢部手機揀過嘅「你係邊家」（存 localStorage）。
- **金額**：數字輸入。
- **參與家庭**：checkbox 清單，**預設全部剔**。
- **備註**：可留空。
- 提交 → POST → 成功後重攞清單。

### B. 睇數（清單）
- 所有家庭見同一份，按日期倒序。
- 顯示：日期、類別、俾錢家、金額、參與家（頭像／簡稱）、備註。
- 可按家庭 / 類別篩選。
- 每筆可「改」／「刪」。

### C. 結算
- 每家淨額（應收 = 綠、應俾 = 紅）。
- 「邊個俾邊個」最少筆過數清單：**家庭X 要俾 \$Y 畀 家庭Z**。

### D. 設定
- 貨幣下拉：置頂常用（USD 美金、CNY 人民幣、HKD 港幣、JPY 日元、TWD 台幣），其後為完整 ISO 貨幣清單。
- 類別編輯。
- 家庭管理（加／改名／停用）。

### 更新策略
載入時、視窗重新 focus 時、撳「刷新」時、每次寫入成功後 → 重新 `bootstrap`。

## 7. 結算演算法（前端計）

```
paid[f]  = Σ amount，f 為 payer 的（未刪）開支
owed[f]  = Σ (amount / |participants|)，f ∈ participants 的（未刪）開支
net[f]   = paid[f] - owed[f]          // 正=應收，負=應俾
```

簡化過數（貪心）：
1. creditors = net>0，debtors = net<0。
2. 每次取最大債仔配最大債主，過 `min(|debtor|, creditor)`，更新兩者。
3. 重複至全部歸零 → 產生 ≤ (家庭數-1) 筆過數。

**取整**：按貨幣小數位（JPY/TWD/KRW = 0 位；USD/HKD 等 = 2 位）四捨五入顯示。分攤除唔盡時可能有極微殘差（幾毫），可接受；結算頁註明。

## 8. 一次性部署步驟（交畀用戶，約 5 分鐘）

1. 建立 Google Sheet，按上述加 `Config`、`Families`、`Expenses` 三個分頁（提供貼上用的初始內容）。
2. 擴充功能 → Apps Script → 貼上提供的 `Code.gs` → 部署為 Web App（執行身分：自己；存取：任何人）→ copy Web App URL。
3. 將 `index.html` 放入 `wyho1029/Expenses` repo，於檔案頂部 `API_URL` 常數貼上該 URL。
4. repo Settings → Pages 啟用 → 開 `wyho1029.github.io/Expenses`，分享畀各家庭。

## 9. 驗證

- **結算數學自我檢查**：一段可跑的 `assert` demo（前端內置 dev 函式或獨立小測試）：構造已知開支 → 驗證 `Σ net ≈ 0`、過數清單總額對得返各債主／債仔、以及一個手算例子（如 民宿 30000 由 f1 付、f1/f2/f3 三家分 → f2、f3 各俾 10000 畀 f1）。
- 部署後：兩部裝置開同一連結，一部入數，另一部刷新見到。

## 10. 已知限制

- 無鑑權：知道連結即可讀寫（旅行場景可接受）。
- Apps Script 免費額度：小群組每日寫入量遠低於上限。
- 單一貨幣；跨幣值需日後加逐筆貨幣 + 匯率。
