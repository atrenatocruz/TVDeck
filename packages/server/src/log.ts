const ts = () => new Date().toTimeString().slice(0, 8);

export const log = {
  info: (scope: string, msg: string) => console.log(`${ts()} [${scope}] ${msg}`),
  warn: (scope: string, msg: string) => console.warn(`${ts()} [${scope}] WARN ${msg}`),
  error: (scope: string, msg: string) => console.error(`${ts()} [${scope}] ERROR ${msg}`),
};
