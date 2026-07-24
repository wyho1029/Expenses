const SHEET_EXP = 'Expenses';
const SHEET_FAM = 'Families';
const SHEET_CFG = 'Config';
const SHEET_TRIP = 'Trips';

// 每個分頁應有嘅標題列（用嚟自動建立 / 補齊）
const SCHEMA = {
  'Config':   ['key','value'],
  'Families': ['id','name','active'],
  'Trips':    ['id','name','currency','archived'],
  'Expenses': ['id','date','category','payer','amount','participants','note','createdAt','deleted','trip'],
};

function ss(){ return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet(n){ return ss().getSheetByName(n); }
function json(obj){ return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

// 自動建立缺少嘅分頁，並補齊空白嘅標題格（唔會覆蓋已有內容）
function ensureSchema(){
  const s = ss();
  for (const name in SCHEMA){
    let sh = s.getSheetByName(name);
    if (!sh) sh = s.insertSheet(name);
    const headers = SCHEMA[name];
    for (let i=0;i<headers.length;i++){
      const cell = sh.getRange(1, i+1);
      if (String(cell.getValue()) === '') cell.setValue(headers[i]);
    }
  }
}

function rows(name){
  const sh = sheet(name); const vals = sh.getDataRange().getValues();
  const head = vals.shift();
  return vals.filter(r=>r[0] !== '').map(r=>{ const o={}; head.forEach((h,i)=>o[h]=r[i]); return o; });
}

function formatDate(v){
  if (v instanceof Date){ return Utilities.formatDate(v, ss().getSpreadsheetTimeZone(), 'yyyy-MM-dd'); }
  return String(v);
}

function readAll(){
  const cfgRows = rows(SHEET_CFG);
  const config = {}; cfgRows.forEach(r=>config[r.key]=String(r.value));
  const families = rows(SHEET_FAM).map(f=>({
    id:String(f.id), name:String(f.name),
    active: f.active !== false && String(f.active).toUpperCase() !== 'FALSE'
  }));
  const trips = rows(SHEET_TRIP).map(t=>({
    id:String(t.id), name:String(t.name), currency:String(t.currency||''),
    archived: String(t.archived).toUpperCase() === 'TRUE'
  }));
  const expenses = rows(SHEET_EXP).map(e=>({
    id:String(e.id), date:formatDate(e.date), category:String(e.category), payer:String(e.payer),
    amount:Number(e.amount), participants:String(e.participants).split(',').filter(Boolean),
    note:String(e.note||''), createdAt:String(e.createdAt||''),
    deleted: String(e.deleted).toUpperCase() === 'TRUE', trip:String(e.trip||'')
  }));
  return {config, families, trips, expenses};
}

function doGet(e){
  try { ensureSchema(); return json({ok:true, data: readAll()}); }
  catch(err){ return json({ok:false, error:String(err)}); }
}

function doPost(e){
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    ensureSchema();
    const body = JSON.parse(e.postData.contents);
    return json({ok:true, data: handle(body)});
  } catch(err){
    return json({ok:false, error:String(err)});
  } finally { try{lock.releaseLock();}catch(e){} }
}

function findRow(name, id){
  const sh = sheet(name); const vals = sh.getDataRange().getValues();
  for (let i=1;i<vals.length;i++){ if (String(vals[i][0]) === String(id)) return i+1; }
  return -1;
}
function colIndex(name, col){ return sheet(name).getDataRange().getValues()[0].indexOf(col) + 1; }
function setCell(name, row, col, val){ sheet(name).getRange(row, colIndex(name, col)).setValue(val); }

function handle(b){
  switch(b.action){
    case 'addTrip': {
      const id = 't' + Date.now();
      sheet(SHEET_TRIP).appendRow([id, b.name, b.currency||'', 'FALSE']);
      return {id};
    }
    case 'updateTrip': {
      const row = findRow(SHEET_TRIP, b.id); if (row<0) throw 'trip not found';
      if (b.name !== undefined) setCell(SHEET_TRIP, row, 'name', b.name);
      if (b.currency !== undefined) setCell(SHEET_TRIP, row, 'currency', b.currency);
      if (b.archived !== undefined) setCell(SHEET_TRIP, row, 'archived', b.archived ? 'TRUE' : 'FALSE');
      return {id:b.id};
    }
    case 'addExpense': {
      const id = 'e' + Date.now();
      sheet(SHEET_EXP).appendRow([id, b.date, b.category, b.payer, Number(b.amount), (b.participants||[]).join(','), b.note||'', new Date().toISOString(), 'FALSE', b.trip||'']);
      return {id};
    }
    case 'updateExpense': {
      const row = findRow(SHEET_EXP, b.id); if (row<0) throw 'not found';
      setCell(SHEET_EXP, row, 'date', b.date);
      setCell(SHEET_EXP, row, 'category', b.category);
      setCell(SHEET_EXP, row, 'payer', b.payer);
      setCell(SHEET_EXP, row, 'amount', Number(b.amount));
      setCell(SHEET_EXP, row, 'participants', (b.participants||[]).join(','));
      setCell(SHEET_EXP, row, 'note', b.note||'');
      if (b.trip !== undefined) setCell(SHEET_EXP, row, 'trip', b.trip);
      return {id:b.id};
    }
    case 'deleteExpense': {
      const row = findRow(SHEET_EXP, b.id); if (row<0) throw 'not found';
      setCell(SHEET_EXP, row, 'deleted', 'TRUE');
      return {id:b.id};
    }
    case 'addFamily': {
      const id = 'f' + Date.now();
      sheet(SHEET_FAM).appendRow([id, b.name, 'TRUE']);
      return {id};
    }
    case 'renameFamily': {
      const row = findRow(SHEET_FAM, b.id); if (row<0) throw 'not found';
      setCell(SHEET_FAM, row, 'name', b.name);
      return {id:b.id};
    }
    case 'setFamilyActive': {
      const row = findRow(SHEET_FAM, b.id); if (row<0) throw 'not found';
      setCell(SHEET_FAM, row, 'active', b.active ? 'TRUE' : 'FALSE');
      return {id:b.id};
    }
    case 'setConfig': {
      const row = findRow(SHEET_CFG, b.key);
      if (row<0){ sheet(SHEET_CFG).appendRow([b.key, b.value]); }
      else { setCell(SHEET_CFG, row, 'value', b.value); }
      return {key:b.key};
    }
    default: throw 'unknown action: ' + b.action;
  }
}
