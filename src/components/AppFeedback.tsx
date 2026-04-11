import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { AlertTriangle } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { FeedbackContext, type ConfirmOptions, type FeedbackContextValue } from './appFeedbackContext';

export function AppFeedbackProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const notify: FeedbackContextValue['notify'] = ({ title, description, tone = 'info' }) => {
    if (tone === 'success') {
      toast.success(title, { description });
      return;
    }

    if (tone === 'error') {
      toast.error(title, { description });
      return;
    }

    toast.info(title, { description });
  };

  const confirm: FeedbackContextValue['confirm'] = (options) =>
    new Promise<boolean>((resolve) => {
      setConfirmState({ options, resolve });
    });

  const closeConfirm = (value: boolean) => {
    if (!confirmState) return;
    confirmState.resolve(value);
    setConfirmState(null);
  };

  const value = useMemo(() => ({ notify, confirm }), []);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <Toaster
        position="top-right"
        richColors
        toastOptions={{
          className: 'font-sans',
        }}
      />

      <AlertDialog.Root open={Boolean(confirmState)} onOpenChange={(open) => !open && closeConfirm(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[90] bg-slate-950/45 backdrop-blur-sm" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[91] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[28px] border border-white/60 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className={`rounded-2xl p-3 ${confirmState?.options.tone === 'danger' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-700'}`}>
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <AlertDialog.Title className="text-lg font-bold text-slate-900">
                    {confirmState?.options.title}
                  </AlertDialog.Title>
                  {confirmState?.options.description && (
                    <AlertDialog.Description className="mt-1 text-sm text-slate-500">
                      {confirmState.options.description}
                    </AlertDialog.Description>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-5">
              <AlertDialog.Cancel asChild>
                <button
                  type="button"
                  onClick={() => closeConfirm(false)}
                  className="rounded-2xl border border-slate-200 px-4 py-2.5 font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  {confirmState?.options.cancelLabel || 'Batal'}
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  onClick={() => closeConfirm(true)}
                  className={`rounded-2xl px-4 py-2.5 font-semibold text-white transition ${
                    confirmState?.options.tone === 'danger'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-slate-900 hover:bg-slate-800'
                  }`}
                >
                  {confirmState?.options.confirmLabel || 'Lanjutkan'}
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </FeedbackContext.Provider>
  );
}
