// 設定の型・初期値・localStorage の読み書きをまとめた場所。
// ダッシュボード(app/page.tsx)とスマホ用設定ページ(app/settings/page.tsx)の
// 両方から使うので、片方だけ直しても食い違わないようにしている。

export type CarState = "not_departed" | "departed" | "checked_out";

export type MeterTheme = "green" | "eva";

/** ミュージック画面と待機画面に出す YouTube プレイリスト1件分。 */
export type Playlist = {
  /** 画面に出すジャンル名(例: REGGAE)。 */
  label: string;
  /** YouTube のプレイリストID(PL... で始まる文字列)。 */
  playlistId: string;
};

export const MAX_PLAYLISTS = 8;
export const MAX_PLAYLIST_LABEL = 24;

export const defaultPlaylists: Playlist[] = [
  { label: "YOUTUBE", playlistId: "PLMC9KNkIncKtGvr2kFRuXBVmBev6cAJ2u" },
  { label: "ANIME NOW", playlistId: "PLaodxkj-4NkRFKJZwtT3wvmC3rN8qG2n1" },
  { label: "REGGAE", playlistId: "PLjF50Dlp9ieks26oOKahUFiRTj18o6YGt" },
  { label: "EDM", playlistId: "PLPbMT4wSxX89gUYpgYMrmOqsupKMRR5Rj" },
];

/**
 * 貼り付けられた文字列からプレイリストIDを取り出す。
 * YouTube のURL(list=... を含むもの)でも、ID単体でも受け付ける。
 */
export const extractPlaylistId = (input: string) => {
  const value = input.trim();
  const fromUrl = /[?&]list=([A-Za-z0-9_-]+)/.exec(value);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9_-]{2,64}$/.test(value) ? value : "";
};

const sanitizePlaylists = (value: unknown): Playlist[] => {
  if (!Array.isArray(value)) return defaultPlaylists;
  const cleaned: Playlist[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { label, playlistId } = entry as Partial<Playlist>;
    const id = typeof playlistId === "string" ? extractPlaylistId(playlistId) : "";
    if (!id) continue;
    cleaned.push({
      label: (typeof label === "string" ? label : "").slice(0, MAX_PLAYLIST_LABEL) || "PLAYLIST",
      playlistId: id,
    });
    if (cleaned.length >= MAX_PLAYLISTS) break;
  }
  // 1件も残らないと画面が空になってしまうので、その場合は既定に戻す。
  return cleaned.length > 0 ? cleaned : defaultPlaylists;
};

/** 車のマップ画面に並ぶ 1〜5 のナビ目的地1件分。 */
export type MapDestination = {
  /** ボタンに出す短い名前(例: ケーズ)。空なら未登録。 */
  label: string;
  /** Googleマップに渡す住所または検索語。空なら押せない。 */
  destination: string;
};

/** ボタンはちょうど5つなので、常に5件そろえる。 */
export const MAP_DESTINATION_COUNT = 5;
export const MAX_DESTINATION_LABEL = 8;
export const MAX_DESTINATION_TEXT = 200;

export const defaultMapDestinations: MapDestination[] = [
  { label: "ケーズ", destination: "〒546-0012 大阪府大阪市東住吉区中野1丁目15-9 ケーズデンキ東住吉中野店" },
  { label: "自宅", destination: "〒573-0065 大阪府枚方市出口3丁目1-1" },
  { label: "荻野くん家", destination: "〒545-0031 大阪府大阪市阿倍野区橋本町" },
  { label: "", destination: "" },
  { label: "鳥", destination: "〒534-0024 大阪府大阪市都島区東野田町4丁目6-6" },
];

const sanitizeMapDestinations = (value: unknown): MapDestination[] => {
  // 保存されていない(この機能より前の設定)場合は、これまでの目的地を使う。
  // 配列が入っているときだけ、空欄も「未登録」として尊重する。
  if (!Array.isArray(value)) return defaultMapDestinations;
  const source = value;
  return Array.from({ length: MAP_DESTINATION_COUNT }, (_unused, index) => {
    const entry = source[index];
    if (!entry || typeof entry !== "object") return { label: "", destination: "" };
    const { label, destination } = entry as Partial<MapDestination>;
    return {
      label: (typeof label === "string" ? label : "").slice(0, MAX_DESTINATION_LABEL),
      destination: (typeof destination === "string" ? destination : "").slice(
        0,
        MAX_DESTINATION_TEXT,
      ),
    };
  });
};

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
  /** ミュージック画面に並べる YouTube プレイリスト。 */
  playlists: Playlist[];
  /** 車のマップ画面の 1〜5 のナビ目的地。 */
  mapDestinations: MapDestination[];
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
  playlists: defaultPlaylists,
  mapDestinations: defaultMapDestinations,
};

/** サーバーと共有する項目。走行状態やAPIキーは端末ごとなので送らない。 */
export const SYNCED_FIELDS = [
  "meterTheme",
  "storeName",
  "storeDest",
  "start",
  "homeDest",
  "carId",
  "playlists",
  "mapDestinations",
] as const;

export type SyncedSettings = Pick<Settings, (typeof SYNCED_FIELDS)[number]>;

export const SYNC_ENDPOINT = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/settings.php`;

/** 合言葉は短すぎると総当たりされるので下限を設ける(PHP側と同じ値)。 */
export const MIN_SYNC_KEY_LENGTH = 8;

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
  playlists: settings.playlists,
  mapDestinations: settings.mapDestinations,
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

/**
 * サーバーから戻ってきた内容を、そのまま信用せず整えてから取り込む。
 * (壊れたプレイリストが1件でも入ると画面が崩れるため)
 */
export const sanitizeSyncedSettings = (
  value: Partial<SyncedSettings> | null | undefined,
): Partial<SyncedSettings> => {
  if (!value || typeof value !== "object") return {};
  const cleaned: Partial<SyncedSettings> = {};
  for (const field of SYNCED_FIELDS) {
    if (field === "playlists" || field === "mapDestinations") continue;
    const entry = value[field];
    if (typeof entry === "string") cleaned[field] = entry as never;
  }
  if (isMeterTheme(cleaned.meterTheme)) {
    cleaned.meterTheme = cleaned.meterTheme;
  } else {
    delete cleaned.meterTheme;
  }
  if (Array.isArray(value.playlists)) {
    cleaned.playlists = sanitizePlaylists(value.playlists);
  }
  if (Array.isArray(value.mapDestinations)) {
    cleaned.mapDestinations = sanitizeMapDestinations(value.mapDestinations);
  }
  return cleaned;
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
      playlists: sanitizePlaylists(stored.playlists),
      mapDestinations: sanitizeMapDestinations(stored.mapDestinations),
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
