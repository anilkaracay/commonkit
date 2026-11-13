import { NearAmount } from '@commonkit/design/react';
import { Fragment, type ReactNode } from 'react';
import { formatNear, type FormatNearOptions, type YoctoLike } from '../lib/near';

/** An amount in NEAR (yocto in, exact bigint formatting): the official mark, tabular figures, " NEAR" for screen readers. */
export function Near({ value, opts, className }: { value: YoctoLike; opts?: FormatNearOptions; className?: string }) {
  return <NearAmount value={formatNear(value, opts)} {...(className ? { className } : {})} />;
}

const AMOUNT = /(\d[\d,]*(?:\.\d+)?) NEAR\b/g;

/** Text with "<n> NEAR" figures (proof values, feed titles) rendered as marked amounts; other words stay as they are. */
export function NearText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(AMOUNT)) {
    out.push(text.slice(last, m.index));
    out.push(<NearAmount key={m.index} value={m[1] ?? ''} />);
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(text.slice(last));
  return <Fragment>{out}</Fragment>;
}
