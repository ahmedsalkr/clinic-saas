export function navigateTo(path: string, clientNavigation: () => void) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    window.location.assign(path);
    return;
  }

  clientNavigation();
}
