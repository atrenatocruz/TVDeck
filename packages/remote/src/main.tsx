import "@fontsource-variable/inter";
import { render } from "preact";
import { App } from "./App.tsx";
import "./styles.css";
import "./views.css";
import { startConnection } from "./ws.ts";

startConnection();
document.addEventListener("contextmenu", (e) => e.preventDefault());
render(<App />, document.getElementById("app")!);
