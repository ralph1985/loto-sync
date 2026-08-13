import test from "node:test";
import assert from "node:assert/strict";

import { isBalanceTracked } from "./group-balance.ts";

test("groups track balance by default", () => {
  assert.equal(isBalanceTracked({ balanceTrackingEnabled: true }), true);
  assert.equal(isBalanceTracked(undefined), true);
});

test("groups can opt out of balance tracking", () => {
  assert.equal(isBalanceTracked({ balanceTrackingEnabled: false }), false);
});
