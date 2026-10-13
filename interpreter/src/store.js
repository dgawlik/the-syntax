import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export function defaultStorePath() {
  const base = process.env.APPDATA || join(homedir(), ".config");
  return join(base, "spl", "sessions.json");
}

export class SessionStore {
  constructor(path = defaultStorePath()) {
    this.path = path;
  }

  async read() {
    try {
      return JSON.parse(await readFile(this.path, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") {
        return { sessions: {} };
      }
      throw new Error(`Could not read SPL store at ${this.path}: ${error.message}`, { cause: error });
    }
  }

  async variables(sessionName) {
    const store = await this.read();
    return store.sessions[sessionName]?.variables ?? {};
  }

  async addVariables(sessionName, variables) {
    const store = await this.read();
    const session = store.sessions[sessionName] ?? { variables: {} };

    for (const [name, value] of Object.entries(variables)) {
      if (Object.hasOwn(session.variables, name)) {
        throw new Error(`$${name} is already defined in persistent session "${sessionName}".`);
      }
      session.variables[name] = value;
    }

    store.sessions[sessionName] = session;
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  }
}
