import "@fontsource-variable/inter";
import "@fontsource-variable/bricolage-grotesque";
import { render } from "preact";
import { App } from "./App.tsx";
import "./styles.css";
import { startConnection } from "./ws.ts";

startConnection();
document.addEventListener("contextmenu", (e) => e.preventDefault());

// A TV has no use for a mouse pointer until someone actually moves one.
let idle = 0;
const wake = () => {
  document.documentElement.dataset.pointer = "active";
  clearTimeout(idle);
  idle = window.setTimeout(() => (document.documentElement.dataset.pointer = "idle"), 2500);
};
document.documentElement.dataset.pointer = "idle";
window.addEventListener("pointermove", wake, { passive: true });

render(<App />, document.getElementById("app")!);
