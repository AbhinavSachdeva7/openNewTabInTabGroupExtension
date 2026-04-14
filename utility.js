// ==========================================
// UTILITY FUNCTIONS
// ==========================================
/**
 * Logs messages to console when in debug mode
 */
const DEBUG = false; // Set to true for development, false for production

export function log(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

/**
 * Logs warning messages to console when in debug mode
 */
export function warn(...args) {
  if (DEBUG) {
    console.warn(...args);
  }
}

/**
 * Logs error messages to console with different detail levels based on mode
 */
export function error(...args) {
  // Always log errors, but with different detail levels
  if (DEBUG) {
    console.error(...args);
  } else if (args.length > 0) {
    // In production, only log the error message without stack traces
    console.error(
      typeof args[0] === "object" && args[0].message ? args[0].message : args[0]
    );
  }
}

/**
 * Creates a debounced version of a function
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}
