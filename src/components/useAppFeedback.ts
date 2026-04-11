import { useContext } from 'react';
import { FeedbackContext } from './appFeedbackContext';

export function useAppFeedback() {
  const context = useContext(FeedbackContext);

  if (!context) {
    throw new Error('useAppFeedback must be used within AppFeedbackProvider');
  }

  return context;
}
