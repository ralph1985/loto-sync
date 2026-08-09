import assert from "node:assert/strict";
import test from "node:test";

import { shouldCloseModalOnEscape } from "./modal-behavior.ts";

test("cierra el modal con Escape cuando está habilitado", () => {
  assert.equal(shouldCloseModalOnEscape("Escape", false), true);
  assert.equal(shouldCloseModalOnEscape("Enter", false), false);
});

test("mantiene abierto el modal durante una operación bloqueante", () => {
  assert.equal(shouldCloseModalOnEscape("Escape", true), false);
});
