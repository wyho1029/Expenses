// 純結算數學：計每家淨額 + 最少筆過數。瀏覽器同 Node 雙用。
function round2(n){ return Math.round((n + Number.EPSILON) * 100) / 100; }

// e.splitMode==='custom' 時用 e.shares={famId: 金額}（已折合結算貨幣）；否則按家庭平分
function settleDebts(expenses, families){
  const nets = {};
  for (const f of families) nets[f.id] = 0;
  for (const e of expenses){
    if (e.deleted) continue;
    const parts = e.participants || [];
    if (!parts.length) continue;
    if (nets[e.payer] === undefined) nets[e.payer] = 0;
    nets[e.payer] += e.amount;
    if (e.splitMode === 'custom' && e.shares){
      // 自訂金額：逐家實數
      for (const p of parts){ if (nets[p] === undefined) nets[p] = 0; nets[p] -= (Number(e.shares[p]) || 0); }
    } else {
      // 按家庭平分
      const share = e.amount / parts.length;
      for (const p of parts){ if (nets[p] === undefined) nets[p] = 0; nets[p] -= share; }
    }
  }
  for (const k in nets) nets[k] = round2(nets[k]);

  // 貪心：最大債仔配最大債主，過數至歸零 → ≤ (家庭數-1) 筆
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

// 幾家人一齊入數，好易撞單。同 trip、同日、同類別、同金額、同貨幣 = 疑似重覆。
function findDupe(expenses, cand){
  return expenses.find(e => !e.deleted && e.id !== cand.id && e.trip === cand.trip
    && e.date === cand.date && e.category === cand.category
    && (e.currency || '') === (cand.currency || '')
    && Math.abs(e.amount - cand.amount) < 0.005) || null;
}

// 離線寫入佇列：逐個送，送成功先至由 queue 剝走（原地 mutate，由 caller 存返落 localStorage）。
// send 掟錯 = 冇網 → 剩返嘅原封不動留低下次再試；伺服器答咗但 !ok = 資料有問題 → 掉咗佢唔好卡死條隊。
async function flushQueue(queue, send){
  let rejected = null;
  while (queue.length){
    let res;
    try{ res = await send(queue[0].action, queue[0].payload); }
    catch(e){ return { offline:true, rejected }; }
    queue.shift();
    if (!res || !res.ok) rejected = (res && res.error) || '未知錯誤';
  }
  return { offline:false, rejected };
}

if (typeof module !== 'undefined') module.exports = { settleDebts, findDupe, flushQueue };
if (typeof window !== 'undefined'){ window.settleDebts = settleDebts; window.findDupe = findDupe; window.flushQueue = flushQueue; }
