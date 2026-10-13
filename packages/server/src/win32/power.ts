import koffi from "koffi";
import { log } from "../log.ts";

let setSuspendState: ((hibernate: boolean, force: boolean, wakeupEventsDisabled: boolean) => boolean) | null = null;
if (process.platform === "win32") {
  try {
    setSuspendState = koffi.load("powrprof.dll").func("bool __stdcall SetSuspendState(bool, bool, bool)");
  } catch (e) {
    log.warn("power", `sleep is unavailable: ${(e as Error).message}`);
  }
}

/**
 * Puts the PC to sleep (not hibernate). If hibernation is turned on in Windows, SetSuspendState(false)
 * still sleeps; with "hybrid sleep" on, Windows decides. Returns false when it could not be requested.
 */
export function sleepPc(): boolean {
  if (!setSuspendState) return false;
  return setSuspendState(false, false, false);
}
