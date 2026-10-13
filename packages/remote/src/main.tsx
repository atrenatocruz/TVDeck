import "@fontsource-variable/inter";
import { render } from "preact";
import { App } from "./App.tsx";
import "./styles.css";
import "./views.css";
import "./pair.css";
import "./tv.css";
import { registerServiceWorker } from "./registerSw.ts";
import { keepScreenOn } from "./wakeLock.ts";
import { startConnection } from "./ws.ts";

void startConnection();
keepScreenOn();
registerServiceWorker();
document.addEventListener("contextmenu", (e) => e.preventDefault());
render(<App />, document.getElementById("app")!);
