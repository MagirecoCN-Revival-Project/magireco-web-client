import { describe, expect, it } from "vitest";
import { BattleEngine, calculateDamage, type Fighter } from "./battle";

const fighter = (overrides: Partial<Fighter>): Fighter => ({
  id: "unit",
  element: "fire",
  hp: 1000,
  maxHp: 1000,
  attack: 300,
  defence: 120,
  mp: 0,
  charge: 0,
  effects: [],
  ...overrides,
});

describe("battle engine", () => {
  it("applies elemental affinity and deterministic variance", () => {
    const actor = fighter({ id: "a", element: "fire" });
    const forest = fighter({ id: "forest", element: "forest" });
    const water = fighter({ id: "water", element: "water" });
    const strong = calculateDamage(actor, forest, { actorId: "a", targetId: "forest", disc: "accele" }, 1);
    const weak = calculateDamage(actor, water, { actorId: "a", targetId: "water", disc: "accele" }, 1);
    expect(strong).toBeGreaterThan(weak * 2);
  });

  it("advances state and produces a victory outcome", () => {
    const ally = fighter({ id: "ally", attack: 1000 });
    const enemy = fighter({ id: "enemy", hp: 100, maxHp: 100, element: "forest" });
    const engine = new BattleEngine([ally], [enemy], () => 0.5);
    const events = engine.act({ actorId: "ally", targetId: "enemy", disc: "blast" });
    expect(events.map((event) => event.type)).toContain("defeat");
    expect(engine.outcome()).toBe("victory");
  });

  it("expires timed effects at turn boundaries", () => {
    const ally = fighter({ id: "ally", effects: [{ code: "attack_up", rate: 0.2, turns: 1 }] });
    const engine = new BattleEngine([ally], [fighter({ id: "enemy" })], () => 0.5);
    engine.nextTurn();
    expect(ally.effects?.[0].turns).toBe(0);
  });
});
