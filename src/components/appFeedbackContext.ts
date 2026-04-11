import { createContext } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
};

export type FeedbackContextValue = {
  notify: (input: { title: string; description?: string; tone?: ToastTone }) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

export const FeedbackContext = createContext<FeedbackContextValue | null>(null);
