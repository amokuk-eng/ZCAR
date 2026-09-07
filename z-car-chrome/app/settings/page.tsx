"use client";

import { useEffect, useState } from "react";
import {
  defaults,
  extractPlaylistId,
  fetchSharedSettings,
  MAX_DESTINATION_LABEL,
  MAX_DESTINATION_TEXT,
  MAX_PLAYLISTS,
  MAX_PLAYLIST_LABEL,
  METER_THEMES,
  MIN_SYNC_KEY_LENGTH,
  pushSharedSettings,
  readSettings,
  readSyncKeyFromHash,
  sanitizeSyncedSettings,
  writeSettings,
  type MapDestination,
  type MeterTheme,
  type Playlist,
  type Settings,
} from "../settings-store";

type SyncState = "idle" | "sending" | "done" | "error";

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
          ナビの目的地<small>車のマップ画面に並ぶ 1〜5 のボタン</small>
        </h2>
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
          押すとGoogleマップが開いて案内が始まります。空欄にしたボタンは押せなくなります。
          なお「出勤」「退勤」のボタンは、上の勤務先で設定した
          店舗住所・自宅住所へ案内します。
        </p>
      </section>

      <section className="zsetup-section">
        <h2>
          ミュージック<small>この端末で聴く YouTube プレイリスト</small>
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
              {extractPlaylistId(playlist.playlistId) ? (
                <a
                  className="zsetup-playlist-play"
                  href={`https://www.youtube.com/playlist?list=${extractPlaylistId(playlist.playlistId)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  ▶ このジャンルを再生
                </a>
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
        <p className="zsetup-sync-note">
          YouTubeでプレイリストを開いて、アドレスをそのまま貼り付けてください
          （アドレスの中の list= の部分だけ自動で読み取ります）。
          「再生」を押すとYouTubeアプリで開きます。運転中の操作は危険なので、
          出発前に選んでおいてください。音楽はこの端末だけで、車の画面には出しません。
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
        <button type="button" className="zsetup-reset" onClick={resetAll}>
          この端末の設定を初期化
        </button>
      </nav>
    </main>
  );
}
