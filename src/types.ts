export type AccountStatus = "active" | "limited" | "suspended" | "banned";

export interface BanState {
  active: boolean;
  code?: string;
  reason?: string;
  appealUrl?: string;
  expiresAt?: string | null;
}

export interface Account {
  id: string;
  displayName: string;
  playerCode: string;
  rank: number;
  status: AccountStatus;
  createdAt: string;
  lastLoginAt: string;
  currencies: {
    magiaStone: number;
    supportPoint: number;
    coin: number;
  };
  ban: BanState;
}

export interface DeviceSession {
  id: string;
  deviceName: string;
  platform: string;
  ipRegion: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
}

export interface AuthResult {
  account: Account;
  tokens: AuthTokens;
  session: DeviceSession;
}

export type ResourceBundleState = "required" | "optional" | "streaming";

export interface ResourceFile {
  id: string;
  path: string;
  bytes: number;
  sha256: string;
  contentType: string;
  url?: string;
}

export interface ResourceBundle {
  id: string;
  title: string;
  description: string;
  version: string;
  sizeBytes: number;
  state: ResourceBundleState;
  tags: string[];
  files: ResourceFile[];
}

export interface ResourceManifest {
  schemaVersion: 1;
  revision: string;
  generatedAt: string;
  minimumClientVersion: string;
  bundles: ResourceBundle[];
  signature?: string;
  payload?: string;
  resourceToken?: string;
}

export interface ServerStatus {
  state: "online" | "maintenance" | "degraded";
  region: string;
  apiVersion: string;
  manifestRevision: string;
  message: string;
}

export interface Character {
  id: string;
  name: string;
  kana: string;
  attribute: "light" | "dark" | "fire" | "water" | "forest" | "void";
  rarity: number;
  level: number;
  relation: string;
  accent: string;
  initials: string;
  summary: string;
  cardArtUrl?: string;
}

export interface StoryScene {
  id: string;
  speaker: string;
  speakerId?: string;
  text: string;
  stage: "day" | "sunset" | "night" | "interior";
  mood?: "normal" | "soft" | "urgent";
  cue?: string;
}

export interface StoryEpisode {
  id: string;
  title: string;
  subtitle: string;
  chapter: string;
  duration: string;
  scenes: StoryScene[];
  bundleId: string;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  requestId: string;
  details?: Record<string, unknown>;
}

export interface RuntimeConfig {
  apiBaseUrl: string;
  assetEntry: string;
  accountId: string;
  accessToken?: string;
}

export interface RuntimeStats {
  files: number;
  bytes: number;
  entryReady: boolean;
}

export type NativeScene = "web" | "story" | "battle" | "live2d";

export interface NativeCommand {
  id: string;
  command: string;
  payload: unknown;
}
