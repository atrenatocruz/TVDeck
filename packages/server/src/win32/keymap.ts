/** Logical key names -> Windows virtual-key codes. Pure data, no FFI. */
export interface KeySpec {
  vk: number;
  /** Needs KEYEVENTF_EXTENDEDKEY (arrows, nav cluster, media/volume keys). */
  extended: boolean;
}

export const VK = {
  BACK: 0x08,
  TAB: 0x09,
  RETURN: 0x0d,
  MENU: 0x12, // Alt
  ESCAPE: 0x1b,
  SPACE: 0x20,
  LEFT: 0x25,
  UP: 0x26,
  RIGHT: 0x27,
  DOWN: 0x28,
  VOLUME_MUTE: 0xad,
  VOLUME_DOWN: 0xae,
  VOLUME_UP: 0xaf,
  MEDIA_NEXT_TRACK: 0xb0,
  MEDIA_PREV_TRACK: 0xb1,
  MEDIA_STOP: 0xb2,
  MEDIA_PLAY_PAUSE: 0xb3,
} as const;

export const KEYS = {
  up: { vk: VK.UP, extended: true },
  down: { vk: VK.DOWN, extended: true },
  left: { vk: VK.LEFT, extended: true },
  right: { vk: VK.RIGHT, extended: true },
  enter: { vk: VK.RETURN, extended: false },
  esc: { vk: VK.ESCAPE, extended: false },
  backspace: { vk: VK.BACK, extended: false },
  tab: { vk: VK.TAB, extended: false },
  space: { vk: VK.SPACE, extended: false },
  alt: { vk: VK.MENU, extended: false },
  playPause: { vk: VK.MEDIA_PLAY_PAUSE, extended: true },
  next: { vk: VK.MEDIA_NEXT_TRACK, extended: true },
  prev: { vk: VK.MEDIA_PREV_TRACK, extended: true },
  stop: { vk: VK.MEDIA_STOP, extended: true },
  volumeUp: { vk: VK.VOLUME_UP, extended: true },
  volumeDown: { vk: VK.VOLUME_DOWN, extended: true },
  mute: { vk: VK.VOLUME_MUTE, extended: true },
} as const satisfies Record<string, KeySpec>;

export type KeyName = keyof typeof KEYS;

/** Remote "back" button: Esc by default, Alt+Left for tiles that opt in. */
export function backChord(kind: "esc" | "browserBack" = "esc"): KeyName[] {
  return kind === "browserBack" ? ["alt", "left"] : ["esc"];
}
