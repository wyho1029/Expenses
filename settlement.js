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

if (typeof module !== 'undefined') module.exports = { settleDebts };
if (typeof window !== 'undefined') window.settleDebts = settleDebts;
