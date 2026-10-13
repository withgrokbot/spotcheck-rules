import test from "node:test";
import assert from "node:assert/strict";
import { judgeRequirement as j, judge402, rulesBeforePaymentHook, SKIP_CODES, USDC, BASE_MAINNET, SOLANA_MAINNET } from "../index.js";

const PAYTO = "0x" + "ab".repeat(20);
const SOL_PAYTO = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const base = (o = {}) => ({ scheme: "exact", network: BASE_MAINNET, amount: "10000", asset: USDC[BASE_MAINNET], payTo: PAYTO, ...o });
const sol = (o = {}) => ({ scheme: "exact", network: SOLANA_MAINNET, amount: "10000", asset: USDC[SOLANA_MAINNET], payTo: SOL_PAYTO, ...o });

test("skip codes are a subset of 402xAgent rules.json skip codes", () => {
  const rulesJsonSkip = ["price_mismatch", "pay_to_mismatch", "network_mismatch", "asset_not_usdc", "network_unsupported", "ssrf_blocked", "no_paywall", "bad_challenge", "ambiguous"];
  for (const c of SKIP_CODES) assert.ok(rulesJsonSkip.includes(c), c);
});
test("Base: sane USDC terms pay; listing price ok / below / above", () => {
  assert.equal(j(base()).verdict, "pay");
  assert.equal(j(base(), { listing: { price: 0.01 } }).reason_code, "price_ok");
  assert.equal(j(base({ amount: "10100" }), { listing: { price: 0.01 } }).reason_code, "price_ok", "within 1%");
  assert.equal(j(base({ amount: "5000" }), { listing: { price: 0.01 } }).reason_code, "price_below_listing");
  assert.deepEqual([j(base({ amount: "10200" }), { listing: { price: 0.01 } }).verdict, j(base({ amount: "10200" }), { listing: { price: 0.01 } }).reason_code], ["skip", "price_mismatch"]);
});
test("Base: pay_to, network, asset, unreadable terms", () => {
  assert.equal(j(base(), { listing: { payTo: PAYTO.toUpperCase().replace("0X", "0x") } }).verdict, "pay", "EVM case-insensitive");
  assert.equal(j(base(), { listing: { payTo: "0x" + "cd".repeat(20) } }).reason_code, "pay_to_mismatch");
  assert.equal(j(base(), { listing: { network: "eip155:84532" } }).reason_code, "network_mismatch");
  assert.equal(j(base({ network: "base" }), { listing: { network: "eip155:8453" } }).verdict, "pay", "v1 alias");
  assert.equal(j(base({ asset: "0x" + "99".repeat(20) })).reason_code, "asset_not_usdc");
  for (const bad of [base({ amount: "1.5" }), base({ amount: undefined }), base({ payTo: "nope" }), base({ asset: "" })]) assert.equal(j(bad).reason_code, "bad_challenge");
  assert.equal(j(base({ amount: undefined, maxAmountRequired: "10000" })).verdict, "pay", "v1 amount field");
});
test("non-Base chains pass through untouched by default; Solana opt-in, case-sensitive", () => {
  for (const r of [sol({ asset: "junk" }), base({ network: "eip155:84532", asset: "junk" }), base({ network: "eip155:1", payTo: "x" })]) {
    const d = j(r, { listing: { payTo: "0x" + "cd".repeat(20), price: 0 } });
    assert.deepEqual([d.verdict, d.checked], ["pay", false]);
  }
  assert.equal(j(sol(), { solana: true, listing: { payTo: SOL_PAYTO, price: 0.01 } }).reason_code, "price_ok");
  assert.equal(j(sol(), { solana: true, listing: { payTo: SOL_PAYTO.toLowerCase() } }).reason_code, "pay_to_mismatch");
  assert.equal(j(sol({ asset: USDC[SOLANA_MAINNET].toLowerCase() }), { solana: true }).reason_code, "asset_not_usdc");
});
test("unknown or garbage input pays", () => {
  for (const x of [null, undefined, {}, "x", 42, { network: {} }]) assert.equal(j(x).verdict, "pay");
  assert.equal(judge402({}).verdict, "pay");
  assert.equal(judge402(null).verdict, "pay");
  const evil = { get network() { throw new Error("boom"); } };
  assert.equal(j(evil).verdict, "pay");
});
test("judge402 keeps the accepts that pass", () => {
  const r = judge402({ accepts: [base({ asset: "0x" + "99".repeat(20) }), base()] });
  assert.equal(r.verdict, "pay");
  assert.equal(r.kept.length, 1);
  assert.equal(judge402({ accepts: [base({ payTo: "bad" })] }).reason_code, "bad_challenge");
});
test("x402 onBeforePaymentCreation hook: aborts only on a skip code; never throws", async () => {
  const ctx = (r) => ({ paymentRequired: { x402Version: 2, resource: { url: "https://s.test/api" }, accepts: [r] }, selectedRequirements: r });
  assert.equal(await rulesBeforePaymentHook()(ctx(base())), undefined);
  const res = await rulesBeforePaymentHook({ listing: (url) => (url === "https://s.test/api" ? { payTo: "0x" + "cd".repeat(20) } : undefined) })(ctx(base()));
  assert.equal(res.abort, true);
  assert.match(res.reason, /pay_to_mismatch/);
  assert.equal(await rulesBeforePaymentHook({ listing: () => { throw new Error("db"); } })(ctx(base())), undefined, "listing error = pay");
  assert.equal(await rulesBeforePaymentHook({ onDecision: () => { throw new Error("x"); } })(ctx(base())), undefined);
  assert.equal(await rulesBeforePaymentHook()(undefined), undefined);
});
test("no network: the module never touches fetch", async () => {
  const orig = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("no"); };
  try { await rulesBeforePaymentHook({ listing: { price: 0.01 } })({ paymentRequired: {}, selectedRequirements: base() }); j(base()); judge402({ accepts: [base()] }); }
  finally { globalThis.fetch = orig; }
  assert.equal(calls, 0);
});
