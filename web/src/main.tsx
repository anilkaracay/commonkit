import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/jetbrains-mono';
import './styles/index.css';
import { AppProviders, makeQueryClient } from './App';
import { routes } from './routes';
import { createMockSource } from './data/mock/mockSource';

// M5: the mock source is the only source; M7 swaps in the RPC source built on @commonkit/sdk.
const source = createMockSource();
const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' });

const el = document.getElementById('root');
if (!el) throw new Error('#root missing');
createRoot(el).render(
  <StrictMode>
    <AppProviders source={source} queryClient={makeQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
