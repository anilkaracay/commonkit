import type { RouteObject } from 'react-router';
import { Shell } from './components/Shell';
import { BoardPage } from './routes/Board';

/**
 * FRONTEND_SPEC §2. The board ships in the main chunk (it is the landing route of the app); every
 * other route is a separate chunk loaded on navigation, so a first visit downloads only what it shows.
 */
const page = (load: () => Promise<{ Component: RouteObject['Component'] }>): Pick<RouteObject, 'lazy'> => ({ lazy: load });

export const routes: RouteObject[] = [
  {
    element: <Shell />,
    // Shown while a lazy route chunk loads on first paint; also silences React Router's missing-fallback warning.
    HydrateFallback: () => null,
    children: [
      { path: '/', element: <BoardPage /> },
      { path: '/c/:community', ...page(async () => ({ Component: (await import('./routes/Community')).CommunityPage })) },
      { path: '/a/:assetId', ...page(async () => ({ Component: (await import('./routes/Asset')).AssetPage })) },
      { path: '/a/:assetId/reserve', ...page(async () => ({ Component: (await import('./routes/Reserve')).ReservePage })) },
      { path: '/a/:assetId/access/:reservationId', ...page(async () => ({ Component: (await import('./routes/Access')).AccessPage })) },
      { path: '/t/:assetId/:taskId', ...page(async () => ({ Component: (await import('./routes/Task')).TaskPage })) },
      { path: '/me', ...page(async () => ({ Component: (await import('./routes/Me')).MePage })) },
      { path: '/train', ...page(async () => ({ Component: (await import('./routes/Train')).TrainPage })) },
      { path: '/approvals', ...page(async () => ({ Component: (await import('./routes/Approvals')).ApprovalsPage })) },
      { path: '/proof', ...page(async () => ({ Component: (await import('./routes/Proof')).ProofPage })) },
      { path: '/agent', ...page(async () => ({ Component: (await import('./routes/Agent')).AgentPage })) },
      { path: '/pilot', ...page(async () => ({ Component: (await import('./routes/Pilot')).PilotPage })) },
      { path: '*', ...page(async () => ({ Component: (await import('./routes/NotFound')).NotFoundPage })) },
    ],
  },
];
