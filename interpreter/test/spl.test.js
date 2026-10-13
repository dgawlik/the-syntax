import assert from "node:assert/strict";
import test from "node:test";
import { parseSpl, prepareExecution } from "../src/spl.js";

test("parses persisted JSON-native variable declarations", () => {
  const program = parseSpl("@{SPL/1}\n\n$> let $name = 'Ada'\nlet $tags = ['spl', 'sdk']\nout 'Hello $name'\n");
  assert.deepEqual(program.variables, { name: "Ada", tags: ["spl", "sdk"] });
});

test("returns the SPL failure shape for a known failed assertion", () => {
  const program = parseSpl("@{SPL/1}\n\n$> assert 'false' -> 'Not ready.'\nout 'Continue'\n");
  assert.deepEqual(prepareExecution(program, {}).failure, { status: "failure", reason: "Not ready." });
});

test("rejects missing headers and duplicate declarations", () => {
  assert.throws(() => parseSpl("out 'Hello'"), /must begin/);
  assert.throws(
    () => parseSpl("@{SPL/1}\n\n$> let $name = 'Ada'\nlet $name = 'Grace'\n"),
    /declared more than once/
  );
});
