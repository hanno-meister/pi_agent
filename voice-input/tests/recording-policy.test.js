import assert from "node:assert/strict";
import test from "node:test";

import {
  audioBitsPerSecond,
  stopAtDurationLimit,
} from "../public/recording-policy.js";

test("the duration bound stops local capture synchronously", () => {
  let stopped = false;

  stopAtDurationLimit(() => {
    stopped = true;
  });

  assert.equal(stopped, true);
  assert.equal(audioBitsPerSecond, 128_000);
});
