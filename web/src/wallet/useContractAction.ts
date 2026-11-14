import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDataSource } from '../data/source';
import { useToast } from '../components/Toast';
import { useWallet, type ContractCall } from './wallet';

/** Refresh both view caches after a wallet-confirmed transaction. */
export function useContractAction() {
  const wallet = useWallet();
  const ds = useDataSource();
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (call: ContractCall) => wallet.signAndSendTransaction(call),
    onSuccess: async () => {
      ds.invalidateViews?.();
      await qc.invalidateQueries();
    },
    onError: (error) => { toast.showError(error); },
  });
}
