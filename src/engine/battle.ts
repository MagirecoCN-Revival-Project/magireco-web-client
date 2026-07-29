export type Element = "fire" | "water" | "forest" | "light" | "dark" | "void";
export type Disc = "accele" | "blast" | "charge";

export interface Fighter {
  id: string;
  element: Element;
  hp: number;
  maxHp: number;
  attack: number;
  defence: number;
  mp: number;
  charge: number;
  effects?: BattleEffect[];
}

export interface BattleEffect {
  code: "attack_up" | "attack_down" | "defence_up" | "defence_down" | "damage_cut" | "critical";
  rate: number;
  turns: number;
}

export interface AttackAction {
  actorId: string;
  targetId: string;
  disc: Disc;
  blastTargets?: number;
}

export interface BattleEvent {
  type: "damage" | "mp" | "defeat" | "turn";
  actorId?: string;
  targetId?: string;
  value?: number;
  turn: number;
}

const affinity: Record<Element, Partial<Record<Element, number>>> = {
  fire: { forest: 1.5, water: 0.5 },
  water: { fire: 1.5, forest: 0.5 },
  forest: { water: 1.5, fire: 0.5 },
  light: { dark: 1.5 },
  dark: { light: 1.5 },
  void: {},
};

const discPower: Record<Disc, number> = { accele: 1, blast: 0.9, charge: 0.8 };

function effectRate(fighter: Fighter, positive: BattleEffect["code"], negative: BattleEffect["code"]) {
  return (fighter.effects ?? []).reduce((sum, effect) => {
    if (effect.turns <= 0) return sum;
    if (effect.code === positive) return sum + effect.rate;
    if (effect.code === negative) return sum - effect.rate;
    return sum;
  }, 0);
}

export function calculateDamage(actor: Fighter, target: Fighter, action: AttackAction, random = 1): number {
  const attackRate = Math.max(-0.8, Math.min(3, effectRate(actor, "attack_up", "attack_down")));
  const defenceRate = Math.max(-0.8, Math.min(3, effectRate(target, "defence_up", "defence_down")));
  const cut = Math.max(
    0,
    Math.min(0.95, (target.effects ?? []).filter((e) => e.code === "damage_cut").reduce((n, e) => n + e.rate, 0)),
  );
  const critical = (actor.effects ?? []).some((e) => e.code === "critical" && e.turns > 0) ? 2 : 1;
  const base = Math.max(1, actor.attack * (1 + attackRate) - target.defence * (1 + defenceRate) / 3);
  const element = affinity[actor.element][target.element] ?? 1;
  const charge = action.disc === "charge" ? 1 : 1 + Math.min(actor.charge, 20) * 0.05;
  const blast = action.disc === "blast" ? 1 / Math.max(1, action.blastTargets ?? 1) ** 0.15 : 1;
  return Math.max(1, Math.floor(base * discPower[action.disc] * element * charge * blast * critical * (1 - cut) * random));
}

export class BattleEngine {
  readonly events: BattleEvent[] = [];
  turn = 1;

  constructor(
    readonly allies: Fighter[],
    readonly enemies: Fighter[],
    private readonly rng: () => number = Math.random,
  ) {}

  fighter(id: string): Fighter {
    const value = [...this.allies, ...this.enemies].find((fighter) => fighter.id === id);
    if (!value) throw new Error(`未知战斗单位：${id}`);
    return value;
  }

  act(action: AttackAction): BattleEvent[] {
    const actor = this.fighter(action.actorId);
    const target = this.fighter(action.targetId);
    if (actor.hp <= 0 || target.hp <= 0) throw new Error("已退场单位不能行动或成为目标");
    const variance = 0.95 + this.rng() * 0.1;
    const damage = calculateDamage(actor, target, action, variance);
    target.hp = Math.max(0, target.hp - damage);
    if (action.disc === "charge") actor.charge = Math.min(20, actor.charge + 1);
    else if (actor.charge > 0) actor.charge = 0;
    if (action.disc === "accele") {
      actor.mp = Math.min(200, actor.mp + 10);
      this.events.push({ type: "mp", actorId: actor.id, value: 10, turn: this.turn });
    }
    const result: BattleEvent[] = [
      { type: "damage", actorId: actor.id, targetId: target.id, value: damage, turn: this.turn },
    ];
    if (target.hp === 0) result.push({ type: "defeat", targetId: target.id, turn: this.turn });
    this.events.push(...result);
    return result;
  }

  nextTurn() {
    this.turn += 1;
    for (const fighter of [...this.allies, ...this.enemies]) {
      for (const effect of fighter.effects ?? []) effect.turns = Math.max(0, effect.turns - 1);
    }
    this.events.push({ type: "turn", turn: this.turn });
  }

  outcome(): "playing" | "victory" | "defeat" {
    if (this.enemies.every((fighter) => fighter.hp <= 0)) return "victory";
    if (this.allies.every((fighter) => fighter.hp <= 0)) return "defeat";
    return "playing";
  }
}
