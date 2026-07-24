// 通用資料層：唔識得任何具體資料類型，淨係做「讀晒 / 加一行 / 改一行」，
// 自動建立缺少嘅分頁同欄。所有商業邏輯都喺前端，所以呢個檔案基本上唔使再改。

function ss(){ return SpreadsheetApp.getActiveSpreadsheet(); }
function json(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function tz(){ return ss().getSpreadsheetTimeZone(); }

function headers(sh){
  if (sh.getLastColumn() < 1) return [];
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
}

function getOrCreateSheet(name){
  return ss().getSheetByName(name) || ss().insertSheet(name);
}

// 確保 keys 全部有欄，缺就喺尾部加，回傳更新後嘅 header 陣列
function ensureColumns(sh, keys){
  const head = headers(sh);
  keys.forEach(k=>{
    if (head.indexOf(k) === -1){
      sh.getRange(1, head.length + 1).setValue(k);
      head.push(k);
    }
  });
  return head;
}

function readSheet(sh){
  const vals = sh.getDataRange().getValues();
  if (vals.length < 1) return [];
  const head = vals.shift().map(String);
  const out = [];
  for (const r of vals){
    if (String(r[0]) === '') continue;
    const o = {};
    head.forEach((h, i)=>{
      if (h === '') return;
      let v = r[i];
      if (v instanceof Date) v = Utilities.formatDate(v, tz(), 'yyyy-MM-dd');
      o[h] = v;
    });
    out.push(o);
  }
  return out;
}

function bootstrap(){
  const sheets = {};
  ss().getSheets().forEach(sh=>{ sheets[sh.getName()] = readSheet(sh); });
  return { sheets };
}

function append(sheetName, values){
  const sh = getOrCreateSheet(sheetName);
  const head = ensureColumns(sh, Object.keys(values));
  sh.appendRow(head.map(h=> values[h] !== undefined ? values[h] : ''));
  return { ok:true };
}

// upsert：搵 idField 欄 === id 嘅一行改，冇就新增
function update(sheetName, idField, id, values){
  const sh = getOrCreateSheet(sheetName);
  const head = ensureColumns(sh, [idField].concat(Object.keys(values)));
  const idc = head.indexOf(idField);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++){
    if (String(data[i][idc]) === String(id)){
      head.forEach((h, c)=>{ if (values[h] !== undefined) sh.getRange(i + 1, c + 1).setValue(values[h]); });
      return { ok:true, updated:true };
    }
  }
  sh.appendRow(head.map(h=> h === idField ? id : (values[h] !== undefined ? values[h] : '')));
  return { ok:true, inserted:true };
}

function doGet(e){
  try { return json({ ok:true, data: bootstrap() }); }
  catch(err){ return json({ ok:false, error:String(err) }); }
}

function doPost(e){
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const b = JSON.parse(e.postData.contents);
    let r;
    if (b.action === 'append') r = append(b.sheet, b.values || {});
    else if (b.action === 'update') r = update(b.sheet, b.idField || 'id', b.id, b.values || {});
    else throw 'unknown action: ' + b.action;
    return json({ ok:true, data:r });
  } catch(err){
    return json({ ok:false, error:String(err) });
  } finally { try{ lock.releaseLock(); }catch(_){ } }
}
