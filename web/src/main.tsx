import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import './styles/index.css';
import { AppProviders, makeQueryClient } from './App';
import { routes } from './routes';
import { createRpcSource } from './data/rpc/rpcSource';
import { NearConnectProvider } from './wallet/nearConnect';

// Testnet views via NEAR RPC + files bundled at build time. The mock source is for tests only.
const source = createRpcSource({ rpcUrl: import.meta.env.VITE_NEAR_RPC as string | undefined });
// Routes are written relative to the app root; the basename puts them under /app (D-025).
const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' });

const el = document.getElementById('root');
if (!el) throw new Error('#root missing');
createRoot(el).render(
  <StrictMode>
    <AppProviders source={source} queryClient={makeQueryClient()}>
      <NearConnectProvider>
        <RouterProvider router={router} />
      </NearConnectProvider>
    </AppProviders>
  </StrictMode>,
);
