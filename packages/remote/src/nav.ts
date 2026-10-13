import { signal } from "@preact/signals";

export const TABS = ["remote", "touchpad", "apps"] as const;
export type Tab = (typeof TABS)[number];

const KEY = "tvdeck.tab";

export function parseTab(v: unknown): Tab {
  return TABS.includes(v as Tab) ? (v as Tab) : "remote";
}

function load(): Tab {
  try {
    return parseTab(localStorage.getItem(KEY));
  } catch {
    return "remote";
  }
}

export const tab = signal<Tab>(load());

export function setTab(t: Tab): void {
  if (tab.value === t) return;
  tab.value = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* storage unavailable: the tab just won't be remembered */
  }
}
