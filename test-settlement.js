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

console.log('SETTLEMENT SELF-CHECK PASS');
