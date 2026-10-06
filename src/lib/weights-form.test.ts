import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { WEIGHT_KEYS } from "./ranking.ts";
import { parseWeightsForm } from "./weights-form.ts";

const DEFAULTS = { warning: "1", minor: "5", major: "10", critical: "15", customer: "3", service: "1" };

const form = (overrides: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...DEFAULTS, ...overrides })) data.append(key, value);
  return data;
};

const errorFor = (value: string) => {
  const result = parseWeightsForm(form({ major: value }));
  assert.ok(!result.ok);
  assert.deepEqual(Object.keys(result.errors), ["major"]);
  return result.errors.major;
};

const INVALID = "Wpisz liczbę od 0 do 1000 z najwyżej dwoma miejscami po przecinku.";

void describe("parseWeightsForm", () => {
  void test("accepts the defaults unchanged", () => {
    assert.deepEqual(parseWeightsForm(form()), { ok: true, values: DEFAULTS });
  });

  void test("normalises comma and trims", () => {
    for (const [input, expected] of [
      ["2,5", "2.5"],
      ["2.5", "2.5"],
      [" 7,25 ", "7.25"],
      ["0", "0"],
      ["1000", "1000"],
      ["1000.00", "1000.00"],
    ] as const) {
      const result = parseWeightsForm(form({ major: input }));
      assert.ok(result.ok, input);
      assert.equal(result.values.major, expected);
    }
  });

  void test("maps each field to its own key", () => {
    const result = parseWeightsForm(form({ customer: "3,5", service: "0,5" }));
    assert.ok(result.ok);
    assert.equal(result.values.customer, "3.5");
    assert.equal(result.values.service, "0.5");
  });

  void test("rejects above 1000", () => {
    assert.equal(errorFor("1000,01"), "Wartość nie może przekraczać 1000.");
    assert.equal(errorFor("1001"), "Wartość nie może przekraczać 1000.");
  });

  void test("rejects malformed numbers", () => {
    for (const input of ["-1", "1,234", "abc", "1e3", "1,", ",5", "1 000"]) {
      assert.equal(errorFor(input), INVALID, input);
    }
  });

  void test("rejects empty and blank", () => {
    assert.equal(errorFor(""), "Podaj wartość.");
    assert.equal(errorFor(" "), "Podaj wartość.");
  });

  void test("rejects a missing field and re-renders raw values", () => {
    const data = form({ major: "abc" });
    data.delete("service");
    const result = parseWeightsForm(data);
    assert.ok(!result.ok);
    assert.deepEqual(Object.keys(result.errors).sort(), ["major", "service"]);
    assert.deepEqual(Object.keys(result.raw), [...WEIGHT_KEYS]);
    assert.equal(result.raw.major, "abc");
    assert.equal(result.raw.service, "");
    assert.equal(result.raw.customer, "3");
  });
});
