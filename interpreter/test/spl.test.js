import assert from "node:assert/strict";
import test from "node:test";
import { parseSpl, prepareExecution, validateResponse } from "../src/spl.js";

test("parses persisted JSON-native variable declarations", () => {
  const program = parseSpl("@{SPL/1}\n\n$> let $name = 'Ada'\nlet $tags = ['spl', 'sdk']\nout 'Hello $name'\n");
  assert.deepEqual(program.variables, { name: "Ada", tags: ["spl", "sdk"] });
});

test("returns the SPL failure shape for a known failed assertion", () => {
  const program = parseSpl("@{SPL/1}\n\n$> assert 'false' -> 'Not ready.'\nout 'Continue'\n");
  assert.deepEqual(prepareExecution(program, {}).failure, { status: "failure", reason: "Not ready." });
});

test("evaluates strict boolean assertions using persistent variables", () => {
  const passing = parseSpl("@{SPL/1}\n\n$> assert '$buildGreen & defined($reviewer)' -> 'Not ready.'\nout 'Continue'\n");
  assert.equal(prepareExecution(passing, { buildGreen: true, reviewer: "Ada" }).failure, undefined);

  const failing = parseSpl("@{SPL/1}\n\n$> assert '$buildGreen | false' -> 'Build failed.'\nout 'Continue'\n");
  assert.deepEqual(prepareExecution(failing, { buildGreen: false }).failure, {
    status: "failure",
    reason: "Build failed."
  });
});

test("stops on fail with the standard SPL JSON failure shape", () => {
  const program = parseSpl("@{SPL/1}\n\n$> let $name = 'Ada'\nfail 'Missing approval for $name.'\nout 'Continue'\n");
  assert.deepEqual(prepareExecution(program, {}).failure, {
    status: "failure",
    reason: "Missing approval for Ada."
  });
});

test("returns a JSON failure for an assertion that cannot be evaluated", () => {
  const program = parseSpl("@{SPL/1}\n\n$> assert 'the build is green' -> 'Build failed.'\nout 'Continue'\n");
  assert.deepEqual(prepareExecution(program, {}).failure, {
    status: "failure",
    reason: 'Cannot evaluate assertion on line 3: "the build is green" is not a boolean expression. Use true, false, $variable, defined($variable), !, &, |, and parentheses.'
  });
});

test("compiles the out contract into a strict model request", () => {
  const program = parseSpl("@{SPL/1}\n\n$> enforce 'Use a direct tone.'\nout{len=20, sch='string'} 'Give the status.'\n");
  const execution = prepareExecution(program, {});
  assert.equal(execution.contract.len, "20");
  assert.equal(execution.contract.sch, "string");
  assert.match(execution.prompt, /ENFORCE: Use a direct tone\./);
  assert.match(execution.prompt, /LENGTH: at most 20 characters\./);
  assert.match(execution.prompt, /SCHEMA: plain text/);
});

test("rejects output that violates strict length and schema contracts", () => {
  assert.equal(validateResponse("This response is too long.", { len: "5" }), "Response exceeds len=5: received 26 characters.");
  assert.equal(validateResponse("not json", { sch: "object" }), "Response does not satisfy sch=object: it is not valid JSON.");
  assert.equal(validateResponse('{"status":"ok"}', { sch: "object" }), null);
});

test("handles elicit locally without creating an LLM request", () => {
  const program = parseSpl("@{SPL/1}\n\n$> elicit 'Which language should I use?'\n");
  assert.equal(prepareExecution(program, {}).elicitation, "Which language should I use?");
});

test("returns a structured failure for unsupported control flow", () => {
  const program = parseSpl("@{SPL/1}\n\n$> if '$ready':\n    out 'Continue'\n");
  assert.deepEqual(prepareExecution(program, { ready: true }).failure, {
    status: "failure",
    reason: 'Strict SPL execution does not support "if \'$ready\':" on line 3.'
  });
});

test("rejects missing headers and duplicate declarations", () => {
  assert.throws(() => parseSpl("out 'Hello'"), /must begin/);
  assert.throws(
    () => parseSpl("@{SPL/1}\n\n$> let $name = 'Ada'\nlet $name = 'Grace'\n"),
    /declared more than once/
  );
});

test("requires a pseudocode block before SPL commands", () => {
  assert.throws(
    () => parseSpl("@{SPL/1}\n\nlet $name = 'Ada'\n"),
    /Expected "\$>" before the first SPL command/
  );
});
