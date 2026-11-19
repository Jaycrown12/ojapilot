/**
 * Starter Copilot Hook
 * Will handle communication with /api/v1/copilot and AI proposal lifecycle.
 */
export function useCopilot() {
  return {
    isProcessing: false,
    proposals: [],
  };
}
