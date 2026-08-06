const assert = require('assert');
const { settleDebts, findDupe, flushQueue } = require('./settlement.js');

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
  assert.strictEqual(transfers.reduce((s,t)=>s+t.amount,0), 500);
  assert.ok(transfers.length <= 2);
}

// 4. deleted 開支要略過
{
  const exp = [{payer:'f1', amount:999, participants:['f1','f2'], deleted:true}];
  const { transfers } = settleDebts(exp, fams);
  assert.deepStrictEqual(transfers, []);
}

// 5. 分唔盡（3 家分 100）殘差可接受、總過數對得返
{
  const exp = [{payer:'f1', amount:100, participants:['f1','f2','f3']}];
  const { nets, transfers } = settleDebts(exp, fams);
  assert.strictEqual(nets.f2, -33.33);
  assert.strictEqual(nets.f3, -33.33);
  const total = transfers.reduce((s,t)=>s+t.amount,0);
  assert.ok(Math.abs(total - 66.66) < 0.02);
}

// 6. 自訂金額：住宿 A 俾晒 5000，實數 A2600/B1500/C900
{
  const exp = [{payer:'f1', amount:5000, participants:['f1','f2','f3'], splitMode:'custom', shares:{f1:2600,f2:1500,f3:900}}];
  const { nets, transfers } = settleDebts(exp, fams);
  assert.strictEqual(nets.f1, 2400);   // 俾 5000 - 自己 2600
  assert.strictEqual(nets.f2, -1500);
  assert.strictEqual(nets.f3, -900);
  const bf = Object.fromEntries(transfers.map(t=>[t.from, t]));
  assert.strictEqual(bf.f2.to, 'f1'); assert.strictEqual(bf.f2.amount, 1500);
  assert.strictEqual(bf.f3.to, 'f1'); assert.strictEqual(bf.f3.amount, 900);
}

// 7. 重覆入數偵測
{
  const base = {id:'e1', trip:'t1', date:'2026-08-01', category:'食物', amount:1200, currency:'TWD'};
  const list = [base];
  // 一模一樣（另一家撞單）→ 揀得返
  assert.strictEqual(findDupe(list, {id:'e2', trip:'t1', date:'2026-08-01', category:'食物', amount:1200, currency:'TWD'}).id, 'e1');
  // 自己編輯自己唔算重覆
  assert.strictEqual(findDupe(list, base), null);
  // 日期／類別／金額／貨幣／trip 任何一樣唔同都唔算
  assert.strictEqual(findDupe(list, {id:'e2', trip:'t1', date:'2026-08-02', category:'食物', amount:1200, currency:'TWD'}), null);
  assert.strictEqual(findDupe(list, {id:'e2', trip:'t1', date:'2026-08-01', category:'交通', amount:1200, currency:'TWD'}), null);
  assert.strictEqual(findDupe(list, {id:'e2', trip:'t1', date:'2026-08-01', category:'食物', amount:1201, currency:'TWD'}), null);
  assert.strictEqual(findDupe(list, {id:'e2', trip:'t1', date:'2026-08-01', category:'食物', amount:1200, currency:'HKD'}), null);
  assert.strictEqual(findDupe(list, {id:'e2', trip:'t2', date:'2026-08-01', category:'食物', amount:1200, currency:'TWD'}), null);
  // 已刪除嘅唔會當重覆
  assert.strictEqual(findDupe([Object.assign({}, base, {deleted:true})], {id:'e2', trip:'t1', date:'2026-08-01', category:'食物', amount:1200, currency:'TWD'}), null);
  // 多咗空格／貨幣細楷都要照捉到（Sheet 讀返嚟嘅字串唔一定乾淨）
  assert.strictEqual(findDupe(list, {id:'e2', trip:' t1 ', date:'2026-08-01 ', category:' 食物', amount:1200, currency:'twd'}).id, 'e1');
  // 貨幣一個空白一個 undefined = 兩邊都當空，照捉
  assert.strictEqual(findDupe([{id:'e9', trip:'t1', date:'2026-08-01', category:'食物', amount:50}],
    {id:'e2', trip:'t1', date:'2026-08-01', category:'食物', amount:50, currency:''}).id, 'e9');
}

// 8. 離線佇列：斷網要保住未送嘅，唔可以蝕咗筆數
(async ()=>{
  const q = [{action:'a',payload:1},{action:'b',payload:2},{action:'c',payload:3}];
  let n = 0;
  let r = await flushQueue(q, async ()=>{ if (++n === 2) throw new Error('offline'); return {ok:true}; });
  assert.strictEqual(r.offline, true);
  assert.deepStrictEqual(q.map(x=>x.action), ['b','c']);   // 第 1 個送咗，第 2 個死咗 → 留返 b、c
  // 返到網再試，全部清曬
  r = await flushQueue(q, async ()=>({ok:true}));
  assert.strictEqual(r.offline, false);
  assert.strictEqual(r.rejected, null);
  assert.strictEqual(q.length, 0);
  // 伺服器拒絕（唔係冇網）→ 唔好卡死條隊，掉咗佢繼續行
  const q2 = [{action:'a'},{action:'b'}];
  r = await flushQueue(q2, async (a)=> a==='a' ? {ok:false, error:'壞資料'} : {ok:true});
  assert.strictEqual(q2.length, 0);
  assert.strictEqual(r.rejected, '壞資料');
  console.log('SETTLEMENT SELF-CHECK PASS');
})();
