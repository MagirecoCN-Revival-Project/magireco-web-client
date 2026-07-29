export interface ScenarioCharacter {
  id: string;
  face?: string;
  motion?: number;
  pos?: number;
  voice?: string;
  cheek?: number;
  effect?: number;
}

export interface ScenarioStep {
  chara?: ScenarioCharacter[];
  autoTurn?: number;
  autoTurnLast?: number;
  se?: string;
  [key: string]: unknown;
}

export interface ScenarioDocument {
  version: number;
  story: Record<string, ScenarioStep[]>;
}

export interface StoryAdapter {
  applyCharacters(characters: ScenarioCharacter[]): Promise<void> | void;
  playSound(id: string): Promise<void> | void;
  applyUnknown?(key: string, value: unknown): Promise<void> | void;
}

export class StoryOrchestrator {
  private stopped = false;

  constructor(
    private readonly document: ScenarioDocument,
    private readonly adapter: StoryAdapter,
  ) {}

  stop() {
    this.stopped = true;
  }

  async play(onStep?: (group: string, index: number, step: ScenarioStep) => void) {
    this.stopped = false;
    for (const [group, steps] of Object.entries(this.document.story)) {
      for (let index = 0; index < steps.length; index += 1) {
        if (this.stopped) return;
        const step = steps[index];
        onStep?.(group, index, step);
        if (step.chara) await this.adapter.applyCharacters(step.chara);
        if (step.se) await this.adapter.playSound(step.se);
        for (const [key, value] of Object.entries(step)) {
          if (!["chara", "se", "autoTurn", "autoTurnLast"].includes(key)) {
            await this.adapter.applyUnknown?.(key, value);
          }
        }
        const seconds = Number(step.autoTurn ?? step.autoTurnLast ?? 0);
        if (seconds > 0) await new Promise((resolve) => window.setTimeout(resolve, seconds * 1000));
      }
    }
  }
}
