import type { Diagnostics } from '../app.service';
import type { ApiGroup } from './api-catalog.service';

export interface HomePageData extends Diagnostics {
  environment: string;
  uptimeSeconds: number;
  docsEnabled: boolean;
  groups: ApiGroup[];
  endpointCount: number;
}

/**
 * The service index at `GET /`.
 *
 * Deliberately zero JavaScript: helmet's default CSP sets `script-src 'self'`,
 * which blocks inline scripts outright. Inline *styles* are permitted
 * (`style-src` includes 'unsafe-inline'), so all of this is HTML and CSS with
 * no build step and no external requests.
 */
export function renderHomePage(data: HomePageData): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Ember API</title>
<style>${STYLES}</style>
</head>
<body>
<div class="page">
  ${renderHeader(data)}
  ${renderAlert(data)}
  ${renderLinks(data)}
  ${renderQuickstart(data)}
  ${renderCatalog(data)}
  <footer>Ember · food delivery backend · NestJS + Drizzle + Postgres</footer>
</div>
</body>
</html>`;
}

function renderHeader(data: HomePageData): string {
  const dbTone = data.database === 'up' ? 'ok' : 'bad';
  const schemaTone = data.schema === 'ready' ? 'ok' : data.schema === 'unknown' ? 'bad' : 'warn';

  return `<header>
  <div class="brand">
    <span class="flame" aria-hidden="true"></span>
    <div>
      <h1>Ember API</h1>
      <p class="tagline">${data.endpointCount} endpoints across ${data.groups.length} groups</p>
    </div>
  </div>
  <div class="status">
    <span class="pill">${esc(data.environment)}</span>
    <span class="stat"><i class="dot ok"></i>up ${formatUptime(data.uptimeSeconds)}</span>
    <span class="stat"><i class="dot ${dbTone}"></i>db ${esc(data.database)}</span>
    <span class="stat"><i class="dot ${schemaTone}"></i>schema ${esc(data.schema)}</span>
  </div>
</header>`;
}

function renderAlert(data: HomePageData): string {
  if (data.database === 'down') {
    return alertBox(
      'bad',
      'No database connection',
      'Every route under <code>/api</code> will fail. Check <code>DATABASE_URL</code> in your <code>.env</code> — and that the Neon branch is awake.',
    );
  }

  if (data.schema === 'missing') {
    return alertBox(
      'warn',
      'Tables not created yet',
      'The database is reachable but nothing has been migrated, so every data route will return a 500. Run <code>pnpm db:migrate</code>, then reload this page.',
    );
  }

  if (data.schema === 'outdated') {
    // The nastiest of the three: enough exists that the app boots and most
    // routes work, so the failures look like code bugs rather than a
    // migration that was never run.
    const absent = data.missing.map((name) => `<code>${esc(name)}</code>`).join(', ');

    return alertBox(
      'warn',
      'Schema is behind the code',
      `The database is missing ${absent}. Anything touching those will fail. Run <code>pnpm db:migrate</code>, then reload this page.`,
    );
  }

  return '';
}

function alertBox(tone: string, title: string, body: string): string {
  return `<div class="alert ${tone}">
  <strong>${esc(title)}</strong>
  <p>${body}</p>
</div>`;
}

function renderLinks(data: HomePageData): string {
  const docs = data.docsEnabled
    ? `<a class="card primary" href="/docs">
         <span class="card-label">Swagger UI</span>
         <span class="card-path">/docs</span>
         <span class="card-note">Browse and call every endpoint. Register, then paste your token into <b>Authorize</b>.</span>
       </a>`
    : `<div class="card disabled">
         <span class="card-label">Swagger UI</span>
         <span class="card-path">disabled</span>
         <span class="card-note">Docs are off in production. Set <code>SWAGGER_ENABLED=true</code> to serve them.</span>
       </div>`;

  const spec = data.docsEnabled
    ? `<a class="card" href="/docs-json">
         <span class="card-label">OpenAPI spec</span>
         <span class="card-path">/docs-json</span>
         <span class="card-note">Raw JSON — import into Postman or Insomnia.</span>
       </a>`
    : '';

  return `<section>
  <h2>Start here</h2>
  <div class="cards">
    ${docs}
    ${spec}
    <a class="card" href="/health">
      <span class="card-label">Liveness</span>
      <span class="card-path">/health</span>
      <span class="card-note">Is the process up? Never touches the database.</span>
    </a>
    <a class="card" href="/health/ready">
      <span class="card-label">Readiness</span>
      <span class="card-path">/health/ready</span>
      <span class="card-note">Can it serve traffic? Pings the database.</span>
    </a>
  </div>
</section>`;
}

function renderQuickstart(data: HomePageData): string {
  const authorize = data.docsEnabled
    ? 'Paste <code>accessToken</code> into <b>Authorize</b> at <a href="/docs">/docs</a>, or send it as <code>Authorization: Bearer &lt;token&gt;</code>.'
    : 'Send it as <code>Authorization: Bearer &lt;token&gt;</code> on every request.';

  return `<section>
  <h2>Get a token</h2>
  <p class="lede">Every route is protected by default. Only <code>/health</code>, <code>/health/ready</code> and the auth endpoints are public.</p>
  <ol class="steps">
    <li>
      <h3>Register</h3>
      <pre><code>curl -X POST http://localhost:3000/api/auth/register \\
  -H 'Content-Type: application/json' \\
  -d '{"email":"you@example.com","password":"correct horse battery","fullName":"Your Name"}'</code></pre>
    </li>
    <li>
      <h3>Authorize</h3>
      <p>${authorize}</p>
    </li>
    <li>
      <h3>Become an owner</h3>
      <p>New accounts are always <code>customer</code>. To create restaurants, promote yourself once, directly in the database:</p>
      <pre><code>UPDATE users SET role = 'admin' WHERE email = 'you@example.com';</code></pre>
      <p>After that, <code>PATCH /api/users/:id/role</code> handles every promotion through the API.</p>
    </li>
  </ol>
</section>`;
}

function renderCatalog(data: HomePageData): string {
  if (data.groups.length === 0) {
    return '';
  }

  const groups = data.groups
    .map(
      (group) => `<div class="group">
  <h3>${esc(group.name)}</h3>
  <ul class="routes">
    ${group.endpoints
      .map(
        (endpoint) => `<li>
      <span class="verb ${endpoint.method.toLowerCase()}">${esc(endpoint.method)}</span>
      <code class="route">${esc(endpoint.path)}</code>
      ${endpoint.secured ? '<span class="lock" title="Requires a bearer token">auth</span>' : '<span class="open">public</span>'}
      <span class="summary">${esc(endpoint.summary ?? '')}</span>
    </li>`,
      )
      .join('\n')}
  </ul>
</div>`,
    )
    .join('\n');

  return `<section>
  <h2>Endpoints</h2>
  <p class="lede">Read live from the OpenAPI document, so this list cannot drift from the code.</p>
  <div class="groups">${groups}</div>
</section>`;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;

  const hours = Math.floor(seconds / 3600);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Values here are server-controlled, but interpolating unescaped is a habit
 * worth not forming. */
function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

const STYLES = `
:root {
  --bg: #fbfaf9; --panel: #ffffff; --border: #e7e2dd; --text: #1b1917;
  --muted: #6f6862; --accent: #d2481a; --accent-soft: #fdf1ec;
  --ok: #2f855a; --warn: #b7791f; --bad: #c53030;
  --code-bg: #f4f1ee;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #100f0e; --panel: #191715; --border: #2c2825; --text: #f2ede8;
    --muted: #9b938c; --accent: #ff7a45; --accent-soft: #2a1a12;
    --ok: #68d391; --warn: #f6c177; --bad: #fc8181;
    --code-bg: #0b0a09;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font: 15px/1.6 ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.page { max-width: 900px; margin: 0 auto; padding: 48px 24px 72px; }
code, pre { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; }

header {
  display: flex; flex-wrap: wrap; gap: 20px; align-items: center;
  justify-content: space-between; padding-bottom: 28px;
  border-bottom: 1px solid var(--border); margin-bottom: 32px;
}
.brand { display: flex; align-items: center; gap: 14px; }
.flame {
  width: 34px; height: 34px; border-radius: 10px; flex: none;
  background: linear-gradient(150deg, #ff9f45, var(--accent));
  box-shadow: 0 4px 14px -4px var(--accent);
}
h1 { font-size: 21px; margin: 0; letter-spacing: -0.02em; }
.tagline { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
.status { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; font-size: 13px; }
.pill {
  padding: 3px 10px; border-radius: 999px; background: var(--accent-soft);
  color: var(--accent); font-weight: 600; font-size: 12px; letter-spacing: .02em;
}
.stat { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); }
.dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.dot.ok { background: var(--ok); } .dot.warn { background: var(--warn); } .dot.bad { background: var(--bad); }

.alert { border-radius: 12px; padding: 16px 18px; margin-bottom: 28px; border: 1px solid; }
.alert strong { display: block; margin-bottom: 4px; font-size: 14px; }
.alert p { margin: 0; font-size: 14px; line-height: 1.55; }
.alert.warn { border-color: var(--warn); background: color-mix(in srgb, var(--warn) 10%, transparent); }
.alert.bad { border-color: var(--bad); background: color-mix(in srgb, var(--bad) 10%, transparent); }

section { margin-bottom: 44px; }
h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .09em; color: var(--muted); margin: 0 0 16px; }
.lede { margin: -8px 0 18px; color: var(--muted); font-size: 14px; }

.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.card {
  display: flex; flex-direction: column; gap: 4px; padding: 18px;
  border: 1px solid var(--border); border-radius: 12px; background: var(--panel);
  text-decoration: none; color: inherit; transition: border-color .15s, transform .15s;
}
a.card:hover { border-color: var(--accent); transform: translateY(-1px); }
.card.primary { border-color: var(--accent); background: var(--accent-soft); }
.card.disabled { opacity: .6; }
.card-label { font-weight: 640; font-size: 15px; }
.card-path { font-family: ui-monospace, monospace; font-size: 12px; color: var(--accent); }
.card-note { font-size: 13px; color: var(--muted); line-height: 1.5; margin-top: 4px; }

.steps { list-style: none; counter-reset: step; padding: 0; margin: 0; }
.steps > li { counter-increment: step; position: relative; padding-left: 40px; margin-bottom: 26px; }
.steps > li::before {
  content: counter(step); position: absolute; left: 0; top: 0;
  width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
  background: var(--accent-soft); color: var(--accent); font-size: 13px; font-weight: 700;
}
.steps h3 { margin: 2px 0 8px; font-size: 15px; }
.steps p { margin: 8px 0 0; font-size: 14px; color: var(--muted); }
pre {
  margin: 0; padding: 14px 16px; border-radius: 10px; overflow-x: auto;
  background: var(--code-bg); border: 1px solid var(--border); font-size: 12.5px; line-height: 1.65;
}
:not(pre) > code {
  background: var(--code-bg); padding: 1px 5px; border-radius: 5px;
  font-size: 12.5px; border: 1px solid var(--border);
}

.groups { display: flex; flex-direction: column; gap: 22px; }
.group h3 { font-size: 14px; margin: 0 0 8px; text-transform: capitalize; }
.routes { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.routes li {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 9px 14px; background: var(--panel); font-size: 13px;
}
.routes li + li { border-top: 1px solid var(--border); }
.verb {
  font-family: ui-monospace, monospace; font-size: 10.5px; font-weight: 700;
  padding: 2px 6px; border-radius: 5px; min-width: 52px; text-align: center;
  background: var(--code-bg); color: var(--muted); letter-spacing: .03em;
}
.verb.get { color: #2b6cb0; } .verb.post { color: var(--ok); }
.verb.patch { color: var(--warn); } .verb.delete { color: var(--bad); }
.route { font-size: 12.5px; }
.lock, .open {
  font-size: 10px; text-transform: uppercase; letter-spacing: .05em;
  padding: 2px 6px; border-radius: 999px; font-weight: 700;
}
.lock { background: var(--accent-soft); color: var(--accent); }
.open { background: color-mix(in srgb, var(--ok) 14%, transparent); color: var(--ok); }
.summary { color: var(--muted); font-size: 12.5px; margin-left: auto; text-align: right; }

footer { border-top: 1px solid var(--border); padding-top: 22px; color: var(--muted); font-size: 12.5px; }
@media (max-width: 620px) {
  .page { padding: 32px 16px 48px; }
  .summary { margin-left: 0; width: 100%; text-align: left; }
}
`;
