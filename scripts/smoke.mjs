// Smoke test: proves the built app, the Cloudflare adapter, the Supabase auth flow and the admin weights save still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
// Seeded operator from supabase/seed.sql; override both for a cloud project.
const email = process.env.SMOKE_EMAIL ?? "operator@noc.local";
const password = process.env.SMOKE_PASSWORD ?? "Operator-Dev-Passw0rd!";
// Seeded admin. The admin steps read the current weights, set `major` to 12 and write the originals back, so against a
// cloud project they leave the weights as found and add two history rows.
const adminEmail = process.env.SMOKE_ADMIN_EMAIL ?? "admin@noc.local";
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD ?? "Admin-Dev-Passw0rd!";
const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), rest.join("="));
  }
}

async function request(path, { method = "GET", form, multipart } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : multipart,
  });
  storeCookies(response);
  return { status: response.status, location: response.headers.get("location") ?? "", text: await response.text() };
}

function csvUpload(csv) {
  const body = new FormData();
  body.append("file", new Blob([csv], { type: "text/csv" }), "smoke.csv");
  return body;
}

const WEIGHT_KEYS = ["warning", "minor", "major", "critical", "customer", "service"];
const scoreFormat = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const asNumber = (shown) => Number(shown.replace(",", "."));

// The weights exactly as the form shows them (pl-PL strings such as "2,5"), read before the first write so they can
// be restored byte for byte. Stays null if the read fails.
let original = null;

async function readWeights() {
  const response = await request("/admin/weights");
  const found = {};
  for (const key of WEIGHT_KEYS) {
    const tag = new RegExp(`<input[^>]*name="${key}"[^>]*>`).exec(response.text)?.[0];
    const value = tag === undefined ? undefined : /value="([^"]*)"/.exec(tag)?.[1];
    if (value !== undefined) found[key] = value;
  }
  original = Object.keys(found).length === WEIGHT_KEYS.length ? found : null;
  return response;
}

// Never writes unless the current weights were read, so a failed read cannot overwrite them with made-up values.
const saveWeights = (overrides = {}) =>
  original
    ? request("/admin/weights", { method: "POST", form: { ...original, ...overrides } })
    : Promise.resolve({ status: 0, location: "", text: "current weights were not read" });

function clearSession() {
  jar.clear();
  return request("/");
}

const steps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  [
    "weights screen redirects anonymous user",
    () => request("/admin/weights"),
    { status: 302, location: "/auth/signin" },
  ],
  [
    "signup endpoint is gone",
    () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
    { status: 404 },
  ],
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/" },
  ],
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
  ["weights screen redirects operator", () => request("/admin/weights"), { status: 302, location: "/dashboard" }],
  [
    "dashboard ranks uploaded csv",
    () =>
      request("/dashboard", {
        method: "POST",
        multipart: csvUpload(
          "ticket_id,severity,number_of_customers,number_of_services\nSMOKE-LOW,warning,0,0\nSMOKE-HIGH,critical,1,1\n",
        ),
      }),
    {
      status: 200,
      bodyCheck: (text) => {
        const high = text.indexOf('data-ticket-id="SMOKE-HIGH"');
        // 15 + 3×1 + 1×1 = 19, rendered with the pl-PL formatter on the real runtime.
        // The breakdown renders SMOKE-HIGH's customers component as 1 × 3,0 = 3,0. Match the whole line:
        // the weight 3,0 alone appears on every row. \s* absorbs the JSX line break before the points.
        return (
          high !== -1 &&
          high < text.indexOf('data-ticket-id="SMOKE-LOW"') &&
          text.includes("19,0") &&
          text.includes("<details") &&
          ["severity", "customers", "services"].every((c) => text.includes(`data-component="${c}"`)) &&
          /1 × 3,0 =\s*3,0/.test(text)
        );
      },
    },
  ],
  [
    "dashboard rejects file with a bad row",
    () =>
      request("/dashboard", {
        method: "POST",
        multipart: csvUpload(
          "ticket_id,severity,number_of_customers,number_of_services\nSMOKE-OK,minor,0,0\nSMOKE-BAD,urgent,0,0\n",
        ),
      }),
    {
      status: 200,
      // Valid row first, so skipping the bad row would render SMOKE-OK. data-error tells a file error from a weights
      // failure (same alert) without asserting its Polish copy.
      bodyCheck: (text) => text.includes('data-error="file"') && !text.includes("data-ticket-id="),
    },
  ],
  [
    "dashboard renders asymmetric customers and services",
    () =>
      request("/dashboard", {
        method: "POST",
        multipart: csvUpload("ticket_id,severity,number_of_customers,number_of_services\nSMOKE-ASYM,major,2,5\n"),
      }),
    {
      status: 200,
      // PRD default weights, as in the 19,0 step: 10 + 3×2 + 1×5 = 21. Swapped counts would render 5 × 3,0 and 2 × 1,0.
      bodyCheck: (text) =>
        text.includes('data-ticket-id="SMOKE-ASYM"') &&
        text.includes("21,0") &&
        /2 × 3,0 =\s*6,0/.test(text) &&
        /5 × 1,0 =\s*5,0/.test(text),
    },
  ],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  // Admin part. A step that fails or throws is recorded and the run goes on, so the restore step still executes and
  // writes back the weights read below.
  ["cookie jar cleared", clearSession, { status: 200 }],
  [
    "admin signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email: adminEmail, password: adminPassword } }),
    { status: 302, location: "/" },
  ],
  ["admin reads current weights", readWeights, { status: 200, bodyCheck: () => original !== null }],
  ["admin saves major=12", () => saveWeights({ major: 12 }), { status: 302, location: "/admin/weights?saved=1" }],
  [
    "upload ranks with the new weights",
    () =>
      request("/dashboard", {
        method: "POST",
        multipart: csvUpload("ticket_id,severity,number_of_customers,number_of_services\nSMOKE-WEIGHTS,major,2,5\n"),
      }),
    {
      status: 200,
      // major 12 + customer × 2 + service × 5 (23,0 with the PRD defaults), rendered with the pl-PL formatter.
      bodyCheck: (text) =>
        original !== null &&
        text.includes('data-ticket-id="SMOKE-WEIGHTS"') &&
        text.includes(scoreFormat.format(12 + asNumber(original.customer) * 2 + asNumber(original.service) * 5)),
    },
  ],
  ["admin restores original weights", () => saveWeights(), { status: 302, location: "/admin/weights?saved=1" }],
  ["admin signout", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  [
    "weights screen redirects after admin signout",
    () => request("/admin/weights"),
    { status: 302, location: "/auth/signin" },
  ],
];

let failed = 0;
for (const [name, run, expected] of steps) {
  let actual;
  try {
    actual = await run();
  } catch (error) {
    actual = { status: 0, location: String(error), text: "" };
  }
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location)) &&
    (expected.bodyCheck === undefined || expected.bodyCheck(actual.text));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
