#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { stdin as input } from "node:process";
import { createInterface } from "node:readline/promises";
import { CopilotClient } from "@github/copilot-sdk";
import { color, colorizeSpl } from "./ansi.js";
import { parseSpl, prepareExecution, interpreterInstructions } from "./spl.js";
import { SessionStore } from "./store.js";

function usage() {
  console.log(`Usage:
  spl auth
  spl models
  spl chat [--model <id>] [--session <name>] [--store <path>]
  spl run [file] [--model <id>] [--session <name>] [--store <path>]

Run reads SPL from a file or stdin. Variables declared with let are immutable and
persisted by session in %APPDATA%\\spl\\sessions.json (or --store). Chat accepts
multi-line SPL blocks; submit one with .send and leave with .quit.`);
}

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return args[index + 1];
}

async function readSource(file) {
  if (file) return readFile(resolve(file), "utf8");
  let source = "";
  for await (const chunk of input) source += chunk;
  return source;
}

async function withClient(work) {
  const client = new CopilotClient();
  try {
    await client.start();
    return await work(client);
  } catch (error) {
    throw new Error(`GitHub Copilot is unavailable. Run "spl auth" or set GH_TOKEN/COPILOT_GITHUB_TOKEN, then retry. ${error.message}`, { cause: error });
  } finally {
    await client.stop().catch(() => {});
  }
}

function authenticate() {
  return new Promise((resolvePromise, reject) => {
    const command = process.platform === "win32" ? "copilot.exe" : "copilot";
    const login = spawn(command, ["auth", "login"], { stdio: "inherit" });
    login.on("error", (error) => reject(new Error(`Could not start Copilot CLI: ${error.message}`)));
    login.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`Copilot authentication exited with code ${code}.`)));
  });
}

function ensureNewVariables(program, persistedVariables, sessionName) {
  for (const name of Object.keys(program.variables)) {
    if (Object.hasOwn(persistedVariables, name)) {
      throw new Error(`$${name} is already defined in persistent session "${sessionName}".`);
    }
  }
}

async function createCopilotSession(client, model) {
  if (model) {
    const models = await client.listModels();
    if (!models.some((availableModel) => availableModel.id === model)) {
      throw new Error(`Model "${model}" is not available. Run "spl models" to select an available model.`);
    }
  }
  return client.createSession({
    ...(model ? { model } : {}),
    systemMessage: { content: interpreterInstructions }
  });
}

async function run(args) {
  const positional = args.find((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--model" && args[index - 1] !== "--session" && args[index - 1] !== "--store");
  const sessionName = option(args, "--session", positional ? basename(positional, ".spl") : "default");
  const model = option(args, "--model");
  const store = new SessionStore(option(args, "--store"));
  const program = parseSpl(await readSource(positional));
  const persistedVariables = await store.variables(sessionName);
  ensureNewVariables(program, persistedVariables, sessionName);
  const execution = prepareExecution(program, persistedVariables);

  console.log(color.bold("\nPrompt"));
  console.log(colorizeSpl(program.source));

  if (execution.failure) {
    console.log(`\n${color.red(color.bold("Response"))}`);
    console.log(JSON.stringify(execution.failure, null, 2));
    return;
  }

  await store.addVariables(sessionName, program.variables);
  await withClient(async (client) => {
    const session = await createCopilotSession(client, model);
    try {
      let response = "";
      session.on("assistant.message", (event) => { response += event.data.content; });
      const done = new Promise((resolveDone) => session.on("session.idle", resolveDone));
      await session.send({ prompt: execution.prompt });
      await done;
      console.log(`\n${color.green(color.bold("Response"))}`);
      console.log(color.green(colorizeSpl(response)));
    } finally {
      await session.disconnect();
    }
  });
}

async function chat(args) {
  const sessionName = option(args, "--session", "default");
  const model = option(args, "--model");
  const store = new SessionStore(option(args, "--store"));
  let terminal;
  const lines = [];

  console.log(color.bold("SPL interactive chat"));
  console.log(color.dim("Paste or type a complete SPL block. Press Enter twice to submit, use .send to submit explicitly, .clear to discard, or .quit to exit."));

  try {
    await withClient(async (client) => {
      const session = await createCopilotSession(client, model);
      let response = "";
      session.on("assistant.message", (event) => { response += event.data.content; });
      terminal = createInterface({ input, output: process.stdout, terminal: true });

      try {
        terminal.setPrompt(color.cyan("spl> "));
        terminal.prompt();
        try {
          for await (const line of terminal) {
            if (lines.length === 0 && line === ".quit") break;
            if (lines.length === 0 && line === ".help") {
              console.log(color.dim(".send submits the current multi-line SPL block; .clear discards it; .quit exits."));
            } else if (lines.length === 0 && line === ".clear") {
              console.log(color.dim("No SPL block is being composed."));
            } else if (line === ".clear") {
              lines.length = 0;
              console.log(color.dim("SPL block discarded."));
            } else if (line === ".send" || (line === "" && lines.at(-1) === "")) {
              const source = (line === ".send" ? lines : lines.slice(0, -1)).join("\n");
              lines.length = 0;
              try {
                const program = parseSpl(source);
                const persistedVariables = await store.variables(sessionName);
                ensureNewVariables(program, persistedVariables, sessionName);
                const execution = prepareExecution(program, persistedVariables);

                console.log(`\n${color.bold("Prompt")}`);
                console.log(colorizeSpl(program.source));
                if (execution.failure) {
                  console.log(`\n${color.red(color.bold("Response"))}`);
                  console.log(JSON.stringify(execution.failure, null, 2));
                } else {
                  await store.addVariables(sessionName, program.variables);
                  response = "";
                  const done = new Promise((resolveDone) => session.on("session.idle", resolveDone));
                  await session.send({ prompt: execution.prompt });
                  await done;
                  console.log(`\n${color.green(color.bold("Response"))}`);
                  console.log(color.green(colorizeSpl(response)));
                }
              } catch (error) {
                console.error(color.red(`Error: ${error.message}`));
              }
            } else {
              lines.push(line);
              terminal.setPrompt(color.cyan("...> "));
            }
            terminal.prompt();
          }
        } catch (error) {
          if (error?.code !== "ERR_USE_AFTER_CLOSE" && error?.message !== "readline was closed") {
            throw error;
          }
        }
      } finally {
        await session.disconnect();
      }
    });
  } finally {
    terminal?.close();
  }
}

async function models() {
  await withClient(async (client) => {
    const models = await client.listModels();
    for (const model of models) {
      console.log(`${color.cyan(model.id)}${model.name ? ` ${color.dim(`— ${model.name}`)}` : ""}`);
    }
  });
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") return usage();
  if (command === "auth") return authenticate();
  if (command === "models") return models();
  if (command === "chat") return chat(args);
  if (command === "run") return run(args);
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(color.red(`Error: ${error.message}`));
  process.exitCode = 1;
});
