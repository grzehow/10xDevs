// Smoke test: proves the built app, the Cloudflare adapter, the Supabase auth flow and the admin weights save still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
// Seeded operator from supabase/seed.sql; override both for a cloud project.
const email = process.env.SMOKE_EMAIL ?? "operator@noc.local";
const password = process.env.SMOKE_PASSWORD ?? "Operator-Dev-Passw0rd!";
// Seeded admin; the admin steps change `major` to 12 and back, so against a cloud project they write two history rows.
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

const defaultWeights = { warning: 1, minor: 5, major: 10, critical: 15, customer: 3, service: 1 };
const saveWeights = (overrides = {}) =>
  request("/admin/weights", { method: "POST", form: { ...defaultWeights, ...overrides } });

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
        return high !== -1 && high < text.indexOf('data-ticket-id="SMOKE-LOW"') && text.includes("19,0");
      },
    },
  ],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  // Admin part. Steps never abort the run, so the restore step always executes and leaves major=10.
  ["cookie jar cleared", clearSession, { status: 200 }],
  [
    "admin signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email: adminEmail, password: adminPassword } }),
    { status: 302, location: "/" },
  ],
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
      // 12 + 3×2 + 1×5 = 23, rendered with the pl-PL formatter on the real runtime.
      bodyCheck: (text) => text.includes('data-ticket-id="SMOKE-WEIGHTS"') && text.includes("23,0"),
    },
  ],
  ["admin restores defaults", () => saveWeights(), { status: 302, location: "/admin/weights?saved=1" }],
  ["admin signout", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  [
    "weights screen redirects after admin signout",
    () => request("/admin/weights"),
    { status: 302, location: "/auth/signin" },
  ],
];

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
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
