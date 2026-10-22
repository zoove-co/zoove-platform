// Generates the Postman and Bruno collections and the API reference from steps.mjs.
// Run: node api-client/generate.mjs     (from services/api)
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectionVars, environment, folders } from './steps.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const NAME = 'Zoove API';

const dateHelpers = `const day = (n) => new Date(Date.now() + 330 * 60000 + n * 86400000).toISOString().slice(0, 10);
const at = (n, t) => new Date(day(n) + 'T' + t + ':00+05:30').toISOString();`;

const write = (file, content) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content.endsWith('\n') ? content : content + '\n');
};
const pretty = (value) => JSON.stringify(value, null, 2);
const lines = (text, pad) => text.split('\n').map((l) => (l ? pad + l : l)).join('\n');
const urlWithQuery = (step) => {
  const q = step.query ? '?' + Object.entries(step.query).map(([k, val]) => `${k}=${val}`).join('&') : '';
  return `{{baseUrl}}${step.path}${q}`;
};

// ---------------------------------------------------------------- Postman
const postmanScript = (parts) => ({ type: 'text/javascript', exec: parts.join('\n').split('\n') });
const pmPrefix = `const v = (k) => pm.collectionVariables.get(k) ?? pm.environment.get(k);`;

function postmanItem(step) {
  const pre = Object.entries(step.vars ?? {}).map(([k, expr]) => `pm.collectionVariables.set('${k}', ${expr});`);
  const post = [
    pmPrefix,
    `const res = { status: pm.response.code, body: pm.response.text() ? pm.response.json() : null };`,
    `pm.test('status is ${step.expect}', () => pm.expect(res.status).to.equal(${step.expect}));`,
    ...(step.checks ?? []).map(([d, e]) => `pm.test(${JSON.stringify(d)}, () => pm.expect(Boolean(${e})).to.equal(true));`),
    ...Object.entries(step.save ?? {}).map(([k, e]) => `pm.collectionVariables.set('${k}', ${e});`),
  ];
  const item = {
    name: step.name,
    event: [
      ...(pre.length ? [{ listen: 'prerequest', script: postmanScript([dateHelpers, ...pre]) }] : []),
      { listen: 'test', script: postmanScript(post) },
    ],
    request: {
      method: step.method,
      header: step.body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
      ...(step.auth ? { auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] } } : { auth: { type: 'noauth' } }),
      ...(step.body ? { body: { mode: 'raw', raw: pretty(step.body), options: { raw: { language: 'json' } } } } : {}),
      url: {
        raw: urlWithQuery(step),
        host: ['{{baseUrl}}'],
        path: step.path.split('/').filter(Boolean),
        ...(step.query ? { query: Object.entries(step.query).map(([key, value]) => ({ key, value })) } : {}),
      },
      description: step.about,
    },
  };
  return item;
}

const postmanCollection = {
  info: {
    name: NAME,
    description: 'Every Zoove API request in the order of a real customer journey. Run "Verify OTP" first; it saves the tokens.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  event: [
    {
      listen: 'prerequest',
      script: postmanScript([dateHelpers, ...Object.entries(collectionVars).map(([k, e]) => `pm.collectionVariables.set('${k}', ${e});`)]),
    },
  ],
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] },
  item: folders.map((f) => ({ name: f.name, item: f.steps.map(postmanItem) })),
};
const postmanEnvironment = {
  name: 'Zoove local',
  values: Object.entries(environment).map(([key, value]) => ({ key, value, type: 'default', enabled: true })),
  _postman_variable_scope: 'environment',
};
write(join(root, 'postman/zoove-api.postman_collection.json'), pretty(postmanCollection));
write(join(root, 'postman/zoove-local.postman_environment.json'), pretty(postmanEnvironment));

// ---------------------------------------------------------------- Bruno
// Start clean so renamed requests do not leave stale files behind.
try {
  rmSync(join(root, 'bruno'), { recursive: true, force: true });
} catch {
  console.warn('Could not clear api-client/bruno; delete it by hand if you renamed a request.');
}
write(join(root, 'bruno/bruno.json'), pretty({ version: '1', name: NAME, type: 'collection', ignore: ['node_modules', '.git'] }));
write(
  join(root, 'bruno/environments/local.bru'),
  `vars {\n${Object.entries(environment).map(([k, val]) => `  ${k}: ${val}`).join('\n')}\n}\n`,
);
write(
  join(root, 'bruno/collection.bru'),
  `script:pre-request {\n${lines([dateHelpers, ...Object.entries(collectionVars).map(([k, e]) => `bru.setVar('${k}', ${e});`)].join('\n'), '  ')}\n}\n`,
);

const brunoName = (n) => n.replace(/[^A-Za-z0-9 ()\-]/g, '').trim();
folders.forEach((folder, fi) => {
  const dir = `${String(fi + 1).padStart(2, '0')} ${brunoName(folder.name)}`;
  write(join(root, 'bruno', dir, 'folder.bru'), `meta {\n  name: ${folder.name}\n  seq: ${fi + 1}\n}\n`);
  folder.steps.forEach((step, si) => {
    const parts = [];
    parts.push(`meta {\n  name: ${step.name}\n  type: http\n  seq: ${si + 1}\n}`);
    parts.push(`${step.method.toLowerCase()} {\n  url: ${urlWithQuery(step)}\n  body: ${step.body ? 'json' : 'none'}\n  auth: ${step.auth ? 'bearer' : 'none'}\n}`);
    if (step.query) parts.push(`params:query {\n${Object.entries(step.query).map(([k, val]) => `  ${k}: ${val}`).join('\n')}\n}`);
    if (step.auth) parts.push(`auth:bearer {\n  token: {{accessToken}}\n}`);
    if (step.body) parts.push(`body:json {\n${lines(pretty(step.body), '  ')}\n}`);
    if (step.vars) parts.push(`script:pre-request {\n${lines(Object.entries(step.vars).map(([k, e]) => `bru.setVar('${k}', ${e});`).join('\n'), '  ')}\n}`);
    const post = [
      `const v = (k) => bru.getVar(k) ?? bru.getEnvVar(k);`,
      ...Object.entries(step.save ?? {}).map(([k, e]) => `bru.setVar('${k}', ${e});`),
    ];
    parts.push(`script:post-response {\n${lines(post.join('\n'), '  ')}\n}`);
    parts.push(`assert {\n  res.status: eq ${step.expect}\n}`);
    const tests = (step.checks ?? []).map(([d, e]) => `test(${JSON.stringify(d)}, function () {\n  const v = (k) => bru.getVar(k) ?? bru.getEnvVar(k);\n  expect(Boolean(${e})).to.equal(true);\n});`);
    if (tests.length) parts.push(`tests {\n${lines(tests.join('\n'), '  ')}\n}`);
    parts.push(`docs {\n  ${step.about}\n}`);
    write(join(root, 'bruno', dir, `${String(si + 1).padStart(2, '0')} ${brunoName(step.name)}.bru`), parts.join('\n\n') + '\n');
  });
});

// ---------------------------------------------------------------- Reference
const table = folders
  .map(
    (f) =>
      `### ${f.name}\n\n| Request | Method and path | Sign-in | Expect | What it does |\n|---|---|---|---|---|\n` +
      f.steps.map((s) => `| ${s.name} | \`${s.method} ${s.path}\` | ${s.auth ? 'yes' : 'no'} | ${s.expect} | ${s.about} |`).join('\n'),
  )
  .join('\n\n');
write(
  join(root, 'API-REFERENCE.md'),
  `# Zoove API reference\n\nGenerated from \`steps.mjs\`. Do not edit by hand: change \`steps.mjs\` and run \`node api-client/generate.mjs\`.\n\nEvery failure looks like \`{ "error": { "code", "message", "details" } }\`. Money is in paise (150000 = Rs 1,500). Times are UTC in responses; slots are defined in India time.\n\n${table}\n`,
);
console.log('Generated: Postman, Bruno, API-REFERENCE.md');
