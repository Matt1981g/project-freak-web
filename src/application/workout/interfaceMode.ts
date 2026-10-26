import { useSyncExternalStore } from "react";
export type InterfaceMode = "old-school" | "analytics";
const key = "project-freak:interface-mode";
function read(): InterfaceMode {
  try {
    return localStorage.getItem(key) === "analytics"
      ? "analytics"
      : "old-school";
  } catch {
    return "old-school";
  }
}
function subscribe(callback: () => void) {
  window.addEventListener("pf-interface-mode", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("pf-interface-mode", callback);
    window.removeEventListener("storage", callback);
  };
}
export function currentInterfaceMode(): InterfaceMode {
  return read();
}
export function useInterfaceMode() {
  return useSyncExternalStore(subscribe, read, () => "old-school" as const);
}
export function setInterfaceMode(mode: InterfaceMode) {
  localStorage.setItem(key, mode);
  window.dispatchEvent(new Event("pf-interface-mode"));
}
