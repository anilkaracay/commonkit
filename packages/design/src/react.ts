/** React binding for the NEAR mark: <NearMark /> renders the official mark (aria-hidden) at 1em; wrap amounts as
 * <span className="ck-near"><NearMark className="ck-near-mark" /><span className="ck-num">2.60</span><span className="ck-sr"> NEAR</span></span>. */
import { createElement, type SVGProps } from 'react';
import { NEAR_MARK_FILL, NEAR_MARK_PATH, NEAR_MARK_VIEWBOX } from './near';

export function NearMark(props: SVGProps<SVGSVGElement>) {
  return createElement('svg', { viewBox: NEAR_MARK_VIEWBOX, 'aria-hidden': true, focusable: false, ...props },
    createElement('path', { fill: NEAR_MARK_FILL, d: NEAR_MARK_PATH }));
}

/** An amount in NEAR: mark + tabular figures + the word for screen readers. */
export function NearAmount({ value, className }: { value: string; className?: string }) {
  return createElement('span', { className: className ? `ck-near ${className}` : 'ck-near' },
    createElement(NearMark, { className: 'ck-near-mark' }),
    createElement('span', { className: 'ck-num' }, value),
    createElement('span', { className: 'ck-sr' }, ' NEAR'));
}
