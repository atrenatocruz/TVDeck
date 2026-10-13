import type { Sky } from "../weather.ts";

const sun = (
  <g class="wx-sun">
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
  </g>
);
const cloud = (x = 0, y = 0) => (
  <path
    class="wx-cloud"
    transform={`translate(${x} ${y})`}
    d="M7.2 18.5h9.6a3.7 3.7 0 0 0 .5-7.37A5.2 5.2 0 0 0 7.4 9.6a4.45 4.45 0 0 0-.2 8.9Z"
  />
);

/** Small weather glyphs drawn for TVDeck (outline style, inherits currentColor). */
export function WeatherIcon({ sky }: { sky: Sky }) {
  return (
    <svg class="wx" viewBox="0 0 24 24" aria-hidden="true">
      {sky === "clear" && sun}
      {sky === "night" && <path class="wx-moon" d="M19.5 14.6A7.6 7.6 0 0 1 9.4 4.5a7.6 7.6 0 1 0 10.1 10.1Z" />}
      {sky === "partly" && (
        <>
          <g transform="translate(-3.2 -3.4) scale(0.8)">{sun}</g>
          {cloud(1.4, 1.2)}
        </>
      )}
      {sky === "cloudy" && cloud(0, -1)}
      {sky === "fog" && (
        <>
          {cloud(0, -3)}
          <path class="wx-line" d="M5 19.5h14M7.5 22h9" />
        </>
      )}
      {sky === "rain" && (
        <>
          {cloud(0, -3)}
          <path class="wx-line" d="M8.5 18.6l-1 2.6M12.5 18.6l-1 2.6M16.5 18.6l-1 2.6" />
        </>
      )}
      {sky === "snow" && (
        <>
          {cloud(0, -3)}
          <path class="wx-line" d="M8 19.6h.01M12 21h.01M16 19.6h.01" />
        </>
      )}
      {sky === "storm" && (
        <>
          {cloud(0, -3)}
          <path class="wx-bolt" d="M12.8 16.2 10.6 19.6h2.6l-1.4 3" />
        </>
      )}
    </svg>
  );
}
