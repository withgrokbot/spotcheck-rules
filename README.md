# spotcheck-rules

Judge an x402 402 you already received, locally. It checks that the terms are sane, matches them against your listing if you have one, and checks the network, asset and amount. There are no network calls, no dependencies and no service. MIT.

```bash
npm i github:withgrokbot/spotcheck-rules#v1.0.0
```

```js
import { judgeRequirement, judge402, rulesBeforePaymentHook } from "spotcheck-rules";

judgeRequirement(paymentRequired.accepts[0], { listing: { price: 0.01, payTo: "0x…", network: "eip155:8453" } });
// -> { verdict: "pay" | "skip", reason_code, reason, checked }

// x402 (x402-foundation/x402 @x402/core) hook: register it after your spending cap
client.onBeforePaymentCreation(rulesBeforePaymentHook({ listing: (url) => myListing.get(url) }));
```

## Rules

These apply only to Base mainnet (`eip155:8453`, or v1 `base`) by default. Requirements on any other network pass through untouched (`verdict: "pay"`, `checked: false`). Solana mainnet is opt-in with `{ solana: true }`; its addresses are compared case-sensitively.

| reason_code | verdict | when |
|---|---|---|
| `network_mismatch` | skip | a listing network is given and the 402 asks for a different one |
| `bad_challenge` | skip | the amount is not an integer, the pay-to address is invalid, or the asset is missing |
| `asset_not_usdc` | skip | the asset is not that network's canonical USDC |
| `pay_to_mismatch` | skip | a listing payTo is given and the 402 pays a different wallet |
| `price_mismatch` | skip | a listing price is given and the 402 asks more than 1% above it |
| `price_below_listing` | pay | more than 1% below the listing price |
| `price_ok` | pay | within 1% of the listing price |
| `null` | pay | no listing price to compare, network not judged, unreadable input, or any error |

The codes are the ones in [402xAgent's rules.json](https://402xagent.com/rules.json). A skip always carries one of them. Unknown means pay.

## Semver promise

The verdict behavior changes only on a major version. Minor and patch releases never turn a `pay` into a `skip`. Pin exactly: `"spotcheck-rules": "github:withgrokbot/spotcheck-rules#v1.0.0"`.

`npm test` (node:test) covers each rule, garbage input, the hook, and that `fetch` is never touched.
