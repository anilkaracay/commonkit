import { Link } from 'react-router';

export function NotFoundPage({ what = 'page' }: { what?: string }) {
  return (
    <div className="tag mx-auto max-w-md p-6 text-center">
      <p className="eyebrow">not found</p>
      <h1 className="mt-1 text-2xl font-bold">No such {what}</h1>
      <p className="mt-2 text-sm text-ink-2">It is not in deployments/testnet.json.</p>
      <Link to="/" className="mt-4 inline-block underline">
        Back to the board
      </Link>
    </div>
  );
}
