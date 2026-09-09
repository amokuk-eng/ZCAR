"use client";

import { useEffect, useState } from "react";
import {
  defaults,
  extractPlaylistId,
  fetchSharedSettings,
  mergeFuelEntries,
  MAX_DESTINATION_LABEL,
  MAX_DESTINATION_TEXT,
  MAX_PLAYLISTS,
  MAX_PLAYLIST_LABEL,
  METER_THEMES,
  deleteMusicTrack,
  fetchMusicTracks,
  MAX_MUSIC_PLAYLISTS,
  MAX_MUSIC_PLAYLIST_NAME,
  saveMusicPlaylists,
  MIN_SYNC_KEY_LENGTH,
  PHONE_LONG_EDGE_MAX,
  pushSharedSettings,
  uploadMusicFiles,
  type MusicPlaylist,
  type MusicTrack,
  readSettings,
  readSyncKeyFromHash,
  sanitizeSyncedSettings,
  writeSettings,
  type FuelEntry,
  type MapDestination,
  type PlayCommand,
  type MeterTheme,
  type Playlist,
  type Settings,
} from "../settings-store";

type SyncState = "idle" | "sending" | "done" | "error";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** 日本時間での今日 (YYYY-MM-DD)。 */
const todayKey = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());

const emptyFuelDraft = {
  date: todayKey(),
  liters: "",
  distanceKm: "",
  amountYen: "",
};

/** Googleマップを案内モードで開くURL。車側の目的地ボタンと同じ形式。 */
const navigationUrl = (destination: string) =>
  "https://www.google.com/maps/dir/?api=1&destination=" +
  encodeURIComponent(destination) +
  "&travelmode=driving&dir_action=navigate";

export default function PhoneSettingsPage() {
  const [draft, setDraft] = useState<Settings>(defaults);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [handoffDone, setHandoffDone] = useState(false);
  // 最初はどのカードも閉じておき、触りたいものだけ開く(1枚ずつ)。
  const [openCard, setOpenCard] = useState<string | null>(null);
  const toggleCard = (id: string) =>
    setOpenCard((current) => (current === id ? null : id));
  // ナビカードの中の目的地編集。ふだんは畳んでおく。
  const [destEditOpen, setDestEditOpen] = useState(false);
  // 車に再生を頼んだ結果の表示("送信中" / プレイリスト名 / エラー)。
  const [playState, setPlayState] = useState<
    { kind: "sending" | "sent" | "error"; label: string } | null
  >(null);
  const [fuelDraft, setFuelDraft] = useState(emptyFuelDraft);
  const [fuelSaved, setFuelSaved] = useState(false);
  // 車載機のような大きい画面から来たかどうか(描画後に測る)。
  const [wideScreen, setWideScreen] = useState(false);
  // 音源置き場(サーバー)の中身。
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [tracksBytes, setTracksBytes] = useState(0);
  const [musicPlaylists, setMusicPlaylists] = useState<MusicPlaylist[]>([]);
  // 車で流すプレイリスト("" は「すべての曲」)。
  const [activePlaylistId, setActivePlaylistId] = useState("");
  // いま編集しているプレイリスト("" のときは曲の追加・削除だけ)。
  const [editingPlaylistId, setEditingPlaylistId] = useState("");
  const [musicState, setMusicState] = useState<
    { kind: "idle" | "loading" | "uploading" | "error"; note?: string }
  >({ kind: "idle" });

  useEffect(() => {
    setWideScreen(
      Math.max(window.innerWidth, window.innerHeight) >= PHONE_LONG_EDGE_MAX,
    );
  }, []);

  useEffect(() => {
    let stored = readSettings();

    // QRを読み取って来た場合、URLの「#」以降に合言葉が入っている。
    const handedOff = readSyncKeyFromHash(window.location.hash);
    if (handedOff) {
      // 合言葉が変わったら、それまでの同期時刻は無効。0に戻して車側の内容を取り込む。
      stored = { ...stored, syncKey: handedOff, syncedAt: 0 };
      writeSettings(stored);
      setHandoffDone(true);
      // 合言葉を履歴やアドレスバーに残さない。
      window.history.replaceState(null, "", window.location.pathname);
    }

    setDraft(stored);
    setReady(true);

    // 車側で先に変更されているかもしれないので、開いた時点で一度取りに行く。
    const key = stored.syncKey.trim();
    if (key.length < MIN_SYNC_KEY_LENGTH) return;
    const base = stored;
    void fetchSharedSettings(key)
      .then((result) => {
        const updatedAt = result.updatedAt ?? 0;
        if (!result.ok || !result.settings || updatedAt <= base.syncedAt) return;
        const shared = sanitizeSyncedSettings(result.settings);
        const merged = {
          ...base,
          ...shared,
          // 給油記録は車の分も残す(消す操作が無いので足し合わせる)。
          fuelEntries: mergeFuelEntries(base.fuelEntries, shared.fuelEntries ?? []),
          syncedAt: updatedAt,
        };
        setDraft(merged);
        writeSettings(merged);
      })
      .catch(() => undefined);
  }, []);

  // 保存後の「保存しました」表示は数秒で消す。
  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 2600);
    return () => window.clearTimeout(timer);
  }, [saved]);

  useEffect(() => {
    if (!fuelSaved) return;
    const timer = window.setTimeout(() => setFuelSaved(false), 3000);
    return () => window.clearTimeout(timer);
  }, [fuelSaved]);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setSyncState("idle");
  };


  /** 保存した内容を車側にも届ける。 */
  const sendToCar = async (settings: Settings) => {
    if (settings.syncKey.trim().length < MIN_SYNC_KEY_LENGTH) return;
    setSyncState("sending");
    try {
      const result = await pushSharedSettings(settings.syncKey.trim(), settings);
      const updatedAt = result.updatedAt ?? Date.now();
      const synced = { ...settings, syncedAt: updatedAt };
      setDraft(synced);
      writeSettings(synced);
      setSyncState("done");
    } catch {
      setSyncState("error");
    }
  };

  // 住所が入っている目的地だけをナビの候補にする(番号は設定の並び順)。
  const navigableDestinations = draft.mapDestinations
    .map((entry, index) => ({ entry, number: index + 1 }))
    .filter(({ entry }) => entry.destination.trim() !== "");

  const updateDestination = (index: number, patch: Partial<MapDestination>) => {
    setDraft((current) => ({
      ...current,
      mapDestinations: current.mapDestinations.map((entry, i) =>
        i === index ? { ...entry, ...patch } : entry,
      ),
    }));
    setSaved(false);
    setSyncState("idle");
  };

  const syncKey = draft.syncKey.trim();
  const canReachCar = syncKey.length >= MIN_SYNC_KEY_LENGTH;

  /** サーバーから返ってきた中身を画面に反映する。 */
  const applyLibrary = (result: {
    tracks: MusicTrack[];
    totalBytes: number;
    playlists: MusicPlaylist[];
    activePlaylistId: string;
  }) => {
    setTracks(result.tracks);
    setTracksBytes(result.totalBytes);
    setMusicPlaylists(result.playlists);
    setActivePlaylistId(result.activePlaylistId);
  };

  // 音源置き場の中身は、カードを開いたときに読みに行く。
  useEffect(() => {
    if (openCard !== "files" || !canReachCar) return;
    let active = true;
    setMusicState({ kind: "loading" });
    fetchMusicTracks(syncKey)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setMusicState({ kind: "error", note: "一覧を取得できませんでした" });
          return;
        }
        applyLibrary(result);
        setMusicState({ kind: "idle" });
      })
      .catch(() => {
        if (active) setMusicState({ kind: "error", note: "通信できませんでした" });
      });
    return () => {
      active = false;
    };
  }, [openCard, canReachCar, syncKey]);

  /** 選んだ音楽ファイルを預ける。 */
  const uploadFiles = async (fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList) : [];
    if (!files.length || !canReachCar) return;
    setMusicState({ kind: "uploading", note: `${files.length}曲を送っています…` });
    try {
      const result = await uploadMusicFiles(syncKey, files);
      if (!result.ok) {
        setMusicState({ kind: "error", note: "アップロードできませんでした" });
        return;
      }
      applyLibrary(result);
      const skipped = result.skipped ?? [];
      setMusicState({
        kind: "idle",
        note: skipped.length
          ? `${result.saved ?? 0}曲を追加。${skipped.length}曲は追加できませんでした（${skipped[0].reason}）`
          : `${result.saved ?? 0}曲を追加しました`,
      });
    } catch {
      setMusicState({ kind: "error", note: "通信できませんでした" });
    }
  };

  /** 置いてある曲を消す。 */
  const removeTrack = async (track: MusicTrack) => {
    if (!canReachCar) return;
    if (!window.confirm(`「${track.title}」を消します。よろしいですか？`)) return;
    try {
      const result = await deleteMusicTrack(syncKey, track.id);
      if (!result.ok) {
        setMusicState({ kind: "error", note: "消せませんでした" });
        return;
      }
      applyLibrary(result);
      setMusicState({ kind: "idle", note: "1曲消しました" });
    } catch {
      setMusicState({ kind: "error", note: "通信できませんでした" });
    }
  };

  /** プレイリストの変更をサーバーに保存する。 */
  const storePlaylists = async (
    nextPlaylists: MusicPlaylist[],
    nextActiveId: string,
  ) => {
    setMusicPlaylists(nextPlaylists);
    setActivePlaylistId(nextActiveId);
    try {
      const result = await saveMusicPlaylists(syncKey, nextPlaylists, nextActiveId);
      if (!result.ok) {
        setMusicState({ kind: "error", note: "保存できませんでした" });
        return;
      }
      applyLibrary(result);
      setMusicState({ kind: "idle", note: "プレイリストを保存しました" });
    } catch {
      setMusicState({ kind: "error", note: "通信できませんでした" });
    }
  };

  /** 新しいプレイリストを作る。 */
  const createMusicPlaylist = () => {
    if (musicPlaylists.length >= MAX_MUSIC_PLAYLISTS) {
      setMusicState({ kind: "error", note: "プレイリストが多すぎます" });
      return;
    }
    const name = window.prompt("プレイリストの名前", "ドライブ");
    if (name === null) return;
    const id = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    const next = [
      ...musicPlaylists,
      {
        id,
        name: name.trim().slice(0, MAX_MUSIC_PLAYLIST_NAME) || "PLAYLIST",
        trackIds: [],
      },
    ];
    setEditingPlaylistId(id);
    void storePlaylists(next, id);
  };

  /** 名前を変える。 */
  const renameMusicPlaylist = (playlist: MusicPlaylist) => {
    const name = window.prompt("プレイリストの名前", playlist.name);
    if (name === null) return;
    void storePlaylists(
      musicPlaylists.map((entry) =>
        entry.id === playlist.id
          ? {
              ...entry,
              name: name.trim().slice(0, MAX_MUSIC_PLAYLIST_NAME) || "PLAYLIST",
            }
          : entry,
      ),
      activePlaylistId,
    );
  };

  /** プレイリストを消す(曲そのものは残る)。 */
  const removeMusicPlaylist = (playlist: MusicPlaylist) => {
    if (!window.confirm(`「${playlist.name}」を消します。曲は残ります。`)) return;
    const next = musicPlaylists.filter((entry) => entry.id !== playlist.id);
    if (editingPlaylistId === playlist.id) setEditingPlaylistId("");
    void storePlaylists(next, activePlaylistId === playlist.id ? "" : activePlaylistId);
  };

  /** 曲をプレイリストに入れる / 外す。 */
  const toggleTrackInPlaylist = (playlistId: string, trackId: string) => {
    void storePlaylists(
      musicPlaylists.map((entry) => {
        if (entry.id !== playlistId) return entry;
        const has = entry.trackIds.includes(trackId);
        return {
          ...entry,
          trackIds: has
            ? entry.trackIds.filter((id) => id !== trackId)
            : [...entry.trackIds, trackId],
        };
      }),
      activePlaylistId,
    );
  };

  /** 車で流す一覧を切り替える。 */
  const selectActivePlaylist = (id: string) => {
    void storePlaylists(musicPlaylists, id);
  };

  const editingPlaylist =
    musicPlaylists.find((entry) => entry.id === editingPlaylistId) ?? null;

  /** 車に「これを再生して」と伝える。設定と同じ経路で送る。 */
  const playOnCar = async (entry: Playlist) => {
    const playlistId = extractPlaylistId(entry.playlistId);
    if (!playlistId || !canReachCar) return;
    const label = entry.label.trim() || "MUSIC";
    const command: PlayCommand = {
      playlistId,
      label,
      requestedAt: Date.now(),
    };
    const next = { ...draft, nowPlaying: command };
    setDraft(next);
    writeSettings(next);
    setPlayState({ kind: "sending", label });
    try {
      await pushSharedSettings(syncKey, next);
      setPlayState({ kind: "sent", label });
    } catch {
      setPlayState({ kind: "error", label });
    }
  };

  const fuelLiters = Number.parseFloat(fuelDraft.liters);
  const fuelDistance = Number.parseFloat(fuelDraft.distanceKm);
  const fuelAmount = Number.parseFloat(fuelDraft.amountYen);
  const fuelDraftIsValid =
    /^\d{4}-\d{2}-\d{2}$/.test(fuelDraft.date) &&
    Number.isFinite(fuelLiters) &&
    fuelLiters > 0 &&
    Number.isFinite(fuelDistance) &&
    fuelDistance >= 0 &&
    Number.isFinite(fuelAmount) &&
    fuelAmount >= 0;
  /** この給油分の燃費(満タン法)。 */
  const fuelDraftEconomy = fuelDraftIsValid ? fuelDistance / fuelLiters : null;
  const recentFuel = draft.fuelEntries.slice(0, 5);

  /** 給油を記録して、車にも届ける。 */
  const recordFuel = () => {
    if (!fuelDraftIsValid) return;
    const now = Date.now();
    const entry: FuelEntry = {
      id: `${now}`,
      date: fuelDraft.date,
      liters: fuelLiters,
      distanceKm: fuelDistance,
      amountYen: Math.round(fuelAmount),
      createdAt: now,
    };
    const next = {
      ...draft,
      fuelEntries: mergeFuelEntries(draft.fuelEntries, [entry]),
    };
    setDraft(next);
    writeSettings(next);
    setFuelDraft({ ...emptyFuelDraft, date: todayKey() });
    setFuelSaved(true);
    void sendToCar(next);
  };

  const updatePlaylist = (index: number, patch: Partial<Playlist>) => {
    setDraft((current) => ({
      ...current,
      playlists: current.playlists.map((entry, i) =>
        i === index ? { ...entry, ...patch } : entry,
      ),
    }));
    setSaved(false);
    setSyncState("idle");
  };

  const addPlaylist = () => {
    if (draft.playlists.length >= MAX_PLAYLISTS) return;
    update("playlists", [...draft.playlists, { label: "", playlistId: "" }]);
  };

  const removePlaylist = (index: number) => {
    // 全部消えると画面が空になるので、最後の1件は残す。
    if (draft.playlists.length <= 1) return;
    update(
      "playlists",
      draft.playlists.filter((_, i) => i !== index),
    );
  };

  const save = () => {
    const next: Settings = {
      ...draft,
      storeName: draft.storeName.trim() || defaults.storeName,
      storeDest:
        draft.storeDest.trim() || draft.storeName.trim() || defaults.storeDest,
      start: draft.start || defaults.start,
      carId: draft.carId.trim() || defaults.carId,
      mapDestinations: draft.mapDestinations.map((entry) => ({
        label: entry.label.trim().slice(0, MAX_DESTINATION_LABEL),
        destination: entry.destination.trim().slice(0, MAX_DESTINATION_TEXT),
      })),
      // URLを貼られてもIDだけ取り出す。IDが無い行は保存しない。
      playlists: draft.playlists
        .map((entry) => ({
          label: entry.label.trim().slice(0, MAX_PLAYLIST_LABEL),
          playlistId: extractPlaylistId(entry.playlistId),
        }))
        .filter((entry) => entry.playlistId !== "")
        .map((entry) => ({ ...entry, label: entry.label || "PLAYLIST" })),
    };
    if (next.playlists.length === 0) next.playlists = defaults.playlists;
    setDraft(next);
    writeSettings(next);
    setSaved(true);
    void sendToCar(next);
  };

  return (
    <main className="zsetup" aria-busy={!ready}>
      <header className="zsetup-head">
        <p className="zsetup-eyebrow">Z PORTAL | CAR</p>
        <h1>Z CAR 設定</h1>
        <p className="zsetup-lead">
          {handoffDone
            ? "QRから合言葉を読み込みました。車と同じ設定になります。"
            : "この端末（スマートフォン）に保存される設定です。"}
        </p>
      </header>

      <section className={`zsetup-section zsetup-card zsetup-nav${openCard === "nav" ? " is-open" : ""}`}>
        <button
          type="button"
          className="zsetup-card-head"
          aria-expanded={openCard === "nav"}
          onClick={() => toggleCard("nav")}
        >
          <span>
            <b>ナビ</b>
            <small>設定した目的地へGoogleマップで案内を開始します</small>
          </span>
          <i aria-hidden="true" />
        </button>
        {openCard === "nav" ? (
          <div className="zsetup-card-body">
        <div className="zsetup-nav-list">
            {navigableDestinations.length > 0 ? (
              navigableDestinations.map(({ entry, number }) => (
                <a
                  className="zsetup-nav-target"
                  key={number}
                  href={navigationUrl(entry.destination.trim())}
                >
                  <b>{number}</b>
                  <span>
                    <strong>{entry.label.trim() || "目的地"}</strong>
                    <small>{entry.destination.trim()}</small>
                  </span>
                  <em>案内開始</em>
                </a>
              ))
            ) : (
              <p className="zsetup-nav-empty">
                下の「ナビの目的地」に住所を入れると、ここに並びます。
              </p>
            )}
        </div>
        <button
          type="button"
          className="zsetup-dest-toggle"
          aria-expanded={destEditOpen}
          onClick={() => setDestEditOpen((open) => !open)}
        >
          {destEditOpen ? "目的地の編集を閉じる" : "目的地を編集する"}
        </button>
        {destEditOpen ? (
          <div className="zsetup-dest-edit">
        <div className="zsetup-playlists">
          {draft.mapDestinations.map((entry, index) => (
            <div className="zsetup-playlist" key={index}>
              <div className="zsetup-playlist-head">
                <b>{index + 1}</b>
                <input
                  className="zsetup-playlist-label"
                  placeholder="名前（例: ケーズ）"
                  maxLength={MAX_DESTINATION_LABEL}
                  value={entry.label}
                  onChange={(event) =>
                    updateDestination(index, { label: event.target.value })
                  }
                />
              </div>
              <input
                placeholder="住所または検索語（空欄なら未登録）"
                maxLength={MAX_DESTINATION_TEXT}
                value={entry.destination}
                onChange={(event) =>
                  updateDestination(index, { destination: event.target.value })
                }
              />
            </div>
          ))}
        </div>
        <p className="zsetup-sync-note">
          住所でも「ケーズデンキ 東住吉中野店」のような店名でも構いません。
          空欄にした番号は、この一覧にも車のボタンにも出なくなります。
        </p>
          </div>
        ) : null}
          </div>
        ) : null}
      </section>

      <section className={`zsetup-section zsetup-card${openCard === "theme" ? " is-open" : ""}`}>
        <button
          type="button"
          className="zsetup-card-head"
          aria-expanded={openCard === "theme"}
          onClick={() => toggleCard("theme")}
        >
          <span>
            <b>メーターテーマ</b>
            <small>フルスクリーン表示の配色</small>
          </span>
          <i aria-hidden="true" />
        </button>
        {openCard === "theme" ? (
          <div className="zsetup-card-body">
        <div className="zsetup-themes">
          {METER_THEMES.map((theme) => {
            const active = draft.meterTheme === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                className={active ? "zsetup-theme is-active" : "zsetup-theme"}
                aria-pressed={active}
                onClick={() => update("meterTheme", theme.id as MeterTheme)}
              >
                <i
                  aria-hidden="true"
                  style={{
                    background: `linear-gradient(135deg, ${theme.swatch[0]}, ${theme.swatch[1]})`,
                  }}
                />
                <span>
                  <b>{theme.name}</b>
                  <small>{theme.caption}</small>
                </span>
                <em>{active ? "選択中" : "選ぶ"}</em>
              </button>
            );
          })}
        </div>
          </div>
        ) : null}
      </section>

      <section className={`zsetup-section zsetup-card${openCard === "fuel" ? " is-open" : ""}`}>
        <button
          type="button"
          className="zsetup-card-head"
          aria-expanded={openCard === "fuel"}
          onClick={() => toggleCard("fuel")}
        >
          <span>
            <b>満タン法 燃費記録</b>
            <small>給油のたびに入力すると実燃費が出ます</small>
          </span>
          <i aria-hidden="true" />
        </button>
        {openCard === "fuel" ? (
          <div className="zsetup-card-body">
        <div className="zsetup-fuel-form">
          <label className="zsetup-field">
            <span>給油日</span>
            <input
              type="date"
              value={fuelDraft.date}
              onChange={(event) =>
                setFuelDraft({ ...fuelDraft, date: event.target.value })
              }
            />
          </label>
          <label className="zsetup-field">
            <span>給油量（L）</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={fuelDraft.liters}
              onChange={(event) =>
                setFuelDraft({ ...fuelDraft, liters: event.target.value })
              }
            />
          </label>
          <label className="zsetup-field">
            <span>走行距離（km）</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              placeholder="前回の給油からの距離"
              value={fuelDraft.distanceKm}
              onChange={(event) =>
                setFuelDraft({ ...fuelDraft, distanceKm: event.target.value })
              }
            />
          </label>
          <label className="zsetup-field">
            <span>給油金額（円）</span>
            <input
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              placeholder="0"
              value={fuelDraft.amountYen}
              onChange={(event) =>
                setFuelDraft({ ...fuelDraft, amountYen: event.target.value })
              }
            />
          </label>
        </div>
        <p className="zsetup-fuel-preview">
          今回の燃費{" "}
          <b>
            {fuelDraftEconomy === null ? "—" : fuelDraftEconomy.toFixed(1)}
          </b>{" "}
          km/L
        </p>
        <button
          type="button"
          className="zsetup-fuel-save"
          disabled={!fuelDraftIsValid}
          onClick={recordFuel}
        >
          記録する
        </button>
        <p className="zsetup-play-state" role="status">
          {fuelSaved ? "記録しました（車にも共有されます）" : ""}
        </p>
        {recentFuel.length > 0 ? (
          <div className="zsetup-fuel-history">
            <h3>給油履歴</h3>
            <ul>
              {recentFuel.map((entry) => (
                <li key={entry.id}>
                  <b>{entry.date}</b>
                  <span>
                    {(entry.distanceKm / entry.liters).toFixed(1)}
                    <small> km/L</small>
                  </span>
                  <em>
                    {entry.liters.toFixed(2)} L / {Math.round(entry.amountYen)} 円
                  </em>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
          </div>
        ) : null}
      </section>



      <section className={`zsetup-section zsetup-card${openCard === "music" ? " is-open" : ""}`}>
        <button
          type="button"
          className="zsetup-card-head"
          aria-expanded={openCard === "music"}
          onClick={() => toggleCard("music")}
        >
          <span>
            <b>ミュージック</b>
            <small>車で鳴らす YouTube プレイリスト</small>
          </span>
          <i aria-hidden="true" />
        </button>
        {openCard === "music" ? (
          <div className="zsetup-card-body">
        <div className="zsetup-playlists">
          {draft.playlists.map((playlist, index) => (
            <div className="zsetup-playlist" key={index}>
              <div className="zsetup-playlist-head">
                <b>{String(index + 1).padStart(2, "0")}</b>
                <input
                  className="zsetup-playlist-label"
                  placeholder="ジャンル名（例: REGGAE）"
                  maxLength={MAX_PLAYLIST_LABEL}
                  value={playlist.label}
                  onChange={(event) =>
                    updatePlaylist(index, { label: event.target.value })
                  }
                />
                <button
                  type="button"
                  className="zsetup-playlist-remove"
                  aria-label={`${index + 1}番目を削除`}
                  disabled={draft.playlists.length <= 1}
                  onClick={() => removePlaylist(index)}
                >
                  削除
                </button>
              </div>
              <input
                className="zsetup-playlist-id"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="YouTubeのプレイリストURL または ID"
                value={playlist.playlistId}
                onChange={(event) =>
                  updatePlaylist(index, { playlistId: event.target.value })
                }
              />
              {extractPlaylistId(playlist.playlistId) ? (
                <button
                  type="button"
                  className="zsetup-playlist-play"
                  disabled={!canReachCar}
                  onClick={() => void playOnCar(playlist)}
                >
                  ▶ 車で再生
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="zsetup-playlist-add"
          disabled={draft.playlists.length >= MAX_PLAYLISTS}
          onClick={addPlaylist}
        >
          {draft.playlists.length >= MAX_PLAYLISTS
            ? `追加できるのは${MAX_PLAYLISTS}件までです`
            : "ジャンルを追加"}
        </button>
        <p className="zsetup-play-state" role="status">
          {playState?.kind === "sending"
            ? `${playState.label} を車に送信中…`
            : playState?.kind === "sent"
              ? `${playState.label} を車に送りました（30秒以内に鳴ります）`
              : playState?.kind === "error"
                ? "車に送れませんでした（通信を確認してください）"
                : ""}
        </p>
        <p className="zsetup-sync-note">
          YouTubeでプレイリストを開いて、アドレスをそのまま貼り付けてください
          （アドレスの中の list= の部分だけ自動で読み取ります）。
          「車で再生」を押すと、車の画面がそのプレイリストを鳴らします。
          この端末では再生しません（指示を送るだけです）。
          運転中の操作は危険なので、出発前に選んでおいてください。
        </p>
          </div>
        ) : null}
      </section>

      <section className={`zsetup-section zsetup-card${openCard === "files" ? " is-open" : ""}`}>
        <button
          type="button"
          className="zsetup-card-head"
          aria-expanded={openCard === "files"}
          onClick={() => toggleCard("files")}
        >
          <span>
            <b>音源フォルダ</b>
            <small>車のプレイヤーで鳴らす音楽ファイル</small>
          </span>
          <i aria-hidden="true" />
        </button>
        {openCard === "files" ? (
          <div className="zsetup-card-body">
            {canReachCar ? (
              <>
                <label className="zsetup-upload">
                  <input
                    type="file"
                    multiple
                    accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac"
                    onChange={(event) => {
                      void uploadFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  <span>音楽ファイルを追加</span>
                </label>
                <p className="zsetup-music-state" role="status">
                  {musicState.kind === "loading"
                    ? "読み込み中…"
                    : musicState.kind === "uploading"
                      ? musicState.note
                      : musicState.kind === "error"
                        ? musicState.note
                        : musicState.note ?? ""}
                </p>
                {/* 車で流す一覧を選ぶ。左端は「すべての曲」。 */}
                <div className="zsetup-lists">
                  <button
                    type="button"
                    className={`zsetup-list${activePlaylistId === "" ? " is-active" : ""}`}
                    onClick={() => {
                      setEditingPlaylistId("");
                      selectActivePlaylist("");
                    }}
                  >
                    <b>すべての曲</b>
                    <small>{tracks.length}曲</small>
                  </button>
                  {musicPlaylists.map((playlist) => (
                    <button
                      key={playlist.id}
                      type="button"
                      className={`zsetup-list${activePlaylistId === playlist.id ? " is-active" : ""}`}
                      onClick={() => {
                        setEditingPlaylistId(playlist.id);
                        selectActivePlaylist(playlist.id);
                      }}
                    >
                      <b>{playlist.name}</b>
                      <small>{playlist.trackIds.length}曲</small>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="zsetup-list zsetup-list-add"
                    onClick={createMusicPlaylist}
                  >
                    <b>＋ 作る</b>
                    <small>プレイリスト</small>
                  </button>
                </div>

                {editingPlaylist ? (
                  <div className="zsetup-list-tools">
                    <span>
                      「{editingPlaylist.name}」に入れる曲を選んでください
                    </span>
                    <div>
                      <button type="button" onClick={() => renameMusicPlaylist(editingPlaylist)}>
                        名前を変える
                      </button>
                      <button type="button" onClick={() => removeMusicPlaylist(editingPlaylist)}>
                        消す
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="zsetup-tracks">
                  {tracks.length === 0 ? (
                    <p className="zsetup-tracks-empty">
                      まだ1曲も入っていません。
                    </p>
                  ) : (
                    tracks.map((track, index) => {
                      const inList =
                        !!editingPlaylist && editingPlaylist.trackIds.includes(track.id);
                      return (
                        <div
                          className={`zsetup-track${inList ? " is-in-list" : ""}`}
                          key={track.id}
                        >
                          <b>{String(index + 1).padStart(2, "0")}</b>
                          <span>
                            <strong>{track.title}</strong>
                            <small>{(track.size / 1048576).toFixed(1)} MB</small>
                          </span>
                          {editingPlaylist ? (
                            <button
                              type="button"
                              className="zsetup-track-toggle"
                              onClick={() =>
                                toggleTrackInPlaylist(editingPlaylist.id, track.id)
                              }
                              aria-pressed={inList}
                            >
                              {inList ? "入れた" : "入れる"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void removeTrack(track)}
                              aria-label={`${track.title} を消す`}
                            >
                              消す
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                <p className="zsetup-sync-note">
                  合計 {(tracksBytes / 1048576).toFixed(1)} MB / 曲数 {tracks.length}
                  （1曲25MBまで・全体で600MBまで）。
                  選んだ一覧が、車のメーター右下のプレイヤーに並びます。
                  車の画面で ▶ を押すと鳴ります。
                  {editingPlaylist
                    ? "　曲を消したいときは「すべての曲」に戻してください。"
                    : ""}
                </p>
              </>
            ) : (
              <p className="zsetup-sync-note">
                先に車と接続してください（車の画面の ⚙ →「スマホと接続」の
                QRを、iPhoneのカメラで読み取ります）。
              </p>
            )}
          </div>
        ) : null}
      </section>

      {openCard === "theme" ||
      openCard === "music" ||
      (openCard === "nav" && destEditOpen) ? (
      <div className="zsetup-actions">
        <button type="button" className="zsetup-save" onClick={save}>
          保存する
        </button>
        <p className="zsetup-saved" role="status">
          {syncState === "sending"
            ? "保存しました・車に送信中…"
            : syncState === "done"
              ? "保存しました・車にも反映しました"
              : syncState === "error"
                ? "保存しました（車への送信は失敗）"
                : saved
                  ? "保存しました"
                  : ""}
        </p>
      </div>
      ) : null}

      {/* 車載機がまちがってこの画面に来たときの戻り道。スマホには出さない。 */}
      {wideScreen ? (
        <a className="zsetup-car-link" href={`${basePath}/?app=1`}>
          この端末を車として使う（車の画面を開く）
        </a>
      ) : null}

    </main>
  );
}
