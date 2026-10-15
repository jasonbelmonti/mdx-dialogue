import { createContext, useContext } from 'react';
import type { Dialogue, Layout } from '../shared/dialogue.js';
export type DialogueContextValue = {
  doc: Dialogue;
  selected: Layout;
  select: (id: Layout) => void;
  annotation: string;
  setAnnotation: (value: string) => void;
  busy: boolean;
  waiting: boolean;
  error: string;
  send: () => void;
  retry: () => void;
  canRetry: boolean;
};
export const DialogueContext = createContext<DialogueContextValue | null>(null);
export function useDialogue() {
  const value = useContext(DialogueContext);
  if (!value) throw new Error('Dialogue context is missing.');
  return value;
}
