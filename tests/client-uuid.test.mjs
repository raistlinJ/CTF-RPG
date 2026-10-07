// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { clientUuid } from "../lib/client-uuid.mjs";
test("message IDs work on HTTP origins without randomUUID and remain valid unique UUID v4 values", () => {
  const insecureCrypto = {
    getRandomValues: (bytes) => webcrypto.getRandomValues(bytes),
  };
  const ids = Array.from({ length: 1000 }, () => clientUuid(insecureCrypto));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids)
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
});
test("UUID generation uses native secure-context support and reports missing randomness", () => {
  assert.equal(clientUuid({ randomUUID: () => "native-id" }), "native-id");
  assert.throws(() => clientUuid({}), /cannot generate/);
});
