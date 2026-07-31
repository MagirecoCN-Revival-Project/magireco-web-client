import { describe, expect, it } from "vitest";
import { NativeRouter } from "./nativeRouter";
import { OFFICIAL_COMMAND_CODES, OFFICIAL_COMMAND_COUNT, OFFICIAL_COMMAND_NAMES } from "./officialCommands";

/**
 * 这组测试钉住「官方命令桥」的两件事，二者出错都会让客户端接不上真实底包，
 * 而且症状都很隐蔽（命令静默丢失，HTTP 层一切正常）：
 *
 *  1. 线格式是 `game:<码>,<载荷>`，载荷不保证是 JSON。早前的实现对整条消息做
 *     JSON.parse，必然抛异常并把 98 个命令全部退化进一个兜底分支。
 *  2. 命令码要能映射回官方常量名，未知码要能报出确切是哪个码。
 */

function dispatchAndCollect(commandName: string, payload: unknown) {
  return new Promise<{ ok: boolean; error?: string; data?: unknown }>((resolve) => {
    const onResult = (event: Event) => {
      window.removeEventListener("magireco:native-result", onResult);
      resolve((event as CustomEvent).detail);
    };
    window.addEventListener("magireco:native-result", onResult);
    window.dispatchEvent(
      new CustomEvent("magireco:native-command", {
        detail: { type: "MAGIRECO_NATIVE_COMMAND", id: "t1", command: commandName, payload },
      }),
    );
  });
}

describe("命令码表", () => {
  it("从底包 config.js 生成，条数与双向映射自洽", () => {
    expect(OFFICIAL_COMMAND_COUNT).toBe(98);
    expect(Object.keys(OFFICIAL_COMMAND_NAMES)).toHaveLength(OFFICIAL_COMMAND_COUNT);
    expect(Object.keys(OFFICIAL_COMMAND_CODES)).toHaveLength(OFFICIAL_COMMAND_COUNT);
    // 抽查几个跨分段的码，防止生成脚本错位
    expect(OFFICIAL_COMMAND_NAMES[271]).toBe("SCENE_PUSH_QUEST");
    expect(OFFICIAL_COMMAND_NAMES[420]).toBe("DISPLAY_ADD_L2D");
    expect(OFFICIAL_COMMAND_NAMES[100]).toBe("SOUND_BGM_PLAY");
    expect(OFFICIAL_COMMAND_CODES.SCENE_PUSH_QUEST).toBe(271);
  });
});

describe("NativeRouter 命令码解析", () => {
  it("native:<码> 被解析成官方常量名后派发", async () => {
    const router = new NativeRouter();
    let seen: unknown = null;
    router.handle("SCENE_PUSH_QUEST", (payload) => {
      seen = payload;
      return "ok";
    });
    router.start();
    const result = await dispatchAndCollect("native:271", { questId: 7 });
    router.stop();
    expect(result.ok).toBe(true);
    expect(result.data).toBe("ok");
    expect(seen).toEqual({ questId: 7 });
  });

  it("未知命令码保留 native:<码>，错误里能看出是哪个码", async () => {
    const router = new NativeRouter();
    router.start();
    const result = await dispatchAndCollect("native:99999", null);
    router.stop();
    expect(result.ok).toBe(false);
    // 不能退化成笼统的兜底名，必须带上具体的码
    expect(result.error).toBe("UNSUPPORTED_NATIVE_COMMAND:native:99999");
  });

  it("已知但未实现的命令，错误里报官方名而不是裸码", async () => {
    const router = new NativeRouter();
    router.start();
    const result = await dispatchAndCollect("native:420", null);
    router.stop();
    expect(result.ok).toBe(false);
    expect(result.error).toBe("UNSUPPORTED_NATIVE_COMMAND:DISPLAY_ADD_L2D");
  });

  it("非 native: 前缀的命令名原样透传，不受影响", async () => {
    const router = new NativeRouter();
    router.handle("battle.state", () => 42);
    router.start();
    const result = await dispatchAndCollect("battle.state", null);
    router.stop();
    expect(result.ok).toBe(true);
    expect(result.data).toBe(42);
  });
});
