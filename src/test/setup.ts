import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement matchMedia. Needed by useSyncTheme, useIsMobile (shadcn's sidebar)
// and anything else that reads the system theme or viewport width.
// jsdom doesn't implement ResizeObserver either. Radix's tooltip/popover positioning reads it.
if (!window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
