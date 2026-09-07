"use client";

import { useEffect, useState } from "react";
import {
  defaults,
  METER_THEMES,
  readSettings,
  writeSettings,
  type MeterTheme,
  type Settings,
} from "../settings-store";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function PhoneSettingsPage() {
  const [draft, setDraft] = useState<Settings>(defaults);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(readSettings());
    setReady(true);
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

      <section className="zsetup-section zsetup-note">
        <h2>
          設定は端末ごとです<small>車の画面には自動で反映されません</small>
        </h2>
        <p>
          設定はブラウザの中に端末ごとに保存されます。ここで変えた内容は、
          このスマートフォンで Z CAR を開いたときに反映されます。
          車載機（PORMIDO）の表示を変えるときは、車の画面側でも同じ設定をしてください。
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
