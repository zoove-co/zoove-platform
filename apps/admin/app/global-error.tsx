'use client';

// The last safety net: if even the page frame breaks, this stands in for the whole page. It cannot rely on the
// panel's stylesheet, so it carries its own plain styling.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b0d0f', color: '#f2f4f7', fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: 24 }}>
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: 44 }} aria-hidden>🏋️💤</div>
          <h1 style={{ fontSize: 24, margin: '12px 0 8px' }}>Zoove admin is on a quick rest day</h1>
          <p style={{ color: '#8e98a6', lineHeight: 1.55, margin: 0 }}>Something broke while loading the panel. Trying again usually fixes it.</p>
          <button type="button" onClick={reset} style={{ marginTop: 18, padding: '10px 18px', borderRadius: 10, border: 0, background: '#e9491a', color: '#fff', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
