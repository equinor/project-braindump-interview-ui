import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ConfigError, parseConfig, type Config } from "./domain";

type State = { status: "loading" } | { status: "error"; problems: string[] } | { status: "ready"; config: Config };

const Context = createContext<Config | null>(null);

// Reads public/questions.json when the page opens, so the questions can be edited without touching code.
export function ConfigGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}questions.json`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new ConfigError([`Could not read questions.json (${response.status}).`]);
        let raw: unknown;
        try {
          raw = await response.json();
        } catch (error) {
          throw new ConfigError([`questions.json is not valid JSON: ${(error as Error).message}`]);
        }
        return parseConfig(raw);
      })
      .then((config) => !cancelled && setState({ status: "ready", config }))
      .catch((error: unknown) => {
        if (cancelled) return;
        const problems = error instanceof ConfigError ? error.problems : [`Could not read questions.json: ${String(error)}`];
        setState({ status: "error", problems });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") return <main className="page"><p className="muted" role="status">Loading the questions…</p></main>;
  if (state.status === "error") {
    return (
      <main className="page">
        <h1 className="title">The questions file has a problem</h1>
        <div className="callout callout--error" role="alert">
          <ul>
            {state.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <p>Fix <code>public/questions.json</code>, save it and refresh the page.</p>
      </main>
    );
  }
  return <Context.Provider value={state.config}>{children}</Context.Provider>;
}

export function useConfig(): Config {
  const value = useContext(Context);
  if (!value) throw new Error("ConfigGate is missing.");
  return value;
}
