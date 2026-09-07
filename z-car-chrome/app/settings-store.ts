// 設定の型・初期値・localStorage の読み書きをまとめた場所。
// ダッシュボード(app/page.tsx)とスマホ用設定ページ(app/settings/page.tsx)の
// 両方から使うので、片方だけ直しても食い違わないようにしている。

export type CarState = "not_departed" | "departed" | "checked_out";

export type MeterTheme = "green" | "eva";

export type Settings = {
  storeName: string;
  storeDest: string;
  start: string;
  homeDest: string;
  googleRoutesApiKey: string;
  carId: string;
  state: CarState;
  departedAt: string;
  checkedOutAt: string;
  meterTheme: MeterTheme;
  /** 設定同期の合言葉。空なら同期しない。端末内だけに保存し、送信内容には含めない。 */
  syncKey: string;
  /** 最後に同期できた内容の時刻(ミリ秒)。これより新しいものが来たら取り込む。 */
  syncedAt: number;
};

export const defaults: Settings = {
  storeName: "ケーズデンキ 東住吉中野店",
  storeDest: "ケーズデンキ 東住吉中野店",
  start: "10:00",
  homeDest: "",
  googleRoutesApiKey: "",
  carId: "Tanto",
  state: "not_departed",
  departedAt: "",
  checkedOutAt: "",
  meterTheme: "green",
  syncKey: "",
  syncedAt: 0,
};

/** サーバーと共有する項目。走行状態やAPIキーは端末ごとなので送らない。 */
export const SYNCED_FIELDS = [
  "meterTheme",
  "storeName",
  "storeDest",
  "start",
  "homeDest",
  "carId",
] as const;

export type SyncedSettings = Pick<Settings, (typeof SYNCED_FIELDS)[number]>;

export const SYNC_ENDPOINT = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/settings.php`;

/** 合言葉は短すぎると総当たりされるので下限を設ける(PHP側と同じ値)。 */
export const MIN_SYNC_KEY_LENGTH = 8;

/**
 * 合言葉を自動生成する。人が読む必要はないので、紛らわしい文字を除いた
 * 32文字のランダム文字列にする(推測されないだけの長さを確保)。
 */
export const generateSyncKey = () => {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
};

/**
 * 合言葉を他の端末へ渡すためのURL。合言葉は「#」より後ろ(フラグメント)に
 * 置く。フラグメントはサーバーへ送信されないので、アクセスログに残らない。
 */
export const buildSyncHandoffUrl = (key: string) =>
  `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/settings/#k=${encodeURIComponent(key)}`;

/** 受け取ったURLのフラグメントから合言葉を取り出す。無ければ null。 */
export const readSyncKeyFromHash = (hash: string) => {
  const match = /(?:^#|&)k=([^&]+)/.exec(hash);
  if (!match) return null;
  try {
    const key = decodeURIComponent(match[1]).trim();
    return key.length >= MIN_SYNC_KEY_LENGTH ? key : null;
  } catch {
    return null;
  }
};

export const pickSyncedFields = (settings: Settings): SyncedSettings => ({
  meterTheme: settings.meterTheme,
  storeName: settings.storeName,
  storeDest: settings.storeDest,
  start: settings.start,
  homeDest: settings.homeDest,
  carId: settings.carId,
});

const postSync = async (payload: Record<string, unknown>) => {
  const response = await fetch(SYNC_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`sync failed: ${response.status}`);
  return (await response.json()) as {
    ok: boolean;
    settings?: SyncedSettings | null;
    updatedAt?: number;
  };
};

/** サーバーに置いてある設定を読む。まだ何も無ければ settings は null。 */
export const fetchSharedSettings = async (key: string) =>
  postSync({ key });

/** サーバーへ設定を送る。updatedAt は端末の時計(ミリ秒)。 */
export const pushSharedSettings = async (key: string, settings: Settings) =>
  postSync({
    key,
    updatedAt: Date.now(),
    settings: pickSyncedFields(settings),
  });

export const SETTINGS_STORAGE_KEY = "zcar";

export const METER_THEMES: {
  id: MeterTheme;
  name: string;
  caption: string;
  swatch: [string, string];
}[] = [
  {
    id: "green",
    name: "TURQUOISE BLUE",
    caption: "ターコイズ・コックピット",
    swatch: ["#0a1c18", "#39ccd4"],
  },
  {
    id: "eva",
    name: "PATTERN ORANGE",
    caption: "コマンドルーム・コックピット",
    swatch: ["#1a1109", "#ff8a2b"],
  },
];

const isMeterTheme = (value: unknown): value is MeterTheme =>
  value === "green" || value === "eva";

/** 保存済みの設定を読む。壊れていたり廃止した値だった場合は初期値に寄せる。 */
export const readSettings = (): Settings => {
  if (typeof window === "undefined") return defaults;
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}",
    ) as Partial<Settings>;
    return {
      ...defaults,
      ...stored,
      carId:
        !stored.carId || stored.carId === "CAR-01" ? defaults.carId : stored.carId,
      // 廃止したテーマ(RED / AURORA VIOLET)が保存されていたら初期値に戻す。
      meterTheme: isMeterTheme(stored.meterTheme)
        ? stored.meterTheme
        : defaults.meterTheme,
      syncKey: typeof stored.syncKey === "string" ? stored.syncKey : "",
      syncedAt: Number.isFinite(stored.syncedAt) ? Number(stored.syncedAt) : 0,
    };
  } catch {
    return defaults;
  }
};

export const writeSettings = (settings: Settings) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // プライベートブラウズなどで保存できない場合は黙って諦める。
  }
};

/**
 * スマホ判定のしきい値(px)。画面の短辺がこれ未満ならスマホとみなす。
 * 縦持ち・横持ちのどちらでも同じ結果になり、車載機(PORMIDO G10 は
 * 1024×600 で短辺600px)は対象外になる。
 * この値は layout.tsx の先読みスクリプトでも使う。
 */
export const PHONE_MAX_EDGE = 500;

/** スマホでダッシュボードを開いたままにする印(そのタブの間だけ)。 */
export const PHONE_SETUP_SKIP_KEY = "zcar-skip-setup";
