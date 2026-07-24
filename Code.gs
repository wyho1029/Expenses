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
  const expenses = rows(SHEET_EXP).map(e=>({
    id:String(e.id), date:formatDate(e.date), category:String(e.category), payer:String(e.payer),
    amount:Number(e.amount), participants:String(e.participants).split(',').filter(Boolean),
    note:String(e.note||''), createdAt:String(e.createdAt||''),
    deleted: String(e.deleted).toUpperCase() === 'TRUE'
  }));
  return {config, families, expenses};
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
