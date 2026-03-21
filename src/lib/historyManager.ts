/**
 * History Manager for Canvas Undo/Redo
 * Manages undo and redo stacks with a maximum of 30 states
 */

export interface HistoryState {
  canvasJSON: string;
  timestamp: number;
  description?: string;
}

export interface HistoryManager {
  /**
   * Push a new state onto the undo stack
   * Clears redo stack when new action is performed
   */
  push: (state: HistoryState) => void;

  /**
   * Pop from undo stack and push to redo stack
   * Returns the previous state or null
   */
  undo: () => HistoryState | null;

  /**
   * Pop from redo stack and push to undo stack
   * Returns the next state or null
   */
  redo: () => HistoryState | null;

  /**
   * Clear all history
   */
  clear: () => void;

  /**
   * Get current state counts
   */
  getState: () => {
    canUndo: boolean;
    canRedo: boolean;
    undoCount: number;
    redoCount: number;
  };

  /**
   * Get undo and redo stacks (for debugging)
   */
  getStacks: () => {
    undoStack: HistoryState[];
    redoStack: HistoryState[];
  };
}

/**
 * Create a new history manager with 30-state limit
 */
export function createHistoryManager(maxStates: number = 30): HistoryManager {
  let undoStack: HistoryState[] = [];
  let redoStack: HistoryState[] = [];

  return {
    push(state: HistoryState) {
      // Add new state to undo stack
      undoStack.push(state);

      // Clear redo stack when new action is performed
      redoStack = [];

      // Enforce max history limit (FIFO - remove oldest)
      if (undoStack.length > maxStates) {
        undoStack.shift();
      }
    },

    undo() {
      if (undoStack.length === 0) return null;

      // Pop from undo stack
      const currentState = undoStack.pop();
      if (!currentState) return null;

      // Push to redo stack
      redoStack.push(currentState);

      // Return previous state
      const prevState = undoStack.length > 0
        ? undoStack[undoStack.length - 1]
        : null;

      return prevState;
    },

    redo() {
      if (redoStack.length === 0) return null;

      // Pop from redo stack
      const nextState = redoStack.pop();
      if (!nextState) return null;

      // Push to undo stack
      undoStack.push(nextState);

      return nextState;
    },

    clear() {
      undoStack = [];
      redoStack = [];
    },

    getState() {
      return {
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
        undoCount: undoStack.length,
        redoCount: redoStack.length,
      };
    },

    getStacks() {
      return {
        undoStack: [...undoStack],
        redoStack: [...redoStack],
      };
    },
  };
}

/**
 * Debounce helper for history state capture
 * Prevents saving duplicate states for rapid changes
 */
export function createDebounce(delayMs: number = 300) {
  let timeoutId: NodeJS.Timeout | null = null;
  let lastState: string = "";

  return {
    debounce: (callback: () => void, currentState: string) => {
      // Clear previous timeout
      if (timeoutId) clearTimeout(timeoutId);

      // Only call if state actually changed
      if (currentState === lastState) return;

      lastState = currentState;

      // Set new timeout
      timeoutId = setTimeout(() => {
        callback();
        timeoutId = null;
      }, delayMs);
    },

    cancel: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },

    flush: (callback: () => void) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        callback();
        timeoutId = null;
      }
    },
  };
}

/**
 * Compression helper for JSON state
 * Removes unnecessary properties to reduce memory usage
 */
export function compressCanvasState(canvasJSON: object): string {
  // For now, just stringify
  // In production, could implement more sophisticated compression
  return JSON.stringify(canvasJSON);
}

/**
 * Decompression helper for JSON state
 */
export function decompressCanvasState(compressed: string): object {
  return JSON.parse(compressed);
}
