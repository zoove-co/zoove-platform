// Builds the three policy pages for the zoove.co landing repo from the app's policy text, so both always match.
// Usage: node scripts/build-policy-pages.mjs <path-to-zoove-landing>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('Pass the zoove-landing folder.');
const data = JSON.parse(readFileSync(new URL('../apps/customer-app/src/lib/policies/policies.json', import.meta.url), 'utf8'));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/hello@zoove\.co/g, '<a href="mailto:hello@zoove.co">hello@zoove.co</a>');
const slugs = { terms: 'terms', privacy: 'privacy', cancellation: 'cancellation' };

const css = `:root{--bg:#0B0C0E;--ink:#F4F3F0;--sub:#8A8D92;--line:#232427;--accent:#FF5A36}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:"Inter",-apple-system,BlinkMacSystemFont,Arial,sans-serif;line-height:1.65}
.wrap{max-width:720px;margin:0 auto;padding:32px 24px 80px}
.logo{font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:22px;color:var(--ink);text-decoration:none}.logo span{color:var(--accent)}
nav{display:flex;gap:18px;flex-wrap:wrap;margin:28px 0 36px;font-size:14px}nav a{color:var(--sub);text-decoration:none}nav a.on,nav a:hover{color:var(--ink)}
h1{font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:32px;margin:0 0 6px}h2{font-size:17px;margin:32px 0 6px}
p{color:#c9cacd;margin:0 0 10px}.meta{color:var(--sub);font-size:13px;margin-bottom:20px}a{color:var(--accent)}
footer{border-top:1px solid var(--line);margin-top:56px;padding-top:20px;font-size:13px;color:var(--sub)}`;

for (const key of Object.keys(slugs)) {
  const d = data.docs[key];
  const nav = Object.keys(slugs).map((k) => `<a href="/${slugs[k]}.html"${k === key ? ' class="on"' : ''}>${data.docs[k].title}</a>`).join('');
  const body = d.sections.map((s) => `<h2>${esc(s.heading)}</h2>${s.body.map((p) => `<p>${esc(p)}</p>`).join('')}`).join('\n');
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${d.title} · Zoove</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>${css}</style></head><body><div class="wrap">
<a class="logo" href="/">zoove<span>.</span></a>
<nav>${nav}</nav>
<h1>${d.title}</h1><div class="meta">Last updated ${data.updated}</div>
<p>${esc(d.intro)}</p>
${body}
<footer>© Zoove · Mumbai · <a href="mailto:${data.contact}">${data.contact}</a></footer>
</div></body></html>
`;
  writeFileSync(join(out, `${slugs[key]}.html`), html);
}
console.log('Wrote', Object.keys(slugs).length, 'pages to', out);
