import { Link } from 'react-router';

export function NotFoundPage({ what = 'page' }: { what?: string }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="key-num display text-text-3" style={{ ['--key-base' as string]: '4.5rem' }}>
        404
      </p>
      <h1 className="mt-4 text-2xl">No such {what}</h1>
      <p className="mt-2 text-text-3">It is not in deployments/testnet.json.</p>
      <Link to="/" className="ck-btn mt-8">
        Back to the board
      </Link>
    </div>
  );
}
