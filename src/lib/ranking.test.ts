import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MAX_ROWS, parseWeights, rankTickets, type Weights } from "./ranking.ts";

const HEADER = "ticket_id,severity,number_of_customers,number_of_services";
const W: Weights = { warning: 1, minor: 5, major: 10, critical: 15, customer: 3, service: 1 };

const csv = (...rows: string[]) => [HEADER, ...rows].join("\n");
const ids = (text: string, weights = W) => {
  const result = rankTickets(text, weights);
  assert.ok(result.ok);
  return result.tickets.map((t) => t.ticketId);
};

void describe("rankTickets", () => {
  void test("PRD example: major, 2 customers, 5 services scores 21", () => {
    const result = rankTickets(csv("T1,major,2,5"), W);
    assert.deepEqual(result, {
      ok: true,
      tickets: [
        {
          rank: 1,
          ticketId: "T1",
          severity: "major",
          customers: 2,
          services: 5,
          points: { severity: 10, customers: 6, services: 5 },
          score: 21,
        },
      ],
    });
  });

  void test("each point follows its own weight", () => {
    const weights: Weights = { warning: 0.1, minor: 0.3, major: 1.5, critical: 2, customer: 0.7, service: 0.2 };
    const result = rankTickets(csv("W,warning,3,4", "M,major,2,9"), weights);
    assert.ok(result.ok);
    for (const t of result.tickets) {
      assert.deepEqual(
        t.points,
        {
          severity: weights[t.severity],
          customers: weights.customer * t.customers,
          services: weights.service * t.services,
        },
        t.ticketId,
      );
    }
  });

  void test("customers column weighs more than services", () => {
    assert.deepEqual(ids(csv("T2,minor,0,1", "T1,minor,1,0")), ["T1", "T2"]);
  });

  void test("equal score goes to higher severity", () => {
    assert.deepEqual(ids(csv("M,major,0,5", "C,critical,0,0")), ["C", "M"]);
  });

  void test("float-equal scores still reach severity tie-break", () => {
    // W sums to 0.30000000000000004, N to 0.3; unrounded, W would win despite lower severity.
    const weights: Weights = { warning: 0.1, minor: 0.3, major: 1, critical: 2, customer: 0.1, service: 0.1 };
    assert.ok(0.1 + 0.1 + 0.1 > 0.3);
    assert.deepEqual(ids(csv("W,warning,1,1", "N,minor,0,0"), weights), ["N", "W"]);
  });

  void test("equal score and severity go to ticket_id ascending", () => {
    assert.deepEqual(ids(csv("b,minor,1,1", "a,minor,1,1", "B,minor,1,1")), ["B", "a", "b"]);
  });

  void test("ranks are 1..n", () => {
    const result = rankTickets(csv("A,minor,0,0", "B,minor,0,0", "C,major,0,0"), W);
    assert.ok(result.ok);
    assert.deepEqual(
      result.tickets.map((t) => t.rank),
      [1, 2, 3],
    );
  });

  void test("rejects invalid files", () => {
    const tooMany = Array.from({ length: MAX_ROWS + 1 }, (_, i) => `T${String(i)},minor,0,0`);
    const bad = [
      "",
      HEADER,
      "ticket_id,severity,number_of_services,number_of_customers\nT1,minor,1,0",
      csv(...tooMany),
      csv("T1,minor,0,0", "T1,major,0,0"),
      csv(",minor,0,0"),
      csv("T1,urgent,0,0"),
      csv("T1,Minor,0,0"),
      csv("T1,minor,-1,0"),
      csv("T1,minor,1.5,0"),
      csv("T1,minor,,0"),
      csv("T1,minor,1234567890,0"),
      csv("T1,minor,0"),
      csv("T1,minor,0,0,0"),
      "ticket_id;severity;number_of_customers;number_of_services\nT1;minor;0;0",
    ];
    for (const text of bad) assert.deepEqual(rankTickets(text, W), { ok: false }, JSON.stringify(text));
  });

  void test("one invalid row after valid rows rejects the whole file", () => {
    const valid = ["V1,minor,0,0", "V2,major,1,1"];
    const bad = [
      csv(...valid, "T1,minor,0"),
      csv(...valid, "T1,minor,0,0,0"),
      csv(...valid, "T1,urgent,0,0"),
      csv(...valid, "T1,minor,-1,0"),
      csv(...valid, "T1,minor,,0"),
      csv(...valid, ",minor,0,0"),
      csv("A,minor,0,0", "B,urgent,0,0", "C,minor,0,0"),
      csv("T1,minor,0,0\n\nT2,minor,0,0"),
    ];
    for (const text of bad) assert.deepEqual(rankTickets(text, W), { ok: false }, JSON.stringify(text));
  });

  void test("rejects hostile counts and severities", () => {
    const hostile = [
      "T1,minor,abc,0",
      "T1,minor,+1,0",
      "T1,minor,1e3,0",
      "T1,minor,0x10,0",
      "T1,minor,١,0",
      'T1,minor,"2",0',
      "T1,constructor,0,0",
      "T1,__proto__,0,0",
      "T1,toString,0,0",
      "T1,hasOwnProperty,0,0",
      'T1,"major",0,0',
    ];
    for (const row of hostile) {
      const text = csv("V1,minor,0,0", row);
      assert.deepEqual(rankTickets(text, W), { ok: false }, JSON.stringify(text));
    }
  });

  void test("customers and services map to their own weights", () => {
    const weights: Weights = { warning: 1, minor: 5, major: 10, critical: 15, customer: 4, service: 0.5 };
    const result = rankTickets(csv("T1,major,2,5"), weights);
    assert.ok(result.ok);
    // 10 + 4*2 + 0.5*5; swapped it would be 10 + 4*5 + 0.5*2 = 31.
    assert.deepEqual(result.tickets[0].points, { severity: 10, customers: 8, services: 2.5 });
    assert.equal(result.tickets[0].score, 20.5);
  });

  void test("accepts max rows", () => {
    const rows = Array.from({ length: MAX_ROWS }, (_, i) => `T${String(i)},minor,0,0`);
    assert.equal(ids(csv(...rows)).length, MAX_ROWS);
  });

  void test("accepts BOM, CRLF, trailing newline and padded cells", () => {
    const text = `\uFEFF${HEADER}\r\n T1 , major , 2 , 5 \r\nT2,minor,0,0\r\n\r\n`;
    const result = rankTickets(text, W);
    assert.ok(result.ok);
    assert.deepEqual(
      result.tickets.map((t) => [t.ticketId, t.score]),
      [
        ["T1", 21],
        ["T2", 5],
      ],
    );
  });

  void test("is deterministic and independent of row order", () => {
    const rows = ["A,minor,1,1", "B,major,0,5", "C,critical,0,0", "D,warning,3,2", "E,minor,1,1", "F,major,2,5"];
    const first = rankTickets(csv(...rows), W);
    assert.deepEqual(rankTickets(csv(...rows), W), first);
    assert.deepEqual(rankTickets(csv(...[...rows].reverse()), W), first);
    assert.deepEqual(rankTickets(csv(rows[3], rows[0], rows[5], rows[2], rows[4], rows[1]), W), first);
  });
});

void describe("parseWeights", () => {
  const rows = Object.entries(W).map(([key, value]) => ({ key, value }));

  void test("accepts six known keys with numbers or numeric strings", () => {
    assert.deepEqual(parseWeights(rows), W);
    assert.deepEqual(parseWeights(rows.map((r) => ({ key: r.key, value: String(r.value) }))), W);
  });

  void test("rejects missing, unknown, duplicate or non-finite rows", () => {
    assert.equal(parseWeights(rows.slice(1)), null);
    assert.equal(parseWeights([...rows.slice(1), { key: "urgent", value: 1 }]), null);
    assert.equal(parseWeights([...rows.slice(1), { key: "minor", value: 1 }]), null);
    assert.equal(parseWeights([...rows.slice(1), { key: "warning", value: Infinity }]), null);
    assert.equal(parseWeights([...rows.slice(1), { key: "warning", value: "abc" }]), null);
    assert.equal(parseWeights([...rows.slice(1), { key: "warning", value: null }]), null);
  });
});
