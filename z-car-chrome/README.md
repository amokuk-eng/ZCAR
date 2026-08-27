# Z CAR OBD2 Dashboard

Android ChromeとCARISTA OBD2アダプタをWeb Bluetoothで接続し、車両データを表示する車載ダッシュボードです。

## Target

- Display: 1000 × 600 / 1000 × 500
- Browser: Android Chrome
- Adapter: CARISTA OBD2 (BLE)
- Vehicle label: Tanto

## OBD2 architecture

OBD2通信は以前の接続実績を優先し、1ファイルで順番に処理します。

```text
app/hooks/use-obd2.ts
  ├─ Bluetooth接続
  ├─ ELM327初期化
  ├─ PID取得・数値変換
  └─ 接続状態とエラー制御
```

### GATT profile

| Role | UUID |
|---|---:|
| Service | `0xFFF0` |
| Notify | `0xFFF1` |
| Write | `0xFFF2` |

### Live metrics

| Metric | Command | Conversion | Cycle |
|---|---|---|---|
| Vehicle speed | `01 0D` | `A` km/h | Sequential |
| Engine RPM | `01 0C` | `(256A + B) / 4` | Sequential |
| Coolant | `01 05` | `A - 40` °C | Sequential |
| Battery voltage | `AT RV` | Adapter response | Sequential |

コマンドは必ず1件ずつ送信し、ELM327のプロンプト `>` を受信してから次へ進みます。

## Connection flow

1. 右上の `OBD2` をタップ
2. ChromeのBluetooth選択画面でCARISTAを選択
3. BLE GATTへ接続
4. ELM327を初期化
5. ECU通信を確認
6. PIDの連続取得を開始

Chromeの仕様上、最初のBluetooth機器選択はユーザー操作が必要です。

## Error policy

- Bluetooth切断イベントを監視
- コマンドごとにタイムアウトを設定
- 3回連続失敗でポーリングを停止
- 再接続は右上の `OBD2` ボタンから開始
- 新しい接続開始時は古いセッションを完全に破棄

## Development

```bash
npm ci
npm run dev
```

Production build:

```bash
npm run build
```

## Important

運転中に画面操作をしないでください。本アプリの燃料残量は走行距離から計算する推定値であり、車両の燃料センサー値ではありません。
