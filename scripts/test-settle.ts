import { computeBalances, settle } from "../lib/balances";
import { naveenOverCap, naveenShares } from "../lib/naveen";
import { canDelete } from "../lib/people";
const P = ["A", "B", "C"];
const { net, total } = computeBalances(
  P,
  [{ amount: 300, paidBy: "A", type: "trip", splitAmong: P, owedTo: null }],
  []
);
console.assert(total === 300 && net.A === 200 && net.B === -100, "balances");
const t = settle(net);
console.assert(t.length === 2 && t.every((x) => x.to === "A" && x.amount === 100), "settle");
const after = computeBalances(P, [{ amount: 300, paidBy: "A", type: "trip", splitAmong: P, owedTo: null }], [{ fromPerson: "B", toPerson: "A", amount: 100 }]);
console.assert(after.net.B === 0 && after.net.A === 100, "settlement reduces");
// Personal lends are included in the combined settle-up
const withLend = computeBalances(
  P,
  [
    { amount: 300, paidBy: "A", type: "trip", splitAmong: P, owedTo: null },
    { amount: 100, paidBy: "B", type: "personal", splitAmong: [], owedTo: "C" },
  ],
  []
);
console.assert(withLend.net.A === 200 && withLend.net.B === 0 && withLend.net.C === -200, "lend in net", withLend.net);
console.assert(withLend.total === 300 && withLend.lent.B === 100 && withLend.borrowed.C === 100, "lend not in trip total");
const lt = settle(withLend.net);
console.assert(lt.length === 1 && lt[0].from === "C" && lt[0].to === "A" && lt[0].amount === 200, "one combined transfer", lt);

// Naveen cap: 21K per person
const N = ["A", "B"];
const base = [{ amount: 40000, type: "trip" as const, splitAmong: N, naveenPayment: "direct" as const }];
console.assert(naveenShares(N, base).paid.A === 20000, "naveen share");
console.assert(naveenOverCap(N, base, { amount: 2000, type: "trip", splitAmong: N, naveenPayment: "indirect" }).length === 0, "exactly 21K ok");
const over = naveenOverCap(N, base, { amount: 1500, type: "trip", splitAmong: ["A"], naveenPayment: "indirect" });
console.assert(over.length === 1 && over[0].person === "A" && over[0].over === 500, "over cap for A only");
console.assert(naveenOverCap(N, base, { amount: 99999, type: "trip", splitAmong: N, naveenPayment: null }).length === 0, "non-naveen ignored");

// Ownership: only who added it, or the admin
const krish = { person: "Krish", isAdmin: false };
const aryan = { person: "Aryan", isAdmin: true };
console.assert(canDelete(krish, "Krish") === true, "own entry");
console.assert(canDelete(krish, "Tejas") === false, "someone else's entry");
console.assert(canDelete(krish, null) === false, "unowned entry: not for non-admin");
console.assert(canDelete(aryan, "Tejas") === true && canDelete(aryan, null) === true, "admin can delete anything");

console.log("ok", t);
