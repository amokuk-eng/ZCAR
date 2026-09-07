"use client";

import { useEffect, useState } from "react";
import {
  defaults,
  extractPlaylistId,
  fetchSharedSettings,
  MAX_PLAYLISTS,
  MAX_PLAYLIST_LABEL,
  METER_THEMES,
  MIN_SYNC_KEY_LENGTH,
  pushSharedSettings,
  readSettings,
  readSyncKeyFromHash,
  sanitizeSyncedSettings,
  writeSettings,
  type MeterTheme,
  type Playlist,
  type Settings,
} from "../settings-store";

type SyncState = "idle" | "sending" | "done" | "error";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function PhoneSettingsPage() {
  const [draft, setDraft] = useState<Settings>(defaults);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [handoffDone, setHandoffDone] = useState(false);

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
        const merged = {
          ...base,
          ...sanitizeSyncedSettings(result.settings),
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

  const resetAll = () => {
    if (!window.confirm("この端末の設定を初期状態に戻します。よろしいですか？")) {
      return;
    }
    setDraft(defaults);
    writeSettings(defaults);
    setSaved(true);
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

      <section className="zsetup-section">
        <h2>
          メーターテーマ<small>フルスクリーン表示の配色</small>
        </h2>
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
      </section>

      <section className="zsetup-section">
        <h2>
          勤務先<small>ナビの行き先と出勤時刻</small>
        </h2>
        <label className="zsetup-field">
          <span>店舗名</span>
          <input
            value={draft.storeName}
            onChange={(event) => update("storeName", event.target.value)}
          />
        </label>
        <label className="zsetup-field">
          <span>店舗住所 / 検索語</span>
          <input
            value={draft.storeDest}
            onChange={(event) => update("storeDest", event.target.value)}
          />
        </label>
        <label className="zsetup-field">
          <span>勤務開始</span>
          <input
            type="time"
            value={draft.start}
            onChange={(event) => update("start", event.target.value)}
          />
        </label>
        <label className="zsetup-field">
          <span>自宅住所 / 検索語</span>
          <input
            value={draft.homeDest}
            placeholder="退勤ナビの行き先"
            onChange={(event) => update("homeDest", event.target.value)}
          />
        </label>
      </section>

      <section className="zsetup-section">
        <h2>
          車両とAPI<small>車両名と到着予定時間の取得</small>
        </h2>
        <label className="zsetup-field">
          <span>車両ID</span>
          <input
            value={draft.carId}
            onChange={(event) => update("carId", event.target.value)}
          />
        </label>
        <label className="zsetup-field">
          <span>Google Routes APIキー</span>
          <input
            type="password"
            autoComplete="off"
            placeholder="未入力なら既定のキーを使用"
            value={draft.googleRoutesApiKey}
            onChange={(event) =>
              update("googleRoutesApiKey", event.target.value)
            }
          />
          <small>この端末の中だけに保存され、到着予定時間の取得に使われます。</small>
        </label>
      </section>

      <section className="zsetup-section">
        <h2>
          YouTube<small>ミュージック画面に並ぶジャンルとプレイリスト</small>
        </h2>
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
        <p className="zsetup-sync-note">
          YouTubeでプレイリストを開いて、アドレスをそのまま貼り付けてください
          （アドレスの中の list= の部分だけ自動で読み取ります）。上から順に、車のミュージック画面に
          並びます。ホーム画面の待機プレイヤーは、この中からランダムに再生します。
        </p>
      </section>

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


      <nav className="zsetup-links">
        <a className="zsetup-open" href={`${BASE_PATH}/?app=1`}>
          この端末でダッシュボードを開く
        </a>
        <button type="button" className="zsetup-reset" onClick={resetAll}>
          この端末の設定を初期化
        </button>
      </nav>
    </main>
  );
}
