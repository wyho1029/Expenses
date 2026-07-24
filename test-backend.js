// 模擬 Code.gs 嘅通用資料層（in-memory 2D array），驗證自動加欄 + upsert 邏輯。
// 用 sheet = [][], 第一行為 header。呢個係 Code.gs 演算法嘅忠實 Node 版本。
const assert = require('assert');

function headers(sheet){ return sheet.length ? sheet[0].map(String) : []; }
function ensureColumns(sheet, keys){
  if (!sheet.length) sheet.push([]); // header row
  const head = headers(sheet);
  keys.forEach(k=>{ if (head.indexOf(k) === -1){ head.push(k); sheet[0].push(k); } });
  return head;
}
function append(sheet, values){
  const head = ensureColumns(sheet, Object.keys(values));
  sheet.push(head.map(h=> values[h] !== undefined ? values[h] : ''));
}
function update(sheet, idField, id, values){
  const head = ensureColumns(sheet, [idField].concat(Object.keys(values)));
  const idc = head.indexOf(idField);
  for (let i=1;i<sheet.length;i++){
    while (sheet[i].length < head.length) sheet[i].push('');
    if (String(sheet[i][idc]) === String(id)){
      head.forEach((h,c)=>{ if (values[h] !== undefined) sheet[i][c] = values[h]; });
      return 'updated';
    }
  }
  sheet.push(head.map(h=> h===idField ? id : (values[h] !== undefined ? values[h] : '')));
  return 'inserted';
}
function rowsOf(sheet){
  // 模擬真實 Sheets：getValues() 永遠矩形，缺格 = ''
  const head = headers(sheet);
  return sheet.slice(1).filter(r=>String(r[0])!=='').map(r=>{ const o={}; head.forEach((h,i)=>o[h]= i<r.length ? r[i] : ''); return o; });
}

// 1. append 去空白 sheet：建立 header + 一行
{
  const s = [];
  append(s, {id:'f1', name:'陳家', active:'TRUE'});
  assert.deepStrictEqual(headers(s), ['id','name','active']);
  assert.deepStrictEqual(rowsOf(s)[0], {id:'f1', name:'陳家', active:'TRUE'});
}

// 2. append 帶新 key（trip）→ 自動加欄，舊行嗰欄留空
{
  const s = [];
  append(s, {id:'e1', amount:100});                 // header: id, amount
  append(s, {id:'e2', amount:200, trip:'t1'});       // 加 trip 欄
  assert.deepStrictEqual(headers(s), ['id','amount','trip']);
  assert.strictEqual(rowsOf(s)[0].trip, '');          // e1 冇 trip
  assert.strictEqual(rowsOf(s)[1].trip, 't1');
}

// 3. update 現有行
{
  const s = [];
  append(s, {id:'t1', name:'東京', currency:'JPY', archived:'FALSE'});
  assert.strictEqual(update(s, 'id', 't1', {archived:'TRUE'}), 'updated');
  assert.strictEqual(rowsOf(s)[0].archived, 'TRUE');
  assert.strictEqual(rowsOf(s)[0].name, '東京'); // 其他欄不變
}

// 4. update 唔存在 → upsert 新增（第一欄=id）
{
  const s = [];
  append(s, {id:'e1', deleted:'FALSE'});
  assert.strictEqual(update(s, 'id', 'e999', {deleted:'TRUE'}), 'inserted');
  const r = rowsOf(s).find(x=>x.id==='e999');
  assert.strictEqual(r.deleted, 'TRUE');
}

// 5. Config 用 'key' 做 idField 嘅 upsert
{
  const s = [];
  assert.strictEqual(update(s, 'key', 'categories', {value:'食,住'}), 'inserted');
  assert.deepStrictEqual(rowsOf(s)[0], {key:'categories', value:'食,住'});
  update(s, 'key', 'categories', {value:'食,住,行'});
  assert.strictEqual(rowsOf(s)[0].value, '食,住,行');
}

console.log('BACKEND LOGIC SELF-CHECK PASS');
