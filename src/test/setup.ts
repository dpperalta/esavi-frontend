import { configure } from '@testing-library/dom';
import '@testing-library/jest-dom/vitest';

// waitFor/findBy* poll for at most 1s by default. That is enough for a file run on its own but not
// for the same file sharing the machine with the rest of the suite, where AppShell's drawer test
// needed more and failed on every full run while passing in isolation. This is a ceiling on how
// long a condition may take to become true, not a performance budget: raising it removes the false
// negative without hiding a real one, since a condition that never becomes true still fails.
configure({ asyncUtilTimeout: 5000 });

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

// jsdom doesn't implement pointer capture or scrollIntoView. Radix's DropdownMenu, Select and
// AlertDialog call these during open/close — without the polyfill, userEvent.click() on their
// triggers hangs instead of opening the menu.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
