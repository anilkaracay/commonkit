import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { DataSourceContext, type DataSource } from './data/source';
import { ToastProvider } from './components/Toast';
import { WalletContext, unavailableWallet, type WalletProvider } from './wallet/wallet';

export function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: 2, staleTime: 30_000, refetchOnWindowFocus: false, refetchIntervalInBackground: false } } });
}

export function AppProviders({
  source,
  wallet = unavailableWallet,
  queryClient,
  children,
}: {
  source: DataSource;
  wallet?: WalletProvider;
  queryClient: QueryClient;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <DataSourceContext value={source}>
        <WalletContext value={wallet}>
          <ToastProvider>{children}</ToastProvider>
        </WalletContext>
      </DataSourceContext>
    </QueryClientProvider>
  );
}
