import { accountUrl, txUrl } from '../lib/config';
import { shortAccount } from '../lib/enums';
import { useMembers } from './useMembers';

const isMock = (hash: string) => hash.startsWith('mock');

/** Small "tx" link on important rows. Mock hashes never link anywhere. */
export function TxLink({ hash, label = 'tx' }: { hash: string | null | undefined; label?: string }) {
  if (!hash) return null;
  const cls = 'inline-flex shrink-0 items-center gap-0.5 text-xs whitespace-nowrap text-text-3 no-underline hover:text-accent';
  if (isMock(hash)) {
    return (
      <span className={`${cls} cursor-help`} title={`Mock hash ${hash}: no real transaction`}>
        {label}
        <span aria-hidden>·mock</span>
      </span>
    );
  }
  return (
    <a className={cls} href={txUrl(hash)} target="_blank" rel="noreferrer" title={hash}>
      {label}
      <span aria-hidden>↗</span>
    </a>
  );
}

/** Account id with the member's name when known; full id on hover and to screen readers. */
export function Account({ id, link = false, full = false }: { id: string | null | undefined; link?: boolean; full?: boolean }) {
  const members = useMembers();
  if (!id) return <span className="text-text-3">—</span>;
  const name = members.get(id);
  const text = full ? id : (name ?? shortAccount(id));
  const inner = (
    <span className={name && !full ? 'font-medium' : 'font-mono text-[12px] tracking-[-0.01em]'} title={id}>
      {text}
    </span>
  );
  return link ? (
    <a href={accountUrl(id)} target="_blank" rel="noreferrer" className="hover:text-accent">
      {inner}
    </a>
  ) : (
    inner
  );
}
