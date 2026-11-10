import '@testing-library/jest-dom/vitest';

// jsdom does not implement scrolling; the shell scrolls to top on navigation.
if (typeof window !== 'undefined') window.scrollTo = () => {};

// Unit tests never reach the live RPC (or any network): every fetch must be faked explicitly.
globalThis.fetch = (input: RequestInfo | URL) => Promise.reject(new Error(`network disabled in tests: ${String(input)}`));
