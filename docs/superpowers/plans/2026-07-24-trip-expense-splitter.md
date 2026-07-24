# 旅行分帳 App 實作計劃

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans。Steps 用 checkbox 追蹤。同一 session 由本人實作。

**Goal:** 一個 GitHub Pages 靜態網頁 + Google Sheet 後端嘅多家庭旅行分帳工具，自動計出邊個要俾錢邊個。

**Architecture:** 前端單頁 `index.html`（原生 JS，無框架）託管於 `wyho1029.github.io/Expenses`；透過 `fetch` 呼叫一個綁定 Google Sheet 嘅 Google Apps Script Web App（JSON API）。結算數學係純函式，client 端計。

**Tech Stack:** 原生 HTML/CSS/JS、Google Apps Script、Google Sheet、Node（只用嚟跑 settlement 單元測試）。

## Global Constraints（copy 自 spec）

- 單一貨幣（`Config.currency`，ISO 碼），無匯率換算。
- 無登入／密碼。
- 按**家庭平分**（唔按人頭）。
- 家庭可動態新增／改名／停用。
- 開支可補填日期（day-back），逐筆勾選參與家庭。
- CORS：讀 `GET`；寫 `POST` + `Content-Type: text/plain`。
- 前端相對路徑（GitHub project page 子路徑）。
- 無外部依賴（no CDN、no npm 於前端）。

## File Structure

- `settlement.js` — 純結算數學。瀏覽器 (`window.settleDebts`) 同 Node (`module.exports`) 雙用，單一真相來源。
- `test-settlement.js` — Node assert 測試 `settlement.js`。
- `index.html` — UI + fetch 膠水 + 畫面渲染，`<script src="settlement.js">` 載入結算邏輯。
- `Code.gs` — Apps Script 後端（JSON API）。
- `SETUP.md` — 建 Sheet、部署 Apps Script、開 Pages 嘅步驟；含 Sheet 初始內容。

---

### Task 1: 結算數學（settlement.js + 測試）

**Files:**
- Create: `settlement.js`
- Test: `test-settlement.js`

**Interfaces:**
- Produces: `settleDebts(expenses, families) -> { nets, transfers }`
  - `expenses`: `[{ payer: string, amount: number, participants: string[], deleted?: boolean }]`
  - `families`: `[{ id: string, name: string, active?: boolean }]`
  - `nets`: `{ [famId]: number }`（正=應收，負=應俾，四捨五入 2 位）
  - `transfers`: `[{ from: string, to: string, amount: number }]`（最少筆過數）

- [ ] **Step 1: 寫失敗測試 `test-settlement.js`**

```js
const assert = require('assert');
const { settleDebts } = require('./settlement.js');

const fams = [{id:'f1'},{id:'f2'},{id:'f3'}];

// 1. 空
{
  const { nets, transfers } = settleDebts([], fams);
  assert.deepStrictEqual(transfers, []);
  assert.strictEqual(nets.f1, 0);
}

// 2. 民宿 30000 由 f1 付，f1/f2/f3 三家平分
{
  const exp = [{payer:'f1', amount:30000, participants:['f1','f2','f3']}];
  const { nets, transfers } = settleDebts(exp, fams);
  assert.strictEqual(nets.f1, 20000);
  assert.strictEqual(nets.f2, -10000);
  assert.strictEqual(nets.f3, -10000);
  const byFrom = Object.fromEntries(transfers.map(t=>[t.from, t]));
  assert.strictEqual(byFrom.f2.to, 'f1'); assert.strictEqual(byFrom.f2.amount, 10000);
  assert.strictEqual(byFrom.f3.to, 'f1'); assert.strictEqual(byFrom.f3.amount, 10000);
}

// 3. 只涉及部分家庭 + 淨額互相抵消，過數要最少
{
  const exp = [
    {payer:'f1', amount:1000, participants:['f1','f2']}, // f1 +500, f2 -500
    {payer:'f2', amount:400,  participants:['f2','f3']}, // f2 +200, f3 -200
  ];
  const { nets, transfers } = settleDebts(exp, fams);
  assert.strictEqual(nets.f1, 500);
  assert.strictEqual(nets.f2, -300);
  assert.strictEqual(nets.f3, -200);
  // 總過數 = 債仔總額 500
  assert.strictEqual(transfers.reduce((s,t)=>s+t.amount,0), 500);
  assert.ok(transfers.length <= 2);
}

// 4. deleted 開支要略過
{
  const exp = [{payer:'f1', amount:999, participants:['f1','f2'], deleted:true}];
  const { transfers } = settleDebts(exp, fams);
  assert.deepStrictEqual(transfers, []);
}

console.log('SETTLEMENT SELF-CHECK PASS');
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node test-settlement.js`
Expected: FAIL（`Cannot find module './settlement.js'`）

- [ ] **Step 3: 實作 `settlement.js`**

```js
function round2(n){ return Math.round((n + Number.EPSILON) * 100) / 100; }

function settleDebts(expenses, families){
  const nets = {};
  for (const f of families) nets[f.id] = 0;
  for (const e of expenses){
    if (e.deleted) continue;
    const parts = e.participants || [];
    if (!parts.length) continue;
    const share = e.amount / parts.length;
    if (nets[e.payer] === undefined) nets[e.payer] = 0;
    nets[e.payer] += e.amount;
    for (const p of parts){
      if (nets[p] === undefined) nets[p] = 0;
      nets[p] -= share;
    }
  }
  for (const k in nets) nets[k] = round2(nets[k]);

  // 貪心最少過數
  const creditors = Object.keys(nets).filter(k=>nets[k] > 0).map(k=>({id:k, amt:nets[k]}));
  const debtors  = Object.keys(nets).filter(k=>nets[k] < 0).map(k=>({id:k, amt:-nets[k]}));
  creditors.sort((a,b)=>b.amt-a.amt);
  debtors.sort((a,b)=>b.amt-a.amt);
  const transfers = [];
  let i=0, j=0;
  while (i < debtors.length && j < creditors.length){
    const pay = round2(Math.min(debtors[i].amt, creditors[j].amt));
    if (pay > 0) transfers.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
    debtors[i].amt = round2(debtors[i].amt - pay);
    creditors[j].amt = round2(creditors[j].amt - pay);
    if (debtors[i].amt <= 0.005) i++;
    if (creditors[j].amt <= 0.005) j++;
  }
  return { nets, transfers };
}

if (typeof module !== 'undefined') module.exports = { settleDebts };
if (typeof window !== 'undefined') window.settleDebts = settleDebts;
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node test-settlement.js`
Expected: `SETTLEMENT SELF-CHECK PASS`

---

### Task 2: Apps Script 後端（Code.gs）

**Files:**
- Create: `Code.gs`

**Interfaces:**
- Produces（HTTP）：
  - `GET ?action=bootstrap` → `{ok:true, data:{config, families, expenses}}`
  - `POST` body(JSON 字串, `text/plain`)：`{action, ...}`，action ∈ `addExpense|updateExpense|deleteExpense|addFamily|renameFamily|setFamilyActive|setConfig`
  - 全部回 `{ok:true, data}` 或 `{ok:false, error}`，以 `ContentService` JSON 輸出。

- [ ] **Step 1: 寫 `Code.gs`**（完整）

```js
const SHEET_EXP = 'Expenses';
const SHEET_FAM = 'Families';
const SHEET_CFG = 'Config';

function ss(){ return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet(n){ return ss().getSheetByName(n); }
function json(obj){ return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

function rows(name){
  const sh = sheet(name); const vals = sh.getDataRange().getValues();
  const head = vals.shift();
  return vals.filter(r=>r[0] !== '').map(r=>{ const o={}; head.forEach((h,i)=>o[h]=r[i]); return o; });
}

function readAll(){
  const cfgRows = rows(SHEET_CFG);
  const config = {}; cfgRows.forEach(r=>config[r.key]=String(r.value));
  const families = rows(SHEET_FAM).map(f=>({id:String(f.id), name:String(f.name), active: f.active !== false && String(f.active).toUpperCase() !== 'FALSE'}));
  const expenses = rows(SHEET_EXP).map(e=>({
    id:String(e.id), date:formatDate(e.date), category:String(e.category), payer:String(e.payer),
    amount:Number(e.amount), participants:String(e.participants).split(',').filter(Boolean),
    note:String(e.note||''), createdAt:String(e.createdAt||''),
    deleted: String(e.deleted).toUpperCase() === 'TRUE'
  }));
  return {config, families, expenses};
}

function formatDate(v){
  if (v instanceof Date){ return Utilities.formatDate(v, ss().getSpreadsheetTimeZone(), 'yyyy-MM-dd'); }
  return String(v);
}

function doGet(e){
  try { return json({ok:true, data: readAll()}); }
  catch(err){ return json({ok:false, error:String(err)}); }
}

function doPost(e){
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const body = JSON.parse(e.postData.contents);
    const r = handle(body);
    return json({ok:true, data:r});
  } catch(err){
    return json({ok:false, error:String(err)});
  } finally { try{lock.releaseLock();}catch(e){} }
}

function findRow(name, id){
  const sh = sheet(name); const vals = sh.getDataRange().getValues();
  for (let i=1;i<vals.length;i++){ if (String(vals[i][0]) === String(id)) return i+1; } // 1-based row
  return -1;
}
function colIndex(name, col){ return sheet(name).getDataRange().getValues()[0].indexOf(col) + 1; }

function handle(b){
  switch(b.action){
    case 'addExpense': {
      const id = 'e' + Date.now();
      sheet(SHEET_EXP).appendRow([id, b.date, b.category, b.payer, Number(b.amount), (b.participants||[]).join(','), b.note||'', new Date().toISOString(), 'FALSE']);
      return {id};
    }
    case 'updateExpense': {
      const row = findRow(SHEET_EXP, b.id); if (row<0) throw 'not found';
      const sh = sheet(SHEET_EXP);
      sh.getRange(row, colIndex(SHEET_EXP,'date')).setValue(b.date);
      sh.getRange(row, colIndex(SHEET_EXP,'category')).setValue(b.category);
      sh.getRange(row, colIndex(SHEET_EXP,'payer')).setValue(b.payer);
      sh.getRange(row, colIndex(SHEET_EXP,'amount')).setValue(Number(b.amount));
      sh.getRange(row, colIndex(SHEET_EXP,'participants')).setValue((b.participants||[]).join(','));
      sh.getRange(row, colIndex(SHEET_EXP,'note')).setValue(b.note||'');
      return {id:b.id};
    }
    case 'deleteExpense': {
      const row = findRow(SHEET_EXP, b.id); if (row<0) throw 'not found';
      sheet(SHEET_EXP).getRange(row, colIndex(SHEET_EXP,'deleted')).setValue('TRUE');
      return {id:b.id};
    }
    case 'addFamily': {
      const id = 'f' + Date.now();
      sheet(SHEET_FAM).appendRow([id, b.name, 'TRUE']);
      return {id};
    }
    case 'renameFamily': {
      const row = findRow(SHEET_FAM, b.id); if (row<0) throw 'not found';
      sheet(SHEET_FAM).getRange(row, colIndex(SHEET_FAM,'name')).setValue(b.name);
      return {id:b.id};
    }
    case 'setFamilyActive': {
      const row = findRow(SHEET_FAM, b.id); if (row<0) throw 'not found';
      sheet(SHEET_FAM).getRange(row, colIndex(SHEET_FAM,'active')).setValue(b.active ? 'TRUE' : 'FALSE');
      return {id:b.id};
    }
    case 'setConfig': {
      const row = findRow(SHEET_CFG, b.key);
      if (row<0){ sheet(SHEET_CFG).appendRow([b.key, b.value]); }
      else { sheet(SHEET_CFG).getRange(row, colIndex(SHEET_CFG,'value')).setValue(b.value); }
      return {key:b.key};
    }
    default: throw 'unknown action: ' + b.action;
  }
}
```

- [ ] **Step 2: 手動驗證**（部署後）

跟 `SETUP.md` 部署 → 瀏覽器開 `<WebAppURL>?action=bootstrap`，Expected：見到 `{"ok":true,"data":{...}}` JSON。

---

### Task 3: SETUP.md（Sheet + 部署步驟）

**Files:**
- Create: `SETUP.md`

- [ ] **Step 1: 寫 `SETUP.md`**，內容包含：
  1. 建 Google Sheet，建三個分頁，標題列如下（第一行）：
     - `Config`：`key | value`；初始兩行 `currency | JPY`、`categories | 住宿,食物,交通,補給,零食,門票,其他`
     - `Families`：`id | name | active`；初始 `f1 家庭一 TRUE`、`f2 家庭二 TRUE`、`f3 家庭三 TRUE`
     - `Expenses`：`id | date | category | payer | amount | participants | note | createdAt | deleted`（只標題）
  2. 擴充功能 → Apps Script → 貼 `Code.gs` → 儲存。
  3. 部署 → 新增部署 → 類型「網頁應用程式」→ 執行身分：我自己；具存取權：任何人 → 部署 → 授權 → copy Web App URL。
  4. `index.html` 頂部 `API_URL` 貼上該 URL。
  5. 將 `index.html` + `settlement.js` push 去 `wyho1029/Expenses` repo → Settings → Pages → 由 `main` 分支 root 發佈 → 開 `wyho1029.github.io/Expenses`。

- [ ] **Step 2:** 無自動測試；由用戶跟步驟完成。

---

### Task 4: 前端 index.html

**Files:**
- Create: `index.html`

**Interfaces:**
- Consumes: `settleDebts`（Task 1）、Apps Script API（Task 2）。
- 內部：`API_URL` 常數；`api(action, payload)` 封裝（GET bootstrap / POST 其他）；`state = {config, families, expenses}`；`render()` 重畫。

- [ ] **Step 1: 寫 `index.html`**，包含：
  - `<script src="settlement.js"></script>`
  - **載入**：`bootstrap()` → GET → 存 `state` → `render()`。於 `load`、`window.focus`、撳「刷新」、每次寫入成功後呼叫。
  - **api() 封裝**：寫入用 `fetch(API_URL, {method:'POST', headers:{'Content-Type':'text/plain'}, body: JSON.stringify({action,...})})`。
  - **入數表單**：日期 `<input type="date">`（預設 `today`）、類別 `<select>`（`config.categories`）、俾錢家庭 `<select>`（active families；預設 localStorage `myFamily`）、金額 `<input type="number">`、參與家庭 checkbox（active families，預設全剔）、備註。提交 → `addExpense`。
  - **清單**：按日期倒序、隱藏 deleted；每筆顯示日期/類別/俾錢家/金額（用 `config.currency` 格式）/參與家/備註；改（inline 或彈窗 → `updateExpense`）、刪（`deleteExpense`，確認）。按家庭/類別篩選。
  - **結算**：`settleDebts(state.expenses, state.families)` → 顯示每家淨額（色）+ 過數清單「家庭X 要俾 $Y 畀 家庭Z」。
  - **設定**：貨幣 `<select>`（optgroup 置頂：USD 美金/CNY 人民幣/HKD 港幣/JPY 日元/TWD 台幣；再一個 optgroup 完整 ISO 清單）→ `setConfig currency`；類別編輯 → `setConfig categories`；家庭管理（`addFamily`/`renameFamily`/`setFamilyActive`）；「我係邊家」存 localStorage。
  - **金額格式**：`formatMoney(n)` 依貨幣小數位（JPY/TWD/KRW=0，其餘=2）+ 符號。
  - 響應式、手機優先、深色友善。無外部資源。

- [ ] **Step 2: 驗證**：本機用 `python -m http.server` 或直接開檔（配合已部署 API）；兩部裝置一部入數、另一部刷新見到。結算頁對一個手算例子。

---

## Self-Review

- **Spec coverage**：架構(Task2/3/4)、資料模型(Task3)、API(Task2)、UI 各畫面(Task4)、結算演算法(Task1)、貨幣下拉(Task4)、部署步驟(Task3)、結算測試(Task1) — 全覆蓋。
- **Placeholder scan**：無 TBD/TODO；Code.gs、settlement.js、測試為完整程式碼；index.html 因體積大以「章節 + 精確函式簽名」描述（同 session 實作，非交陌生人）。
- **Type consistency**：`settleDebts(expenses, families)`、`{nets, transfers}`、family `{id,name,active}`、expense 欄位於 Task1/2/4 一致；API action 名於 Task2/4 一致。
