// Runs every request in steps.mjs, in order, against a running API and checks the answers.
// Run: API_URL=http://localhost:3000 node api-client/smoke.mjs
// The API must run with DEV_FIXED_OTP=123456 and a cluster must be active (see README).
import { collectionVars, environment, folders } from './steps.mjs';

const baseUrl = process.env.API_URL ?? environment.baseUrl;
const ctx = { ...environment, baseUrl };
const day = (n) => new Date(Date.now() + 330 * 60000 + n * 86400000).toISOString().slice(0, 10);
const at = (n, t) => new Date(`${day(n)}T${t}:00+05:30`).toISOString();
const evaluate = (expr, extra = {}) => new Function('day', 'at', 'v', 'res', `return (${expr});`)(day, at, (k) => ctx[k], extra.res);
const fill = (value) => {
  if (typeof value === 'string') return value.replace(/\{\{(\w+)\}\}/g, (_, k) => ctx[k] ?? `{{${k}}}`);
  if (Array.isArray(value)) return value.map(fill);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, val]) => [k, fill(val)]));
  return value;
};

let failed = 0;
let count = 0;
for (const folder of folders) {
  console.log(`\n${folder.name}`);
  for (const step of folder.steps) {
    count += 1;
    for (const [k, expr] of Object.entries(collectionVars)) ctx[k] = evaluate(expr);
    for (const [k, expr] of Object.entries(step.vars ?? {})) ctx[k] = evaluate(expr);
    const query = step.query ? '?' + new URLSearchParams(fill(step.query)).toString() : '';
    const response = await fetch(`${baseUrl}${fill(step.path)}${query}`, {
      method: step.method,
      headers: { ...(step.body ? { 'content-type': 'application/json' } : {}), ...(step.auth ? { authorization: `Bearer ${ctx.accessToken}` } : {}) },
      body: step.body ? JSON.stringify(fill(step.body)) : undefined,
    });
    const text = await response.text();
    const res = { status: response.status, body: text ? JSON.parse(text) : null };
    const problems = [];
    if (res.status !== step.expect) problems.push(`status ${res.status}, expected ${step.expect}`);
    for (const [description, expr] of step.checks ?? []) {
      let ok = false;
      try { ok = Boolean(evaluate(expr, { res })); } catch { ok = false; }
      if (!ok) problems.push(`check failed: ${description}`);
    }
    if (!problems.length) for (const [k, expr] of Object.entries(step.save ?? {})) ctx[k] = evaluate(expr, { res });
    if (problems.length) {
      failed += 1;
      console.log(`  FAIL ${step.method} ${step.path} (${step.name}): ${problems.join('; ')}\n       ${text.slice(0, 300)}`);
    } else {
      console.log(`  ok   ${step.method.padEnd(6)} ${step.path}  (${step.name})`);
    }
  }
}
console.log(`\n${count - failed}/${count} requests passed`);
process.exit(failed ? 1 : 0);
