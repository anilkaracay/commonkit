import '@testing-library/jest-dom/vitest';

// jsdom does not implement scrolling; the shell scrolls to top on navigation.
if (typeof window !== 'undefined') window.scrollTo = () => {};
