import type { RouteObject } from 'react-router';
import { Shell } from './components/Shell';
import { BoardPage } from './routes/Board';
import { CommunityPage } from './routes/Community';
import { AssetPage } from './routes/Asset';
import { ReservePage } from './routes/Reserve';
import { AccessPage } from './routes/Access';
import { TaskPage } from './routes/Task';
import { MePage } from './routes/Me';
import { TrainPage } from './routes/Train';
import { ApprovalsPage } from './routes/Approvals';
import { ProofPage } from './routes/Proof';
import { AgentPage } from './routes/Agent';
import { NotFoundPage } from './routes/NotFound';

/** FRONTEND_SPEC §2 */
export const routes: RouteObject[] = [
  {
    element: <Shell />,
    children: [
      { path: '/', element: <BoardPage /> },
      { path: '/c/:community', element: <CommunityPage /> },
      { path: '/a/:assetId', element: <AssetPage /> },
      { path: '/a/:assetId/reserve', element: <ReservePage /> },
      { path: '/a/:assetId/access/:reservationId', element: <AccessPage /> },
      { path: '/t/:assetId/:taskId', element: <TaskPage /> },
      { path: '/me', element: <MePage /> },
      { path: '/train', element: <TrainPage /> },
      { path: '/approvals', element: <ApprovalsPage /> },
      { path: '/proof', element: <ProofPage /> },
      { path: '/agent', element: <AgentPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
