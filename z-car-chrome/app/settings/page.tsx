"use client";

import { useEffect, useState } from "react";
import {
  defaults,
  fetchSharedSettings,
  METER_THEMES,
  MIN_SYNC_KEY_LENGTH,
  pushSharedSettings,
  readSettings,
  writeSettings,
  type MeterTheme,
  type Settings,
} from "../settings-store";

type SyncState = "idle" | "sending" | "done" | "error";

const formatSyncTime = (value: number) =>
  value > 0
    ? new Intl.DateTimeFormat("ja-JP", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : null;

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function PhoneSettingsPage() {
  const [draft, setDraft] = useState<Settings>(defaults);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("idle");

  useEffect(() => {
    const stored = readSettings();
    setDraft(stored);
    setReady(true);
    // 車側で先に変更されているかもしれないので、開いた時点で一度取りに行く。
    const key = stored.syncKey.trim();
    if (key.length < MIN_SYNC_KEY_LENGTH) return;
    void fetchSharedSettings(key)
      .then((result) => {
        const updatedAt = result.updatedAt ?? 0;
        if (!result.ok || !result.settings || updatedAt <= stored.syncedAt) return;
        const merged = { ...stored, ...result.settings, syncedAt: updatedAt };
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

  const syncKey = draft.syncKey.trim();
  const canSync = syncKey.length >= MIN_SYNC_KEY_LENGTH;
  const lastSyncLabel = formatSyncTime(draft.syncedAt);

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

  const save = () => {
    const next: Settings = {
      ...draft,
      storeName: draft.storeName.trim() || defaults.storeName,
      storeDest:
        draft.storeDest.trim() || draft.storeName.trim() || defaults.storeDest,
      start: draft.start || defaults.start,
      carId: draft.carId.trim() || defaults.carId,
    };
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
          この端末（スマートフォン）に保存される設定です。
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

      <div className="zsetup-actions">
        <button type="button" className="zsetup-save" onClick={save}>
          保存する
        </button>
        <p className="zsetup-saved" role="status">
          {saved ? "保存しました" : ""}
        </p>
      </div>

      <section className="zsetup-section">
        <h2>
          車と同期<small>同じ合言葉を入れた端末どうしで設定を共有</small>
        </h2>
        <label className="zsetup-field">
          <span>合言葉（{MIN_SYNC_KEY_LENGTH}文字以上）</span>
          <input
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="未入力なら同期しない"
            value={draft.syncKey}
            onChange={(event) => update("syncKey", event.target.value)}
          />
          <small>
            車載機の設定ページでも同じ合言葉を入れてください。
            合言葉を知っている端末だけが読み書きできます。
          </small>
        </label>
        <div className="zsetup-sync">
          <button
            type="button"
            className="zsetup-send"
            disabled={!canSync || syncState === "sending"}
            onClick={() => void sendToCar(draft)}
          >
            {syncState === "sending" ? "送信中…" : "いま車に送る"}
          </button>
          <p className="zsetup-sync-state" role="status">
            {syncState === "error"
              ? "送信できませんでした（通信を確認してください）"
              : canSync
                ? lastSyncLabel
                  ? `最終同期 ${lastSyncLabel}`
                  : "まだ同期していません"
                : "合言葉を入れると同期できます"}
          </p>
        </div>
        <p className="zsetup-sync-note">
          同期されるのは メーターテーマ・店舗名・店舗住所・勤務開始・自宅住所・車両ID
          です。APIキーと走行状態（出勤/退勤）は端末ごとのままです。
          車側は30秒おきに確認して反映します。
        </p>
      </section>

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
