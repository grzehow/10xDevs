import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MAX_BYTES, type Weights } from "./ranking.ts";
import { rankUpload } from "./upload.ts";

const HEADER = "ticket_id,severity,number_of_customers,number_of_services";
const W: Weights = { warning: 1, minor: 5, major: 10, critical: 15, customer: 3, service: 1 };
const URL = "http://localhost/dashboard";

const loader = (weights: Weights | null = W) => {
  const stub = {
    calls: 0,
    load: () => {
      stub.calls++;
      return Promise.resolve(weights);
    },
  };
  return stub;
};

const post = (body: BodyInit, headers?: HeadersInit) => new Request(URL, { method: "POST", body, headers });
const upload = (file: FormDataEntryValue) => {
  const form = new FormData();
  form.append("file", file);
  return post(form);
};
const csvFile = (...rows: string[]) => new File([[HEADER, ...rows].join("\n")], "t.csv", { type: "text/csv" });

void describe("rankUpload", () => {
  void test("rejects oversized Content-Length before reading the body", async () => {
    const stub = loader();
    const request = post("small", { "content-length": String(MAX_BYTES + 65_537) });
    assert.equal(request.headers.get("content-length"), String(MAX_BYTES + 65_537));
    assert.deepEqual(await rankUpload(request, stub.load), { error: "file" });
    assert.equal(stub.calls, 0);
  });

  void test("rejects a non-multipart body", async () => {
    const stub = loader();
    assert.deepEqual(await rankUpload(post("hello", { "content-type": "text/plain" }), stub.load), { error: "file" });
    assert.equal(stub.calls, 0);
  });

  void test("rejects multipart without a file field", async () => {
    const stub = loader();
    const form = new FormData();
    form.append("other", "x");
    assert.deepEqual(await rankUpload(post(form), stub.load), { error: "file" });
    assert.equal(stub.calls, 0);
  });

  void test("rejects a file field sent as a string", async () => {
    const stub = loader();
    assert.deepEqual(await rankUpload(upload("T1,major,2,5"), stub.load), { error: "file" });
    assert.equal(stub.calls, 0);
  });

  void test("rejects a file over MAX_BYTES", async () => {
    const stub = loader();
    assert.deepEqual(await rankUpload(upload(new File(["a".repeat(MAX_BYTES + 1)], "t.csv")), stub.load), {
      error: "file",
    });
    assert.equal(stub.calls, 0);
  });

  void test("a file of exactly MAX_BYTES passes the size guard", async () => {
    const stub = loader();
    assert.deepEqual(await rankUpload(upload(new File(["a".repeat(MAX_BYTES)], "t.csv")), stub.load), {
      error: "file",
    });
    assert.equal(stub.calls, 1);
  });

  void test("reports a weights failure", async () => {
    const stub = loader(null);
    assert.deepEqual(await rankUpload(upload(csvFile("T1,major,2,5")), stub.load), { error: "weights" });
    assert.equal(stub.calls, 1);
  });

  void test("rejects a valid row followed by an invalid one", async () => {
    const stub = loader();
    assert.deepEqual(await rankUpload(upload(csvFile("T1,major,2,5", "T2,urgent,0,0")), stub.load), {
      error: "file",
    });
  });

  void test("ranks a valid file", async () => {
    const stub = loader();
    assert.deepEqual(await rankUpload(upload(csvFile("T1,major,2,5")), stub.load), {
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
      weights: W,
    });
  });
});
