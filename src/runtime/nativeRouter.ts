import { BattleEngine, type AttackAction, type Fighter } from "../engine/battle";
import { StoryOrchestrator, type ScenarioDocument } from "../engine/story";
import type { NativeCommand } from "../types";
import { OFFICIAL_COMMAND_NAMES } from "./officialCommands";

interface CommandEvent {
  type: "MAGIRECO_NATIVE_COMMAND";
  id: string;
  command: string;
  payload: unknown;
}

interface NativeResult {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

type Handler = (payload: unknown) => unknown | Promise<unknown>;

export class NativeRouter {
  private readonly handlers = new Map<string, Handler>();
  private listener?: EventListener;

  handle(command: string, handler: Handler): this {
    this.handlers.set(command, handler);
    return this;
  }

  start(): this {
    if (this.listener) return this;
    this.listener = ((event: CustomEvent<CommandEvent>) => void this.dispatch(event.detail)) as EventListener;
    window.addEventListener("magireco:native-command", this.listener);
    return this;
  }

  stop() {
    if (this.listener) window.removeEventListener("magireco:native-command", this.listener);
    this.listener = undefined;
  }

  /**
   * 把桥送来的命令名解析成可注册的名字。
   *
   * 桥（public/runtime/official-bridge.js）只解析线格式 `game:<码>,<载荷>`，
   * 发出来的是 `native:<码>`；命令码表在 TS 侧，所以在这里查表换成官方常量名
   * （如 271 -> SCENE_PUSH_QUEST）。查不到的码保留 `native:<码>` 原样，
   * 这样诊断里能看到确切是哪个码没实现，而不是笼统的一句「不支持」。
   */
  private resolve(name: string): string {
    if (!name.startsWith("native:")) return name;
    const code = Number(name.slice(7));
    const official = Number.isFinite(code) ? OFFICIAL_COMMAND_NAMES[code] : undefined;
    return official ?? name;
  }

  private async dispatch(raw: NativeCommand) {
    const command: NativeCommand = { ...raw, command: this.resolve(raw.command) };
    const handler = this.handlers.get(command.command);
    let result: NativeResult;
    if (!handler) {
      result = { id: command.id, ok: false, error: `UNSUPPORTED_NATIVE_COMMAND:${command.command}` };
    } else {
      try {
        result = { id: command.id, ok: true, data: await handler(command.payload) };
      } catch (reason) {
        result = { id: command.id, ok: false, error: reason instanceof Error ? reason.message : String(reason) };
      }
    }
    window.dispatchEvent(new CustomEvent("magireco:native-result", { detail: result }));
  }
}

interface BattleStart {
  allies: Fighter[];
  enemies: Fighter[];
}

function safeAssetUrl(value: string): string {
  const path = value.replaceAll("\\", "/").replace(/^\/+/, "").replace(/^magica\//, "");
  if (!path || path.split("/").includes("..")) throw new Error("INVALID_ASSET_PATH");
  return `/magica/${path}`;
}

export function createDefaultNativeRouter(): NativeRouter {
  let battle: BattleEngine | null = null;
  let story: StoryOrchestrator | null = null;
  let audio: HTMLAudioElement | null = null;

  const router = new NativeRouter();
  router
    .handle("story.play", async (payload) => {
      story?.stop();
      story = new StoryOrchestrator(payload as ScenarioDocument, {
        applyCharacters: (characters) => {
          window.dispatchEvent(new CustomEvent("magireco:story-characters", { detail: characters }));
        },
        playSound: async (id) => {
          audio?.pause();
          audio = new Audio(safeAssetUrl(id));
          await audio.play();
        },
        applyUnknown: (key, value) => {
          window.dispatchEvent(new CustomEvent("magireco:story-unknown", { detail: { key, value } }));
        },
      });
      await story.play((group, index, step) => {
        window.dispatchEvent(new CustomEvent("magireco:story-step", { detail: { group, index, step } }));
      });
      return { state: "complete" };
    })
    .handle("story.stop", () => {
      story?.stop();
      return { state: "stopped" };
    })
    .handle("battle.start", (payload) => {
      const definition = payload as BattleStart;
      battle = new BattleEngine(structuredClone(definition.allies), structuredClone(definition.enemies));
      return { turn: battle.turn, outcome: battle.outcome() };
    })
    .handle("battle.act", (payload) => {
      if (!battle) throw new Error("BATTLE_NOT_STARTED");
      return { events: battle.act(payload as AttackAction), outcome: battle.outcome() };
    })
    .handle("battle.nextTurn", () => {
      if (!battle) throw new Error("BATTLE_NOT_STARTED");
      battle.nextTurn();
      return { turn: battle.turn, outcome: battle.outcome() };
    })
    .handle("battle.state", () => {
      if (!battle) throw new Error("BATTLE_NOT_STARTED");
      return {
        turn: battle.turn,
        allies: battle.allies,
        enemies: battle.enemies,
        outcome: battle.outcome(),
      };
    })
    .handle("audio.play", async (payload) => {
      const value = payload as { path: string; loop?: boolean; volume?: number };
      audio?.pause();
      audio = new Audio(safeAssetUrl(value.path));
      audio.loop = Boolean(value.loop);
      audio.volume = Math.max(0, Math.min(1, value.volume ?? 1));
      await audio.play();
      return { state: "playing" };
    })
    .handle("audio.stop", () => {
      audio?.pause();
      audio = null;
      return { state: "stopped" };
    })
    .handle("openUrl", (payload) => {
      const url = new URL(String(payload), location.href);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("INVALID_URL_SCHEME");
      window.open(url, "_blank", "noopener,noreferrer");
      return { state: "opened" };
    });
  return router;
}
