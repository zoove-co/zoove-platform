import type { ReactNode } from 'react';

// A dumbbell having a rest, with a few Zs floating up. Used when something is down or a page breaks.
export function RestDay({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="rest" role="alert">
      <div className="rest-art" aria-hidden>
        <span className="zz z1">z</span>
        <span className="zz z2">z</span>
        <span className="zz z3">z</span>
        <div className="dumbbell">
          <i className="pl pl-big" /><i className="pl pl-sm" /><i className="pl-bar" /><i className="pl pl-sm" /><i className="pl pl-big" />
        </div>
        <div className="rest-floor" />
      </div>
      <h1>{title}</h1>
      <p>{children}</p>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}
