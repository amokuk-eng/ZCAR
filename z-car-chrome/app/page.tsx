"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Circle, CircleMarker, Map as LeafletMap } from "leaflet";
import { useObd2, type ObdConnectionStatus } from "./hooks/use-obd2";

type CarState = "not_departed" | "departed" | "checked_out";
type ConfirmedShift = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  storeName: string;
  workType: string;
  status: "confirmed";
};
type ShiftFeed = {
  profileId: string;
  displayName: string;
  updatedAt: string;
  shifts: ConfirmedShift[];
};
type Settings = {
  storeName: string;
  storeDest: string;
  start: string;
  homeDest: string;
  googleRoutesApiKey: string;
  carId: string;
  state: CarState;
  departedAt: string;
  checkedOutAt: string;
  meterTheme: "green" | "red-triple";
};
type RouteEta = {
  arrivalAt: number;
  durationSeconds: number;
  destination: "HOME" | "DESTINATION";
};
type WeatherHour = {
  time: string;
  temperature: number;
  code: number;
  isDay: boolean;
};
type WeatherData = {
  temperature: number;
  code: number;
  isDay: boolean;
  hours: WeatherHour[];
  sunrise: string | null;
  sunset: string | null;
};
type FuelEntry = {
  id: string;
  date: string;
  liters: number;
  distanceKm: number;
  amountYen: number;
  createdAt: number;
};
type FuelDraft = {
  date: string;
  liters: string;
  distanceKm: string;
  amountYen: string;
};

const SHIFT_URL =
  "https://zest-home.amok-uk.chatgpt.site/api/confirmed-shifts?profileId=nanatsuka";

const MAP_SHORTCUTS = [
  {
    number: 1,
    label: "ケーズ",
    destination: "〒546-0012 大阪府大阪市東住吉区中野1丁目15-9 ケーズデンキ東住吉中野店",
  },
  {
    number: 2,
    label: "自宅",
    destination: "〒573-0065 大阪府枚方市出口3丁目1-1",
  },
  {
    number: 3,
    label: "荻野くん家",
    destination: "〒545-0031 大阪府大阪市阿倍野区橋本町",
  },
  { number: 4, label: "未登録", destination: null },
  {
    number: 5,
    label: "鳥",
    destination: "〒534-0024 大阪府大阪市都島区東野田町4丁目6-6",
  },
] as const;
const HOME_YOUTUBE_PLAYLIST_ID = "PLMC9KNkIncKtGvr2kFRuXBVmBev6cAJ2u";
const MUSIC_PLAYLISTS = [
  {
    number: 2,
    label: "ANIME NOW",
    title: "最新アニメ音楽 プレイリスト",
    playlistId: "PLaodxkj-4NkRFKJZwtT3wvmC3rN8qG2n1",
    tone: "anime",
  },
  {
    number: 3,
    label: "REGGAE",
    title: "レゲエ プレイリスト",
    playlistId: "PLjF50Dlp9ieks26oOKahUFiRTj18o6YGt",
    tone: "reggae",
  },
  {
    number: 4,
    label: "EDM",
    title: "EDMヒット プレイリスト",
    playlistId: "PLPbMT4wSxX89gUYpgYMrmOqsupKMRR5Rj",
    tone: "edm",
  },
] as const;
const HOME_RANDOM_PLAYLISTS = [
  {
    number: 1,
    label: "YOUTUBE",
    title: "最近の洋楽ポップヒット プレイリスト",
    playlistId: HOME_YOUTUBE_PLAYLIST_ID,
    tone: "youtube",
  },
  ...MUSIC_PLAYLISTS,
];
const FUEL_TANK_CAPACITY_L = 36;
const FUEL_RESERVE_L = 4;
const GREEN_METER_MAP_ZOOM = 12;
const FUEL_LOG_STORAGE_KEY = "zcar-fuel-log-v1";
const DAILY_TRIP_STORAGE_KEY = "zcar-daily-trip-v1";
const IMPORTED_FUEL_ENTRIES: FuelEntry[] = [
  { id: "import-2026-07-05", date: "2026-07-05", liters: 19.33, distanceKm: 300, amountYen: 3131, createdAt: Date.parse("2026-07-05T12:00:00+09:00") },
  { id: "import-2026-07-16", date: "2026-07-16", liters: 19.3, distanceKm: 229.9, amountYen: 3127, createdAt: Date.parse("2026-07-16T12:00:00+09:00") },
  { id: "import-2026-07-18", date: "2026-07-18", liters: 14.22, distanceKm: 191.9, amountYen: 2261, createdAt: Date.parse("2026-07-18T12:00:00+09:00") },
  { id: "import-2026-07-25", date: "2026-07-25", liters: 24.27, distanceKm: 361.4, amountYen: 3956, createdAt: Date.parse("2026-07-25T12:00:00+09:00") },
  { id: "import-2026-07-27", date: "2026-07-27", liters: 15.64, distanceKm: 200, amountYen: 2549, createdAt: Date.parse("2026-07-27T12:00:00+09:00") },
  { id: "import-2026-07-29", date: "2026-07-29", liters: 16.8, distanceKm: 195.7, amountYen: 2688, createdAt: Date.parse("2026-07-29T12:00:00+09:00") },
  { id: "import-2026-08-05", date: "2026-08-05", liters: 29.36, distanceKm: 396.3, amountYen: 4968, createdAt: Date.parse("2026-08-05T12:00:00+09:00") },
  { id: "import-2026-08-07", date: "2026-08-07", liters: 13.51, distanceKm: 201.4, amountYen: 2202, createdAt: Date.parse("2026-08-07T12:00:00+09:00") },
  { id: "import-2026-08-10", date: "2026-08-10", liters: 19.59, distanceKm: 275.6, amountYen: 3134, createdAt: Date.parse("2026-08-10T12:00:00+09:00") },
  { id: "import-2026-08-14", date: "2026-08-14", liters: 13.61, distanceKm: 200, amountYen: 2218, createdAt: Date.parse("2026-08-14T12:00:00+09:00") },
  { id: "import-2026-08-19", date: "2026-08-19", liters: 27.36, distanceKm: 473.3, amountYen: 4461, createdAt: Date.parse("2026-08-19T12:00:00+09:00") },
  { id: "import-2026-08-23", date: "2026-08-23", liters: 18.1, distanceKm: 247.9, amountYen: 2842, createdAt: Date.parse("2026-08-23T12:00:00+09:00") },
  { id: "import-2026-08-27", date: "2026-08-27", liters: 12.55, distanceKm: 180, amountYen: 2008, createdAt: Date.parse("2026-08-27T12:00:00+09:00") },
];

const defaults: Settings = {
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
};

const hm = () =>
  new Date().toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const worldHm = (timeZone: string) =>
  new Date().toLocaleTimeString("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

const minutesFromHm = (value: string | null | undefined) => {
  if (!value || !/^\d{2}:\d{2}/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const japanDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const openMap = (destination: string) => {
  window.location.href =
    "https://www.google.com/maps/dir/?api=1&destination=" +
    encodeURIComponent(destination) +
    "&travelmode=driving&dir_action=navigate";
};

const svgPoint = (cx: number, cy: number, radius: number, degrees: number) => {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
};

const svgArc = (cx: number, cy: number, radius: number, startAngle: number, endAngle: number) => {
  const start = svgPoint(cx, cy, radius, endAngle);
  const end = svgPoint(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
};

const svgArcForward = (cx: number, cy: number, radius: number, startAngle: number, endAngle: number) => {
  const start = svgPoint(cx, cy, radius, startAngle);
  const end = svgPoint(cx, cy, radius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
};

const weatherKind = (code: number) => {
  if (code === 0) return "clear";
  if (code <= 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 51) return "rain";
  return "cloud";
};

const weatherLabel = (code: number) => {
  const kind = weatherKind(code);
  if (kind === "clear") return "CLEAR";
  if (kind === "fog") return "FOG";
  if (kind === "storm") return "THUNDER";
  if (kind === "snow") return "SNOW";
  if (kind === "rain") return "RAIN";
  return code <= 2 ? "PARTLY CLOUDY" : "CLOUDY";
};

function WeatherGlyph({
  code,
  isDay,
  x,
  y,
  size,
}: {
  code: number;
  isDay: boolean;
  x: number;
  y: number;
  size: number;
}) {
  const kind = weatherKind(code);
  const transform = `translate(${x - size / 2} ${y - size / 2}) scale(${size / 48})`;
  const cloud = <path d="M 12 31 H 35 C 40 31 42 28 42 24 C 42 19 38 16 33 16 C 31 11 27 9 22 9 C 16 9 12 13 11 18 C 7 19 5 22 5 25 C 5 29 8 31 12 31 Z" />;

  return (
    <g className={`weather-glyph ${kind}`} transform={transform} aria-hidden="true">
      {kind === "clear" && (
        <>
          <circle cx="24" cy="24" r="8" />
          <path d="M24 5V11 M24 37V43 M5 24H11 M37 24H43 M10.5 10.5L15 15 M33 33L37.5 37.5 M37.5 10.5L33 15 M15 33L10.5 37.5" />
        </>
      )}
      {kind === "cloud" && (
        <>
          {isDay && <circle className="weather-sun" cx="16" cy="16" r="7" />}
          {cloud}
        </>
      )}
      {kind === "fog" && <path d="M7 16H37 M4 24H41 M9 32H35" />}
      {(kind === "rain" || kind === "snow" || kind === "storm") && cloud}
      {kind === "rain" && <path className="weather-fall" d="M14 35L11 41 M24 35L21 41 M34 35L31 41" />}
      {kind === "snow" && <path className="weather-fall" d="M14 35V43 M10 39H18 M24 35V43 M20 39H28 M34 35V43 M30 39H38" />}
      {kind === "storm" && <path className="weather-bolt" d="M25 32L18 41H24L21 47L33 36H27L31 32Z" />}
    </g>
  );
}

function RedSideGauge({
  side, label, level, value, unit, topMark, bottomMark, detail,
}: {
  side: "left" | "right";
  label: string;
  level: number;
  value: number | string;
  unit: string;
  topMark: string;
  bottomMark: string;
  detail?: string;
}) {
  const left = side === "left";
  const centerX = left ? 210 : -20;
  const angles = Array.from({ length: 9 }, (_, index) =>
    left ? 130 + index * 12.5 : 50 - index * 12.5,
  );
  const arcPath = left
    ? "M 123.2 263.4 A 135 135 0 0 1 123.2 56.6"
    : "M 66.8 263.4 A 135 135 0 0 0 66.8 56.6";

  return (
    <aside className={`red-side-gauge ${side}`}>
      <small>{label}</small>
      <svg viewBox="0 0 190 320" role="img" aria-label={`${label} ${value} ${unit}`}>
        <path className="red-side-outer" d={arcPath} />
        <path className="red-side-track" d={arcPath} pathLength="100" />
        <path
          className="red-side-active"
          d={arcPath}
          pathLength="100"
          style={{ strokeDasharray: `${Math.max(0, Math.min(100, level))} 100` }}
        />
        <g className="red-side-ticks" aria-hidden="true">
          {angles.map((angle, index) => {
            const inner = svgPoint(centerX, 160, index % 4 === 0 ? 119 : 124, angle + 90);
            const outer = svgPoint(centerX, 160, 143, angle + 90);
            return <line key={angle} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} />;
          })}
        </g>
        <text className="red-side-mark top" x={left ? 126 : 64} y="48">{topMark}</text>
        <text className="red-side-mark bottom" x={left ? 126 : 64} y="282">{bottomMark}</text>
      </svg>
      <div className="red-side-reading"><strong>{value}</strong><em>{unit}</em></div>
      {detail && <b>{detail}</b>}
    </aside>
  );
}

function RedTachometer({ rpm, speed }: { rpm: number | null; speed: number | null }) {
  const progress = Math.max(0, Math.min(260, ((rpm ?? 0) / 8000) * 260));
  const style = { "--needle-angle": `${-130 + progress}deg` } as CSSProperties;
  const tickAngles = Array.from({ length: 41 }, (_, index) => -130 + index * 6.5);
  const digits = Array.from({ length: 9 }, (_, index) => ({
    index,
    point: svgPoint(210, 210, 158, -130 + index * 32.5),
  }));

  return (
    <article className="red-tachometer" style={style} aria-label={`Engine ${rpm ?? 0} RPM, speed ${speed ?? 0} kilometers per hour`}>
      <svg className="red-tach-svg" viewBox="0 0 420 420" role="img">
        <defs>
          <radialGradient id="redDialFace" cx="50%" cy="44%" r="62%">
            <stop offset="0%" stopColor="#161315" />
            <stop offset="70%" stopColor="#050405" />
            <stop offset="100%" stopColor="#000" />
          </radialGradient>
          <linearGradient id="redMetalRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#242124" />
            <stop offset="28%" stopColor="#aaa5a8" />
            <stop offset="52%" stopColor="#383437" />
            <stop offset="78%" stopColor="#8c878a" />
            <stop offset="100%" stopColor="#171517" />
          </linearGradient>
        </defs>
        <circle className="red-tach-shadow" cx="210" cy="210" r="198" />
        <circle className="red-tach-metal" cx="210" cy="210" r="188" fill="none" stroke="url(#redMetalRing)" />
        <circle className="red-tach-face" cx="210" cy="210" r="176" fill="url(#redDialFace)" />
        <path className="red-tach-white-band" d={svgArc(210, 210, 164, -130, 97.5)} />
        <path className="red-tach-red-band" d={svgArc(210, 210, 164, 97.5, 130)} />
        <g className="red-tach-ticks" aria-hidden="true">
          {tickAngles.map((angle, index) => {
            const major = index % 5 === 0;
            const inner = svgPoint(210, 210, major ? 140 : 148, angle);
            const outer = svgPoint(210, 210, 174, angle);
            return <line key={angle} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} />;
          })}
        </g>
        <g className="red-tach-digits">
          {digits.map(({ index, point }) => (
            <text key={index} className={index >= 7 ? "red-zone-number" : "white-zone-number"} x={point.x} y={point.y}>{index}</text>
          ))}
        </g>
        <g className="red-tach-needle" aria-hidden="true">
          <line x1="210" y1="224" x2="210" y2="76" />
          <circle cx="210" cy="210" r="15" />
          <circle cx="210" cy="210" r="6" />
        </g>
        <circle className="red-speed-disc" cx="210" cy="210" r="87" />
        <text className="red-speed-label" x="210" y="164">SPEED</text>
        <text className="red-speed-value" x="210" y="222">{speed ?? "—"}</text>
        <text className="red-speed-unit" x="210" y="246">km/h</text>
        <line className="red-speed-rule" x1="164" y1="263" x2="256" y2="263" />
        <text className="red-rpm-caption" x="210" y="283">ENGINE ×1000 RPM</text>
      </svg>
    </article>
  );
}

const sevenSegmentMap: Record<string, number[]> = {
  "0": [0, 1, 2, 3, 4, 5],
  "1": [1, 2],
  "2": [0, 1, 6, 4, 3],
  "3": [0, 1, 6, 2, 3],
  "4": [5, 6, 1, 2],
  "5": [0, 5, 6, 2, 3],
  "6": [0, 5, 6, 4, 2, 3],
  "7": [0, 1, 2],
  "8": [0, 1, 2, 3, 4, 5, 6],
  "9": [0, 1, 2, 3, 5, 6],
  "-": [6],
};

const sevenSegmentRects = [
  { x: 4, y: 0, width: 18, height: 4 },
  { x: 22, y: 4, width: 4, height: 18 },
  { x: 22, y: 26, width: 4, height: 18 },
  { x: 4, y: 44, width: 18, height: 4 },
  { x: 0, y: 26, width: 4, height: 18 },
  { x: 0, y: 4, width: 4, height: 18 },
  { x: 4, y: 22, width: 18, height: 4 },
];

function SevenSegmentNumber({
  value,
  x,
  y,
  scale,
  className,
}: {
  value: number | null;
  x: number;
  y: number;
  scale: number;
  className: string;
}) {
  const characters = value === null ? ["-"] : String(Math.max(0, Math.round(value))).split("");
  const cellWidth = 31;
  const totalWidth = (characters.length * cellWidth - 5) * scale;

  return (
    <g
      className={className}
      transform={`translate(${x - totalWidth / 2} ${y}) scale(${scale})`}
      aria-hidden="true"
    >
      {characters.map((character, characterIndex) => {
        const activeSegments = sevenSegmentMap[character] ?? sevenSegmentMap["-"];
        return (
          <g key={`${character}-${characterIndex}`} transform={`translate(${characterIndex * cellWidth} 0)`}>
            {sevenSegmentRects.map((segment, segmentIndex) => (
              <rect
                key={segmentIndex}
                {...segment}
                rx="1.4"
                className={activeSegments.includes(segmentIndex) ? "active" : "inactive"}
              />
            ))}
          </g>
        );
      })}
    </g>
  );
}

function RedCockpit({
  rpm,
  speed,
  coolant,
  voltage,
  weather,
  weatherStatus,
}: {
  rpm: number | null;
  speed: number | null;
  coolant: number | null;
  voltage: number | null;
  weather: WeatherData | null;
  weatherStatus: "idle" | "loading" | "ready" | "error";
}) {
  const rpmLevel = Math.max(0, Math.min(100, ((rpm ?? 0) / 8000) * 100));
  const coolantLevel = Math.max(0, Math.min(100, (((coolant ?? 40) - 40) / 80) * 100));
  const needleAngle = -130 + rpmLevel * 2.6;
  const mainTicks = Array.from({ length: 41 }, (_, index) => -130 + index * 6.5);
  const digits = Array.from({ length: 9 }, (_, index) => ({
    index,
    point: svgPoint(490, 205, 132, -130 + index * 32.5),
  }));
  const sideSegments = Array.from({ length: 16 }, (_, index) => {
    const startAngle = -143 + index * 6.75;
    return {
      index,
      path: svgArcForward(490, 205, 242, startAngle, startAngle + 4.8),
    };
  });
  const activeCoolantBars = Math.round((coolantLevel / 100) * sideSegments.length);
  const activeRpmBars = Math.round((rpmLevel / 100) * sideSegments.length);
  const centerSpeed = speed === null ? null : Math.round(speed);
  const forecastPoints = weather?.hours.slice(0, 4) ?? [];
  const mainArc = svgArcForward(490, 205, 169, -130, 130);
  const leftArc = svgArcForward(490, 205, 242, -145, -35);
  const style = { "--cockpit-needle": `${needleAngle}deg` } as CSSProperties;

  return (
    <div className="red-cockpit" style={style}>
      <svg className="red-cockpit-svg" viewBox="0 0 980 410" role="img" aria-label={`Speed ${speed ?? 0} kilometers per hour, engine ${rpm ?? 0} RPM, coolant ${coolant ?? 0} degrees`}>
        <defs>
          <radialGradient id="cockpitFace" cx="50%" cy="44%" r="64%">
            <stop offset="0%" stopColor="#171419" />
            <stop offset="62%" stopColor="#070607" />
            <stop offset="100%" stopColor="#010102" />
          </radialGradient>
          <linearGradient id="cockpitMetal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#262329" />
            <stop offset="22%" stopColor="#89848a" />
            <stop offset="48%" stopColor="#242126" />
            <stop offset="75%" stopColor="#706b70" />
            <stop offset="100%" stopColor="#171519" />
          </linearGradient>
          <linearGradient id="cockpitSideMetal" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#080709" />
            <stop offset="28%" stopColor="#565158" />
            <stop offset="48%" stopColor="#171419" />
            <stop offset="72%" stopColor="#777178" />
            <stop offset="100%" stopColor="#09080a" />
          </linearGradient>
          <linearGradient id="cockpitTrackMetal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5c565d" />
            <stop offset="50%" stopColor="#211e22" />
            <stop offset="100%" stopColor="#4a454b" />
          </linearGradient>
          <radialGradient id="cockpitGlass" cx="38%" cy="24%" r="76%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity=".13" />
            <stop offset="28%" stopColor="#ffffff" stopOpacity=".025" />
            <stop offset="63%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity=".2" />
          </radialGradient>
          <linearGradient id="cockpitDigitalScreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16070b" />
            <stop offset="48%" stopColor="#070305" />
            <stop offset="100%" stopColor="#020102" />
          </linearGradient>
          <filter id="cockpitGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <path className="cockpit-wing-line" d="M 40 205 H 236" />
        <path className="cockpit-wing-line" d="M 744 205 H 940" />

        <g className="cockpit-outside-temperature">
          <text className="cockpit-weather-eyebrow" x="132" y="48">OUTSIDE TEMP</text>
          <text className="cockpit-outside-value" x="124" y="112">
            {weather ? Math.round(weather.temperature) : "—"}
          </text>
          <text className="cockpit-outside-unit" x="175" y="112">°C</text>
          <line className="cockpit-weather-rule" x1="78" y1="132" x2="186" y2="132" />
          <text className="cockpit-weather-source" x="132" y="151">
            {weatherStatus === "error" ? "LOCATION UNAVAILABLE" : weatherStatus === "ready" ? "CURRENT LOCATION" : "LOCATING"}
          </text>
        </g>

        <g className="cockpit-weather-forecast">
          <text className="cockpit-weather-eyebrow" x="848" y="34">12 HOUR FORECAST</text>
          {weather ? (
            <>
              <WeatherGlyph code={weather.code} isDay={weather.isDay} x={848} y={71} size={44} />
              <text className="cockpit-weather-condition" x="848" y="105">{weatherLabel(weather.code)}</text>
              <g className="cockpit-hourly-weather">
                {forecastPoints.map((point, index) => {
                  const x = 790 + index * 39;
                  return (
                    <g key={`${point.time}-${index}`}>
                      <text className="cockpit-hour-time" x={x} y="128">{point.time}</text>
                      <WeatherGlyph code={point.code} isDay={point.isDay} x={x} y={150} size={18} />
                      <text className="cockpit-hour-temp" x={x} y="181">{Math.round(point.temperature)}°</text>
                    </g>
                  );
                })}
              </g>
            </>
          ) : (
            <text className="cockpit-weather-wait" x="848" y="96">
              {weatherStatus === "error" ? "WEATHER UNAVAILABLE" : "ACQUIRING WEATHER"}
            </text>
          )}
        </g>

        <path className="cockpit-readout-frame" d="M 48 82 H 172 L 210 120 V 238 H 48 Z" transform="translate(0 140)" />
        <path className="cockpit-readout-frame right" d="M 932 82 H 808 L 770 120 V 238 H 932 Z" transform="translate(0 140)" />

        <g className="cockpit-side-geometry left">
          <path className="cockpit-side-bezel" d={leftArc} />
          <path className="cockpit-side-shell" d={leftArc} />
          <path className="cockpit-side-track" d={leftArc} pathLength="100" />
          <g className="cockpit-digital-graph" aria-hidden="true">
            {sideSegments.map(({ index, path }) => (
              <path
                key={index}
                className={`cockpit-digital-bar${index < activeCoolantBars ? " active" : ""}${index === activeCoolantBars - 1 ? " peak" : ""}`}
                d={path}
              />
            ))}
          </g>
          <path className="cockpit-side-highlight" d={leftArc} />
        </g>

        <g className="cockpit-side-readout left">
          <g transform="translate(0 140)">
            <text className="cockpit-side-title" x="132" y="112">COOLANT</text>
            <text className="cockpit-side-number" x="132" y="178">{coolant ?? "—"}</text>
            <text className="cockpit-side-unit" x="132" y="202">°C</text>
          </g>
          <text className="cockpit-side-limit" x="292" y="48">H</text>
          <text className="cockpit-side-limit" x="292" y="374">C</text>
        </g>

        <g className="cockpit-side-geometry right" transform="translate(980 0) scale(-1 1)">
          <path className="cockpit-side-bezel" d={leftArc} />
          <path className="cockpit-side-shell" d={leftArc} />
          <path className="cockpit-side-track" d={leftArc} pathLength="100" />
          <g className="cockpit-digital-graph" aria-hidden="true">
            {sideSegments.map(({ index, path }) => (
              <path
                key={index}
                className={`cockpit-digital-bar${index < activeRpmBars ? " active" : ""}${index === activeRpmBars - 1 ? " peak" : ""}`}
                d={path}
              />
            ))}
          </g>
          <path className="cockpit-side-highlight" d={leftArc} />
        </g>

        <g className="cockpit-side-readout right">
          <g transform="translate(0 140)">
            <text className="cockpit-side-title" x="848" y="112">VOLTAGE</text>
            <text className="cockpit-side-number" x="848" y="178">{voltage?.toFixed(1) ?? "—"}</text>
            <text className="cockpit-side-unit" x="848" y="202">V</text>
            <text className="cockpit-side-detail" x="848" y="222">BATTERY SYSTEM</text>
          </g>
          <text className="cockpit-side-limit" x="688" y="48">8</text>
          <text className="cockpit-side-limit" x="688" y="374">0</text>
        </g>

        <circle className="cockpit-main-shadow" cx="490" cy="205" r="196" />
        <circle className="cockpit-main-metal" cx="490" cy="205" r="188" fill="none" stroke="url(#cockpitMetal)" />
        <circle className="cockpit-main-face" cx="490" cy="205" r="179" fill="url(#cockpitFace)" />
        <circle className="cockpit-main-inner-ring" cx="490" cy="205" r="175" />
        <path className="cockpit-main-bezel-shine" d={svgArcForward(490, 205, 188, -126, -18)} />
        <path className="cockpit-main-track" d={mainArc} />
        <path className="cockpit-main-progress" d={mainArc} pathLength="100" style={{ strokeDasharray: `${rpmLevel} 100` }} />
        <path className="cockpit-redline" d={svgArcForward(490, 205, 169, 97.5, 130)} />

        <g className="cockpit-main-ticks">
          {mainTicks.map((angle, index) => {
            const major = index % 5 === 0;
            const inner = svgPoint(490, 205, major ? 148 : 155, angle);
            const outer = svgPoint(490, 205, 174, angle);
            return <line key={angle} className={index >= 35 ? "hot" : undefined} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} />;
          })}
        </g>

        <g className="cockpit-main-digits">
          {digits.map(({ index, point }) => (
            <text key={index} className={index >= 7 ? "hot" : undefined} x={point.x} y={point.y}>{index}</text>
          ))}
        </g>

        <g className="cockpit-needle">
          <line x1="490" y1="220" x2="490" y2="64" />
        </g>

        <circle className="cockpit-speed-ring" cx="490" cy="205" r="83" />
        <circle className="cockpit-speed-face" cx="490" cy="205" r="77" />
        <circle className="cockpit-speed-glass" cx="490" cy="205" r="75" />
        <text className="cockpit-speed-label" x="490" y="145">SPEED</text>
        <SevenSegmentNumber value={centerSpeed} x={490} y={177} scale={1.3} className="cockpit-speed-segments" />
        <text className="cockpit-speed-unit" x="490" y="238">km/h</text>
        <line className="cockpit-speed-divider" x1="450" y1="254" x2="530" y2="254" />
        <text className="cockpit-rpm-label" x="490" y="273">×1000 RPM</text>

        <g className="cockpit-rpm-digital">
          <path className="cockpit-rpm-digital-frame" d="M 426 304 H 554 L 564 314 V 354 L 554 364 H 426 L 416 354 V 314 Z" />
          <path className="cockpit-rpm-digital-screen" d="M 432 309 H 548 L 558 319 V 349 L 548 359 H 432 L 422 349 V 319 Z" />
          <line className="cockpit-rpm-digital-accent" x1="438" y1="312" x2="542" y2="312" />
          <text className="cockpit-rpm-digital-label" x="490" y="318">ENGINE RPM</text>
          <SevenSegmentNumber value={rpm} x={478} y={329} scale={0.64} className="cockpit-rpm-segments" />
          <text className="cockpit-rpm-digital-unit" x="540" y="344">rpm</text>
        </g>
      </svg>
    </div>
  );
}

export default function Home() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [draft, setDraft] = useState<Settings>(defaults);
  const [clock, setClock] = useState("--:--");
  const [californiaClock, setCaliforniaClock] = useState("--:--");
  const [russiaClock, setRussiaClock] = useState("--:--");
  const [chinaClock, setChinaClock] = useState("--:--");
  const [isOnline, setIsOnline] = useState(true);
  const [ready, setReady] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showMeter, setShowMeter] = useState(false);
  const [showFuel, setShowFuel] = useState(false);
  const [showMusic, setShowMusic] = useState(false);
  const [musicPage, setMusicPage] = useState<1 | 2>(1);
  const [homePlaylistIndex, setHomePlaylistIndex] = useState(0);
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [fuelDraft, setFuelDraft] = useState<FuelDraft>({
    date: japanDateKey(),
    liters: "",
    distanceKm: "",
    amountYen: "",
  });
  const {
    status: obdStatus,
    metrics: obdData,
    deviceName: obdDeviceName,
    connectionLabel: obdConnectionLabel,
    errorMessage: obdErrorMessage,
    connect: connectObd,
  } = useObd2();
  const [displaySpeed, setDisplaySpeed] = useState<number | null>(null);
  const [fuelTripKm, setFuelTripKm] = useState(0);
  const [dailyTrip, setDailyTrip] = useState({
    date: japanDateKey(),
    distanceKm: 0,
  });
  const [fuelResetting, setFuelResetting] = useState(false);
  const [routeEta, setRouteEta] = useState<RouteEta | null>(null);
  const [routeEtaStatus, setRouteEtaStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [shiftFeed, setShiftFeed] = useState<ShiftFeed | null>(null);
  const [shiftStatus, setShiftStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [location, setLocation] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
    heading: number | null;
  } | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    "locating" | "ready" | "unavailable"
  >("locating");
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherStatus, setWeatherStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const homeDialog = useRef<HTMLDialogElement>(null);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const themeDialog = useRef<HTMLDialogElement>(null);
  const fuelMotionRef = useRef<{
    speed: number | null;
    status: ObdConnectionStatus;
  }>({
    speed: null,
    status: "idle",
  });
  const speedTargetRef = useRef<number | null>(null);
  const speedSamplesRef = useRef<Array<{ value: number; sampledAt: number }>>([]);
  const smoothedSpeedRef = useRef<number | null>(null);
  const speedZeroSinceRef = useRef<number | null>(null);
  const fuelResetTimerRef = useRef<number | null>(null);
  const locationWatchRef = useRef<number | null>(null);
  const liveMapElementRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const livePositionMarkerRef = useRef<CircleMarker | null>(null);
  const liveAccuracyCircleRef = useRef<Circle | null>(null);
  const greenMapElementRef = useRef<HTMLDivElement>(null);
  const greenLeafletMapRef = useRef<LeafletMap | null>(null);
  const weatherLatitude = location ? Number(location.lat.toFixed(2)) : null;
  const weatherLongitude = location ? Number(location.lng.toFixed(2)) : null;
  const weatherLocationKey =
    weatherLatitude === null || weatherLongitude === null
      ? ""
      : `${weatherLatitude},${weatherLongitude}`;

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("zcar") || "{}");
      setSettings({
        ...defaults,
        ...stored,
        carId: !stored.carId || stored.carId === "CAR-01" ? "Tanto" : stored.carId,
      });
      const savedFuelTrip = Number.parseFloat(
        localStorage.getItem("zcar-fuel-trip-km") || "0",
      );
      setFuelTripKm(
        Number.isFinite(savedFuelTrip)
          ? Math.max(0, savedFuelTrip)
          : 0,
      );
      const savedDailyTrip = JSON.parse(
        localStorage.getItem(DAILY_TRIP_STORAGE_KEY) || "null",
      ) as { date?: unknown; distanceKm?: unknown } | null;
      const currentDate = japanDateKey();
      setDailyTrip({
        date: currentDate,
        distanceKm:
          savedDailyTrip?.date === currentDate &&
          typeof savedDailyTrip.distanceKm === "number" &&
          Number.isFinite(savedDailyTrip.distanceKm)
            ? Math.max(0, savedDailyTrip.distanceKm)
            : 0,
      });
      const savedFuelEntries = JSON.parse(
        localStorage.getItem(FUEL_LOG_STORAGE_KEY) || "[]",
      ) as FuelEntry[];
      const validatedFuelEntries = Array.isArray(savedFuelEntries)
        ? savedFuelEntries.filter(
            (entry) =>
              entry &&
              typeof entry.id === "string" &&
              /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
              Number.isFinite(entry.liters) &&
              entry.liters > 0 &&
              Number.isFinite(entry.distanceKm) &&
              entry.distanceKm >= 0 &&
              Number.isFinite(entry.amountYen) &&
              entry.amountYen >= 0,
          )
        : [];
      const mergedFuelEntries = [...validatedFuelEntries];
      for (const importedEntry of IMPORTED_FUEL_ENTRIES) {
        const alreadyExists = mergedFuelEntries.some(
          (entry) =>
            entry.date === importedEntry.date &&
            entry.liters === importedEntry.liters &&
            entry.distanceKm === importedEntry.distanceKm &&
            entry.amountYen === importedEntry.amountYen,
        );
        if (!alreadyExists) mergedFuelEntries.push(importedEntry);
      }
      setFuelEntries(mergedFuelEntries);
      const savedRouteEta = JSON.parse(
        localStorage.getItem("zcar-route-eta") || "null",
      ) as RouteEta | null;
      if (
        savedRouteEta &&
        Number.isFinite(savedRouteEta.arrivalAt) &&
        savedRouteEta.arrivalAt > Date.now() - 30 * 60 * 1000
      ) {
        setRouteEta(savedRouteEta);
        setRouteEtaStatus("ready");
      }
    } catch {
      setSettings(defaults);
    }
    const updateClocks = () => {
      setClock(hm());
      setCaliforniaClock(worldHm("America/Los_Angeles"));
      setRussiaClock(worldHm("Europe/Moscow"));
      setChinaClock(worldHm("Asia/Shanghai"));
    };
    updateClocks();
    setIsOnline(navigator.onLine);
    setReady(true);
    const timer = window.setInterval(updateClocks, 1000);
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        )
        .catch(() => undefined);
    }
    if ("caches" in window) {
      void caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys.filter((key) => key.startsWith("zcar-")).map((key) => caches.delete(key)),
          ),
        )
        .catch(() => undefined);
    }
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (fuelResetTimerRef.current !== null) {
        window.clearTimeout(fuelResetTimerRef.current);
      }
      if (locationWatchRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
      }
      leafletMapRef.current?.remove();
      leafletMapRef.current = null;
      greenLeafletMapRef.current?.remove();
      greenLeafletMapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem("zcar", JSON.stringify(settings));
  }, [ready, settings]);

  useEffect(() => {
    if (!ready || showMeter || showFuel || showMusic) return;
    setHomePlaylistIndex((current) => {
      let next = Math.floor(Math.random() * HOME_RANDOM_PLAYLISTS.length);
      if (HOME_RANDOM_PLAYLISTS.length > 1 && next === current) {
        next = (next + 1) % HOME_RANDOM_PLAYLISTS.length;
      }
      return next;
    });
  }, [ready, showMeter, showFuel, showMusic]);

  useEffect(() => {
    if (ready) {
      localStorage.setItem(FUEL_LOG_STORAGE_KEY, JSON.stringify(fuelEntries));
    }
  }, [fuelEntries, ready]);

  useEffect(() => {
    fuelMotionRef.current = { speed: obdData.speed, status: obdStatus };
  }, [obdData.speed, obdStatus]);

  useEffect(() => {
    speedTargetRef.current = obdData.speed;
    if (obdData.speed === null) {
      speedSamplesRef.current = [];
      smoothedSpeedRef.current = null;
      speedZeroSinceRef.current = null;
      setDisplaySpeed(null);
    }
  }, [obdData.speed]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const rawSpeed = speedTargetRef.current;
      if (rawSpeed === null) return;

      const now = performance.now();
      const speed = Math.max(0, rawSpeed);

      if (speed === 0) {
        speedZeroSinceRef.current ??= now;
      } else if (speedZeroSinceRef.current !== null) {
        speedZeroSinceRef.current = null;
        speedSamplesRef.current = [];
        smoothedSpeedRef.current = null;
      }

      speedSamplesRef.current = [
        ...speedSamplesRef.current.filter((sample) => now - sample.sampledAt <= 2000),
        { value: speed, sampledAt: now },
      ];

      if (
        speedZeroSinceRef.current !== null &&
        now - speedZeroSinceRef.current >= 800
      ) {
        smoothedSpeedRef.current = 0;
        setDisplaySpeed(0);
        return;
      }

      const ordered = speedSamplesRef.current
        .map((sample) => sample.value)
        .sort((left, right) => left - right);
      const stableValues =
        ordered.length >= 5 ? ordered.slice(1, -1) : ordered;
      const average =
        stableValues.reduce((total, value) => total + value, 0) /
        stableValues.length;
      const previous = smoothedSpeedRef.current;
      const smoothed = previous === null
        ? average
        : previous + (average - previous) * 0.4;

      smoothedSpeedRef.current = smoothed;
      setDisplaySpeed(Math.round(smoothed));
    }, 400);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let previousSample = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsedMs = Math.min(now - previousSample, 3000);
      previousSample = now;
      const { speed, status } = fuelMotionRef.current;
      if (status !== "live" || speed === null || speed <= 0) return;
      const travelledKm = speed * (elapsedMs / 3_600_000);
      setFuelTripKm((current) => current + travelledKm);
      const currentDate = japanDateKey();
      setDailyTrip((current) => ({
        date: currentDate,
        distanceKm:
          current.date === currentDate
            ? current.distanceKm + travelledKm
            : travelledKm,
      }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (ready) {
      localStorage.setItem("zcar-fuel-trip-km", fuelTripKm.toFixed(4));
    }
  }, [fuelTripKm, ready]);

  useEffect(() => {
    if (ready) {
      localStorage.setItem(DAILY_TRIP_STORAGE_KEY, JSON.stringify(dailyTrip));
    }
  }, [dailyTrip, ready]);

  useEffect(() => {
    const syncFullscreen = () =>
      setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    syncFullscreen();
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    const returnToHome = () => {
      setShowMeter(false);
      setShowFuel(false);
      setShowMusic(false);
      setMusicPage(1);
    };
    window.addEventListener("popstate", returnToHome);
    return () => window.removeEventListener("popstate", returnToHome);
  }, []);

  useEffect(() => {
    const returnToHomeWhenFullscreenCloses = () => {
      if (showMeter && !document.fullscreenElement) {
        setShowMeter(false);
        window.history.replaceState(
          { ...(window.history.state || {}), zcarView: "home" },
          "",
        );
      }
    };
    document.addEventListener("fullscreenchange", returnToHomeWhenFullscreenCloses);
    return () =>
      document.removeEventListener("fullscreenchange", returnToHomeWhenFullscreenCloses);
  }, [showMeter]);

  const launchZCar = () => {
    setHasStarted(true);
    window.history.replaceState(
      { ...(window.history.state || {}), zcarView: "home" },
      "",
    );
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {
        // The home still opens if this browser does not permit fullscreen.
      });
    }
  };

  const toggleMeterView = async () => {
    const openingMeter = !showMeter;

    if (!openingMeter) {
      setShowMeter(false);
      if (window.history.state?.zcarView === "meter") {
        window.history.back();
      }
      return;
    }

    setShowFuel(false);
    setShowMusic(false);
    setShowMeter(true);
    window.history.pushState(
      { ...(window.history.state || {}), zcarView: "meter" },
      "",
    );

    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Keep the meter available even when the browser blocks fullscreen.
    }
  };

  const exitMeterFromBrand = async () => {
    if (!showMeter) return;

    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
        return;
      } catch {
        // Fall through and return to the home view when fullscreen exit is blocked.
      }
    }

    setShowMeter(false);
    window.history.replaceState(
      { ...(window.history.state || {}), zcarView: "home" },
      "",
    );
  };

  const toggleFuelView = () => {
    if (showFuel) {
      setShowFuel(false);
      if (window.history.state?.zcarView === "fuel") {
        window.history.back();
      }
      return;
    }

    setShowMeter(false);
    setShowMusic(false);
    setShowFuel(true);
    setFuelDraft((current) => ({ ...current, date: japanDateKey() }));
    window.history.pushState(
      { ...(window.history.state || {}), zcarView: "fuel" },
      "",
    );
  };

  const toggleMusicView = () => {
    if (showMusic) {
      setShowMusic(false);
      setMusicPage(1);
      if (window.history.state?.zcarView === "music") {
        window.history.back();
      }
      return;
    }

    setShowMeter(false);
    setShowFuel(false);
    setMusicPage(1);
    setShowMusic(true);
    window.history.pushState(
      { ...(window.history.state || {}), zcarView: "music" },
      "",
    );
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus("unavailable");
      return;
    }
    setLocationStatus("locating");
    if (locationWatchRef.current !== null) {
      navigator.geolocation.clearWatch(locationWatchRef.current);
    }
    locationWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setLocation((current) => {
          const rawHeading = position.coords.heading;
          let heading = current?.heading ?? null;
          if (rawHeading !== null && Number.isFinite(rawHeading)) {
            if (heading === null) {
              heading = rawHeading;
            } else {
              const normalizedCurrent = ((heading % 360) + 360) % 360;
              const shortestTurn = ((rawHeading - normalizedCurrent + 540) % 360) - 180;
              heading += shortestTurn;
            }
          }
          return {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            heading,
          };
        });
        setLocationStatus("ready");
      },
      () =>
        setLocationStatus((current) =>
          current === "ready" ? current : "unavailable",
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 1000 },
    );
  };

  useEffect(() => {
    if (ready && hasStarted) requestLocation();
  }, [ready, hasStarted]);

  useEffect(() => {
    if (!weatherLocationKey || weatherLatitude === null || weatherLongitude === null) return;
    let cancelled = false;

    const loadWeather = async () => {
      setWeatherStatus("loading");
      try {
        const query = new URLSearchParams({
          latitude: String(weatherLatitude),
          longitude: String(weatherLongitude),
          current: "temperature_2m,weather_code,is_day",
          hourly: "temperature_2m,weather_code,is_day",
          daily: "sunrise,sunset",
          forecast_hours: "13",
          forecast_days: "1",
          timezone: "auto",
        });
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`);
        if (!response.ok) throw new Error("Weather request failed");
        const payload = (await response.json()) as {
          current?: { temperature_2m?: number; weather_code?: number; is_day?: number };
          hourly?: {
            time?: string[];
            temperature_2m?: number[];
            weather_code?: number[];
            is_day?: number[];
          };
          daily?: { sunrise?: string[]; sunset?: string[] };
        };
        const current = payload.current;
        const hourly = payload.hourly;
        if (
          !current ||
          !Number.isFinite(current.temperature_2m) ||
          !Number.isFinite(current.weather_code) ||
          !hourly?.time ||
          !hourly.temperature_2m ||
          !hourly.weather_code ||
          !hourly.is_day
        ) {
          throw new Error("Weather data unavailable");
        }
        const hours = [3, 6].flatMap((index) => {
          const time = hourly.time?.[index];
          const temperature = hourly.temperature_2m?.[index];
          const code = hourly.weather_code?.[index];
          const isDay = hourly.is_day?.[index];
          if (!time || !Number.isFinite(temperature) || !Number.isFinite(code)) return [];
          return [{
            time: time.slice(11, 16),
            temperature: temperature as number,
            code: code as number,
            isDay: Boolean(isDay),
          }];
        });
        if (cancelled) return;
        setWeather({
          temperature: current.temperature_2m as number,
          code: current.weather_code as number,
          isDay: Boolean(current.is_day),
          hours,
          sunrise: payload.daily?.sunrise?.[0]?.slice(11, 16) ?? null,
          sunset: payload.daily?.sunset?.[0]?.slice(11, 16) ?? null,
        });
        setWeatherStatus("ready");
      } catch {
        if (!cancelled) setWeatherStatus("error");
      }
    };

    void loadWeather();
    const timer = window.setInterval(() => void loadWeather(), 30 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [weatherLocationKey]);

  useEffect(() => {
    if (!location || !liveMapElementRef.current) return;
    let cancelled = false;

    const updateLiveMap = async () => {
      const L = await import("leaflet");
      if (cancelled || !liveMapElementRef.current) return;
      const point: [number, number] = [location.lat, location.lng];

      if (!leafletMapRef.current) {
        const map = L.map(liveMapElementRef.current, {
          zoomControl: false,
          attributionControl: true,
          dragging: false,
          scrollWheelZoom: false,
          touchZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false,
          zoomAnimation: true,
        }).setView(point, 16);

        L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
          {
            subdomains: "abcd",
            maxZoom: 20,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          },
        ).addTo(map);
        map.attributionControl.setPrefix(false);
        leafletMapRef.current = map;
        liveAccuracyCircleRef.current = L.circle(point, {
          radius: Math.max(5, location.accuracy),
          color: "#5ee6b2",
          weight: 1,
          opacity: 0.34,
          fillColor: "#45d99f",
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(map);
        livePositionMarkerRef.current = L.circleMarker(point, {
          radius: 9,
          color: "#eafff6",
          weight: 3,
          fillColor: "#55e7ad",
          fillOpacity: 1,
          interactive: false,
        }).addTo(map);
        window.setTimeout(() => map.invalidateSize({ pan: false }), 0);
        return;
      }

      livePositionMarkerRef.current?.setLatLng(point);
      liveAccuracyCircleRef.current
        ?.setLatLng(point)
        .setRadius(Math.max(5, location.accuracy));
      leafletMapRef.current.panTo(point, {
        animate: true,
        duration: 0.45,
        easeLinearity: 0.65,
      });
    };

    void updateLiveMap();
    return () => {
      cancelled = true;
    };
  }, [location, showMeter, showFuel, showMusic]);

  useEffect(() => {
    if (!showMeter && !showFuel && !showMusic) return;
    leafletMapRef.current?.remove();
    leafletMapRef.current = null;
    livePositionMarkerRef.current = null;
    liveAccuracyCircleRef.current = null;
  }, [showMeter, showFuel, showMusic]);

  useEffect(() => {
    if (showMeter && settings.meterTheme === "green") return;
    greenLeafletMapRef.current?.remove();
    greenLeafletMapRef.current = null;
  }, [showMeter, settings.meterTheme]);

  useEffect(() => {
    if (
      !showMeter ||
      settings.meterTheme !== "green" ||
      !greenMapElementRef.current
    ) return;
    let cancelled = false;

    const updateGreenMap = async () => {
      const L = await import("leaflet");
      if (cancelled || !greenMapElementRef.current) return;
      const fallbackPoint: [number, number] = [34.6937, 135.5023];
      const focusPoint = !location
        ? fallbackPoint
        : ([location.lat, location.lng] as [number, number]);

      if (!greenLeafletMapRef.current) {
        const map = L.map(greenMapElementRef.current, {
          zoomControl: false,
          attributionControl: false,
          dragging: false,
          scrollWheelZoom: false,
          touchZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false,
          zoomAnimation: false,
          fadeAnimation: false,
          markerZoomAnimation: false,
        }).setView(focusPoint, GREEN_METER_MAP_ZOOM);

        L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
          { subdomains: "abcd", maxZoom: 20, crossOrigin: true },
        ).addTo(map);
        greenLeafletMapRef.current = map;
        window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));
        window.setTimeout(() => map.invalidateSize({ pan: false }), 180);
        window.setTimeout(() => map.invalidateSize({ pan: false }), 650);
        return;
      }

      greenLeafletMapRef.current.setView(focusPoint, GREEN_METER_MAP_ZOOM, {
        animate: false,
      });
    };

    void updateGreenMap();
    return () => {
      cancelled = true;
    };
  }, [showMeter, location, settings.meterTheme]);

  useEffect(() => {
    if (
      !showMeter ||
      settings.meterTheme !== "green" ||
      !greenMapElementRef.current
    ) return;
    const element = greenMapElementRef.current;
    const refreshMapSize = () =>
      greenLeafletMapRef.current?.invalidateSize({ pan: false });
    const observer = new ResizeObserver(refreshMapSize);
    observer.observe(element);
    const firstRefresh = window.setTimeout(refreshMapSize, 60);
    const finalRefresh = window.setTimeout(refreshMapSize, 500);
    return () => {
      observer.disconnect();
      window.clearTimeout(firstRefresh);
      window.clearTimeout(finalRefresh);
    };
  }, [showMeter, settings.meterTheme]);

  useEffect(() => {
    if (!ready) return;
    let active = true;

    const loadShift = async () => {
      try {
        const response = await fetch(SHIFT_URL, { cache: "no-store" });
        if (!response.ok) throw new Error("shift request failed");
        const data = (await response.json()) as ShiftFeed;
        if (!Array.isArray(data.shifts)) throw new Error("invalid shift data");
        if (active) {
          setShiftFeed(data);
          setShiftStatus("ready");
        }
      } catch {
        if (active) setShiftStatus("error");
      }
    };

    loadShift();
    return () => {
      active = false;
    };
  }, [ready]);

  const hour = new Date().getHours();
  const greeting =
    hour < 11
      ? "おはようございます"
      : hour < 18
        ? "お疲れさまです"
        : "本日もお疲れさまでした";

  const stateLabel =
    settings.state === "not_departed"
      ? "未出発"
      : settings.state === "departed"
        ? `出発済み ・ ${settings.departedAt}`
        : `退勤済み ・ ${settings.checkedOutAt}`;

  const today = japanDateKey();
  const todayShift = shiftFeed?.shifts.find((shift) => shift.date === today);
  const nextShift = shiftFeed?.shifts
    .filter((shift) => shift.date > today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const destinationName = todayShift?.storeName || settings.storeName;
  const destinationQuery = todayShift?.storeName || settings.storeDest;
  const homeboundMode = hour >= 19 || settings.state === "checked_out";
  const routeCardLabel = homeboundMode
    ? "本日もお疲れさまでした ・ 帰宅先"
    : `${greeting} ・ 本日の稼働先`;
  const routeCardDestination = homeboundMode ? "自宅" : destinationName;
  const workFinished = Boolean(
    todayShift && (settings.state === "checked_out" || hour >= 19),
  );
  const monitorMessage =
    shiftStatus === "loading"
      ? "シフトを確認しています"
      : shiftStatus === "error"
        ? "シフトを取得できません"
        : todayShift
          ? workFinished
            ? "本日もお疲れ様でした"
            : "本日は出勤日です"
          : "本日はお休みです";
  const monitorValue =
    shiftStatus === "loading"
      ? "···"
      : shiftStatus === "error"
        ? "—"
        : todayShift && !workFinished
          ? todayShift.startTime
          : todayShift
            ? "DONE"
            : "OFF";
  const monitorTone =
    shiftStatus === "loading" || shiftStatus === "error"
      ? "waiting"
      : todayShift
        ? workFinished
          ? "finished"
          : "active"
        : "off";
  const routeMinutesRemaining = routeEta
    ? Math.max(0, Math.ceil((routeEta.arrivalAt - Date.now()) / 60_000))
    : null;
  const routeArrivalTime = routeEta
    ? new Date(routeEta.arrivalAt).toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : null;
  const greenRpmPercent = Math.max(
    0,
    Math.min(100, ((obdData.rpm ?? 0) / 8000) * 100),
  );
  const greenSpeedPercent = Math.max(
    0,
    Math.min(100, ((displaySpeed ?? 0) / 120) * 100),
  );
  const greenHeading =
    location?.heading === null || location?.heading === undefined
      ? null
      : ((location.heading % 360) + 360) % 360;
  const greenMeterHeading =
    greenHeading === null ? 0 : (Math.round(greenHeading / 15) * 15) % 360;
  const greenCockpitStyle = {
    "--green-rpm-level": `${greenRpmPercent}%`,
    "--green-speed-level": `${greenSpeedPercent}%`,
    "--rpm-progress": `${greenRpmPercent * 3}deg`,
    "--green-map-rotation": `${-greenMeterHeading}deg`,
  } as CSSProperties;
  const greenCenterSpeed =
    displaySpeed === null ? null : Math.round(displaySpeed);
  const dailyTripKm = dailyTrip.date === today ? dailyTrip.distanceKm : 0;
  const performanceDate = `${today.slice(5, 7)}.${today.slice(8, 10)}`;
  const performanceWeekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
  })
    .format(new Date(`${today}T00:00:00+09:00`))
    .toUpperCase();
  const solarSunrise = weather?.sunrise ?? null;
  const solarSunset = weather?.sunset ?? null;
  const solarNowMinutes = minutesFromHm(clock);
  const solarRiseMinutes = minutesFromHm(solarSunrise);
  const solarSetMinutes = minutesFromHm(solarSunset);
  const solarProgress =
    solarNowMinutes === null ||
    solarRiseMinutes === null ||
    solarSetMinutes === null ||
    solarSetMinutes <= solarRiseMinutes
      ? null
      : Math.max(0, Math.min(1, (solarNowMinutes - solarRiseMinutes) / (solarSetMinutes - solarRiseMinutes)));
  const solarPointX = 4 + 82 * (solarProgress ?? 0.5);
  const solarPointY = 24 - 22 * Math.sin(Math.PI * (solarProgress ?? 0.5));
  const obdStatusLabelEn = obdConnectionLabel;

  const cancelFuelReset = () => {
    if (fuelResetTimerRef.current !== null) {
      window.clearTimeout(fuelResetTimerRef.current);
      fuelResetTimerRef.current = null;
    }
    setFuelResetting(false);
  };

  const startFuelReset = () => {
    cancelFuelReset();
    setFuelResetting(true);
    fuelResetTimerRef.current = window.setTimeout(() => {
      setFuelTripKm(0);
      setFuelResetting(false);
      fuelResetTimerRef.current = null;
      navigator.vibrate?.(60);
    }, 900);
  };

  const todayDate = new Date(`${today}T00:00:00+09:00`);
  const weekShifts = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(todayDate.getTime() + index * 24 * 60 * 60 * 1000);
    const dateKey = japanDateKey(date);
    return {
      dateKey,
      day: Number(dateKey.split("-")[2]),
      weekday: new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        weekday: "short",
      }).format(date),
      shift: shiftFeed?.shifts.find((item) => item.date === dateKey),
    };
  });

  const openSettings = () => {
    setDraft(settings);
    settingsDialog.current?.showModal();
  };

  const beginNavigation = async (
    destination: string,
    destinationLabel: RouteEta["destination"],
  ) => {
    const apiKey = settings.googleRoutesApiKey.trim();
    if (apiKey && location) {
      setRouteEtaStatus("loading");
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 6500);
      try {
        const response = await fetch(
          "https://routes.googleapis.com/directions/v2:computeRoutes",
          {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": apiKey,
              "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
            },
            body: JSON.stringify({
              origin: {
                location: {
                  latLng: {
                    latitude: location.lat,
                    longitude: location.lng,
                  },
                },
              },
              destination: { address: destination },
              travelMode: "DRIVE",
              routingPreference: "TRAFFIC_AWARE",
              languageCode: "ja",
              units: "METRIC",
            }),
          },
        );
        if (!response.ok) throw new Error("route request failed");
        const data = (await response.json()) as {
          routes?: Array<{ duration?: string }>;
        };
        const durationSeconds = Math.ceil(
          Number.parseFloat(data.routes?.[0]?.duration?.replace("s", "") || ""),
        );
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
          throw new Error("route duration unavailable");
        }
        const nextEta: RouteEta = {
          arrivalAt: Date.now() + durationSeconds * 1000,
          durationSeconds,
          destination: destinationLabel,
        };
        localStorage.setItem("zcar-route-eta", JSON.stringify(nextEta));
        setRouteEta(nextEta);
        setRouteEtaStatus("ready");
      } catch {
        setRouteEtaStatus("error");
      } finally {
        window.clearTimeout(timeout);
      }
    }
    openMap(destination);
  };

  const mainAction = async () => {
    if (homeboundMode) {
      if (!settings.homeDest) {
        openSettings();
        return;
      }
      await beginNavigation(settings.homeDest, "HOME");
      return;
    }
    if (settings.state === "not_departed") {
      const next = {
        ...settings,
        state: "departed" as const,
        departedAt: hm(),
      };
      setSettings(next);
      await beginNavigation(destinationQuery, "DESTINATION");
      return;
    }
    if (settings.state === "departed") {
      await beginNavigation(destinationQuery, "DESTINATION");
      return;
    }
    if (!settings.homeDest) {
      openSettings();
      return;
    }
    await beginNavigation(settings.homeDest, "HOME");
  };

  const completeCheckout = async () => {
    homeDialog.current?.close();
    const next = {
      ...settings,
      state: "checked_out" as const,
      checkedOutAt: hm(),
    };
    setSettings(next);
    if (!next.homeDest) {
      setDraft(next);
      settingsDialog.current?.showModal();
      return;
    }
    await beginNavigation(next.homeDest, "HOME");
  };

  const fuelLitersInput = Number.parseFloat(fuelDraft.liters);
  const fuelDistanceInput = Number.parseFloat(fuelDraft.distanceKm);
  const fuelAmountInput = Number.parseFloat(fuelDraft.amountYen);
  const fuelDraftIsValid =
    /^\d{4}-\d{2}-\d{2}$/.test(fuelDraft.date) &&
    Number.isFinite(fuelLitersInput) &&
    fuelLitersInput > 0 &&
    Number.isFinite(fuelDistanceInput) &&
    fuelDistanceInput >= 0 &&
    Number.isFinite(fuelAmountInput) &&
    fuelAmountInput >= 0;
  const currentFuelEconomy =
    Number.isFinite(fuelLitersInput) &&
    fuelLitersInput > 0 &&
    Number.isFinite(fuelDistanceInput) &&
    fuelDistanceInput >= 0
      ? fuelDistanceInput / fuelLitersInput
      : null;
  const currentMonthKey = japanDateKey().slice(0, 7);
  const currentMonthFuelEntries = fuelEntries.filter((entry) =>
    entry.date.startsWith(currentMonthKey),
  );
  const monthlyFuelLiters = currentMonthFuelEntries.reduce(
    (total, entry) => total + entry.liters,
    0,
  );
  const monthlyFuelDistance = currentMonthFuelEntries.reduce(
    (total, entry) => total + entry.distanceKm,
    0,
  );
  const monthlyFuelAmount = currentMonthFuelEntries.reduce(
    (total, entry) => total + entry.amountYen,
    0,
  );
  const monthlyFuelEconomy =
    monthlyFuelLiters > 0 ? monthlyFuelDistance / monthlyFuelLiters : null;
  const sortedFuelEntries = [...fuelEntries].sort(
    (left, right) =>
      right.date.localeCompare(left.date) || right.createdAt - left.createdAt,
  );
  const recentFuelEntries = sortedFuelEntries.slice(0, 5);
  const recentFuelLiters = recentFuelEntries.reduce(
    (total, entry) => total + entry.liters,
    0,
  );
  const recentFuelDistance = recentFuelEntries.reduce(
    (total, entry) => total + entry.distanceKm,
    0,
  );
  const recentFuelEconomy =
    recentFuelLiters > 0 ? recentFuelDistance / recentFuelLiters : null;
  const estimatedUsedLiters =
    recentFuelEconomy === null ? null : fuelTripKm / recentFuelEconomy;
  const estimatedRemainingLiters =
    estimatedUsedLiters === null
      ? null
      : Math.max(0, FUEL_TANK_CAPACITY_L - estimatedUsedLiters);
  const safeRemainingLiters =
    estimatedRemainingLiters === null
      ? null
      : Math.max(0, estimatedRemainingLiters - FUEL_RESERVE_L);
  const fuelRangeKm =
    safeRemainingLiters === null || recentFuelEconomy === null
      ? 0
      : safeRemainingLiters * recentFuelEconomy;
  const fuelPercent =
    estimatedRemainingLiters === null
      ? 0
      : Math.max(0, Math.min(100, (estimatedRemainingLiters / FUEL_TANK_CAPACITY_L) * 100));
  const estimatedAverageFuelEconomy = recentFuelEconomy;
  const homePlaylist = HOME_RANDOM_PLAYLISTS[homePlaylistIndex];

  const recordFuelEntry = () => {
    if (!fuelDraftIsValid) return;
    const now = Date.now();
    setFuelEntries((current) => [
      ...current,
      {
        id: `${now}`,
        date: fuelDraft.date,
        liters: fuelLitersInput,
        distanceKm: fuelDistanceInput,
        amountYen: Math.round(fuelAmountInput),
        createdAt: now,
      },
    ]);
    setFuelTripKm(0);
    navigator.vibrate?.(60);
    setFuelDraft({
      date: japanDateKey(),
      liters: "",
      distanceKm: "",
      amountYen: "",
    });
  };

  return (
    <div className="screen-shell">
      {!hasStarted ? (
        <main className="launch-screen" aria-label="Z CAR 起動画面">
          <button
            type="button"
            className="launch-logo-button"
            onClick={launchZCar}
            aria-label="Z CARを起動"
          >
            <img
              className="launch-landscape"
              src="/z-car-launch-landscape.png"
              alt="Z CAR"
            />
            <span className="launch-vignette" aria-hidden="true" />
            <span className="launch-target" aria-hidden="true"><i /></span>
          </button>
        </main>
      ) : (
      <div
        id="app"
        className={`${showMeter ? "is-fullscreen " : ""}${isFullscreen ? "browser-fullscreen " : ""}meter-theme-${settings.meterTheme}`}
        aria-label="Z CAR カーナビホーム"
      >
        <header className="topbar">
          <button
            type="button"
            className="brand brand-secret-exit"
            onClick={exitMeterFromBrand}
            disabled={!showMeter}
            aria-label={showMeter ? "全画面メーターを終了" : undefined}
          >
            <b>Z CAR</b>
            <small>
              {showMeter
                ? "OBD2 VEHICLE MONITOR"
                : showFuel
                  ? "TANTO FUEL ECONOMY"
                  : showMusic
                    ? "MUSIC LIBRARY"
                  : "Z PORTAL | CAR"}
            </small>
          </button>
          <div className="car-status">
            {showMeter ? (
              <span className="car-id">{settings.carId}</span>
            ) : (
              <button
                type="button"
                className={`car-id car-id-button ${showFuel ? "active" : ""}`}
                onClick={toggleFuelView}
                aria-label={showFuel ? "ホーム画面へ戻る" : "タントの燃費計算を開く"}
              >
                {showFuel ? "HOME" : settings.carId}
              </button>
            )}
            {!showFuel && (
              <button
                type="button"
                className={`meter-view-button ${showMeter ? "active" : ""}`}
                onClick={toggleMeterView}
                aria-label={showMeter ? "ホーム画面へ戻る" : "デジタルメーターを表示"}
              >
                {showMeter ? "HOME" : "METER"}
              </button>
            )}
            {!showFuel && !showMusic && (
              <button
                type="button"
                className="meter-theme-button"
                onClick={() => themeDialog.current?.showModal()}
                aria-label="Select meter theme"
              >
                THEME
              </button>
            )}
            {showMeter && (
              <button
                type="button"
                className={`obd-connect-compact ${obdStatus}`}
                onClick={connectObd}
                aria-label="Connect OBD2"
                title={`${obdDeviceName} · ${obdStatusLabelEn}${obdErrorMessage ? ` · ${obdErrorMessage}` : ""}`}
              >
                <i aria-hidden="true" />
                <span>OBD2</span>
              </button>
            )}
            <strong className="clock" aria-label={`現在時刻 ${clock}`}>
              {clock}
            </strong>
          </div>
        </header>

        {showMeter && (
          <main className="fullscreen-obd" aria-label="CARISTA OBD2 vehicle monitor">
            {settings.meterTheme === "red-triple" ? (
              <section className="fusion-cluster" aria-label="Red integrated meter cluster">
                <header className={`triple-status ${obdStatus}`}>
                  <strong>DRIVE MONITOR</strong>
                  <span><i aria-hidden="true" />{obdStatusLabelEn}</span>
                  <b>
                    {routeMinutesRemaining === null
                      ? "ETA --"
                      : `DESTINATION ${routeMinutesRemaining} MIN`}
                  </b>
                </header>

                <div className="red-cockpit-stage">
                  <RedCockpit
                    rpm={obdData.rpm}
                    speed={displaySpeed}
                    coolant={obdData.coolant}
                    voltage={obdData.voltage}
                    weather={weather}
                    weatherStatus={locationStatus === "unavailable" ? "error" : weatherStatus}
                  />
                </div>

                <footer className="triple-footer fusion-footer">
                  <span><small>LOCAL TIME</small><b>{clock}</b></span>
                  <button
                    type="button"
                    className={fuelResetting ? "resetting" : undefined}
                    onPointerDown={startFuelReset}
                    onPointerUp={cancelFuelReset}
                    onPointerLeave={cancelFuelReset}
                    onPointerCancel={cancelFuelReset}
                    onContextMenu={(event) => event.preventDefault()}
                    aria-label={`Estimated range ${Math.round(fuelRangeKm)} kilometers. Hold to refuel.`}
                  >
                    <small>ESTIMATED RANGE</small>
                    <b>{Math.round(fuelRangeKm)} km</b>
                    <i style={{ width: `${fuelPercent}%` }} aria-hidden="true" />
                  </button>
                  <span><small>ARRIVAL</small><b>{routeArrivalTime ?? "--:--"}</b></span>
                </footer>
              </section>
            ) : (
              <section className="performance-cluster green-nav-cluster" style={greenCockpitStyle}>
              <header className={`performance-banner ${obdStatus}`}>
                <strong>NAVIGATION SYSTEM</strong>
                <i aria-hidden="true" />
                <span>{obdStatusLabelEn}</span>
                <i aria-hidden="true" />
                <b>{settings.carId.toUpperCase()} / OBD2</b>
              </header>

              <aside className="performance-side performance-left green-instrument-rail">
                <article className={`performance-date solar-clock-card ${weather?.isDay ? "day" : "night"}`}>
                  <div className="solar-clock-heading">
                    <small>LOCAL TIME</small>
                    <time>{clock}</time>
                  </div>
                  <div className="solar-clock-date">
                    <strong>{performanceDate}</strong>
                    <span>{performanceWeekday} · JST</span>
                  </div>
                  <div className={`solar-cycle ${weatherStatus}`} aria-label={`Sunrise ${solarSunrise ?? "unavailable"}, sunset ${solarSunset ?? "unavailable"}`}>
                    <span className="sunrise">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 18h18M5 14h2m10 0h2M8 10 6.5 8.5M16 10l1.5-1.5M12 8V5" />
                        <path d="M7.5 18a4.5 4.5 0 0 1 9 0" />
                        <path d="m10 12 2-2 2 2M12 10v5" />
                      </svg>
                      <b>{solarSunrise ?? "--:--"}</b>
                    </span>
                    <svg className="solar-orbit" viewBox="0 0 90 28" aria-hidden="true">
                      <path className="solar-horizon" d="M3 24H87" />
                      <path className="solar-path" d="M4 24Q45 -7 86 24" />
                      {solarProgress !== null ? <circle cx={solarPointX} cy={solarPointY} r="2.8" /> : null}
                    </svg>
                    <span className="sunset">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 18h18M5 14h2m10 0h2M8 10 6.5 8.5M16 10l1.5-1.5M12 8V5" />
                        <path d="M7.5 18a4.5 4.5 0 0 1 9 0" />
                        <path d="m10 12 2 2 2-2M12 9v5" />
                      </svg>
                      <b>{solarSunset ?? "--:--"}</b>
                    </span>
                  </div>
                </article>

                <article className={`green-temperature-card ${weatherStatus}`}>
                  <small>OUTSIDE TEMPERATURE</small>
                  <p>
                    <strong>{weather ? Math.round(weather.temperature) : "—"}</strong>
                    <em>°C</em>
                  </p>
                  <span>CURRENT LOCATION</span>
                </article>

                <article className={`green-weather green-weather-side ${weatherStatus}`}>
                  {weather ? (
                    <div className="green-weather-timeline" aria-label="現在から6時間先までの天気">
                      <span>
                        <small>NOW</small>
                        <svg viewBox="0 0 48 48" aria-hidden="true">
                          <WeatherGlyph
                            code={weather.code}
                            isDay={weather.isDay}
                            x={24}
                            y={24}
                            size={43}
                          />
                        </svg>
                        <b>{weatherLabel(weather.code)}</b>
                      </span>
                      {weather.hours.map((hour, index) => (
                        <span key={hour.time}>
                          <small>{index === 0 ? "+3H" : "+6H"}</small>
                          <svg viewBox="0 0 48 48" aria-hidden="true">
                            <WeatherGlyph
                              code={hour.code}
                              isDay={hour.isDay}
                              x={24}
                              y={24}
                              size={39}
                            />
                          </svg>
                          <b>{weatherLabel(hour.code)}</b>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span>
                      <small>LOCAL WEATHER</small>
                      <strong>{weatherStatus === "loading" ? "···" : "—"}</strong>
                    </span>
                  )}
                </article>

                <article className="green-world-times-card" aria-label="World time">
                  <small>WORLD TIME</small>
                  <div className="green-world-times">
                    <span aria-label={`California time ${californiaClock}`}>
                      <b>CALIFORNIA</b>
                      <time>{californiaClock}</time>
                    </span>
                    <span aria-label={`Russia Moscow time ${russiaClock}`}>
                      <b>RUSSIA</b>
                      <time>{russiaClock}</time>
                    </span>
                    <span aria-label={`China Beijing time ${chinaClock}`}>
                      <b>CHINA</b>
                      <time>{chinaClock}</time>
                    </span>
                  </div>
                </article>

                <article className="green-daily-distance-card">
                  <div className="green-daily-distance">
                    <small>TODAY DISTANCE</small>
                    <span><strong>{dailyTripKm.toFixed(1)}</strong><em>km</em></span>
                  </div>
                </article>

              </aside>

              <article className="performance-main-gauge green-map-gauge" aria-label="Map integrated tachometer and speedometer">
                <div className="performance-rpm-track" aria-hidden="true" />
                <div className="performance-rpm-ticks" aria-hidden="true" />
                <div className="performance-rpm-labels" aria-hidden="true">
                  <span>0</span><span>1</span><span>2</span><span>3</span><span>4</span>
                  <span>5</span><span>6</span><span>7</span><span>8</span>
                </div>
                <small className="performance-rpm-title">ENGINE SPEED · ×1000 RPM</small>

                <div className="green-gauge-map-window">
                  <div className="green-map-rotator" aria-hidden="true">
                    <div ref={greenMapElementRef} className="green-nav-map-canvas" />
                  </div>
                  <div className="green-map-grid" aria-hidden="true" />
                  <div className="green-map-vignette" aria-hidden="true" />
                  <div className={`green-compass-bearing ${locationStatus}`} aria-hidden="true">
                    <span className="north">N</span>
                    <span className="east">E</span>
                    <span className="south">S</span>
                    <span className="west">W</span>
                  </div>
                  <div className="green-gauge-speed">
                    <small>SPEED</small>
                    <strong>{greenCenterSpeed ?? "—"}</strong>
                    <span>km/h</span>
                  </div>
                  <a className="green-gauge-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OSM</a>
                </div>

                <div className="performance-rpm-digital">
                  <small>RPM</small>
                  <b>{obdData.rpm ?? "—"}</b>
                  <span>rpm</span>
                </div>
              </article>

              <aside className="performance-side performance-right green-drive-panel green-instrument-rail">
                <article
                  className="green-range-card"
                  aria-label={`Safe estimated range ${Math.round(fuelRangeKm)} kilometers. Resets automatically when a refuel record is saved.`}
                >
                  <small>SAFE EST. RANGE</small>
                  <span><strong>{Math.round(fuelRangeKm)}</strong><em>km</em></span>
                  <div className="green-range-scale" aria-hidden="true">
                    <b>F</b><div><i style={{ width: `${fuelPercent}%` }} /></div><b>E</b>
                  </div>
                  <small>AUTO RESET · REFUEL LOG</small>
                </article>
                <article className="green-average-fuel-card" aria-label="Estimated average fuel economy">
                  <div className="green-average-fuel" aria-label="Estimated average fuel economy">
                    <span>
                      <small>EST. AVERAGE FUEL</small>
                      <b>{estimatedAverageFuelEconomy === null ? "—" : estimatedAverageFuelEconomy.toFixed(1)}</b>
                      <em>km/L</em>
                    </span>
                    <i>FULL TANK TRIP {Math.round(fuelTripKm)} km / EST {estimatedRemainingLiters?.toFixed(1) ?? "—"} L</i>
                  </div>
                </article>
                <article className="green-speed-card">
                  <div className="green-telemetry-graph green-speed-graph">
                    <header><small>SPEED</small><em>km/h</em></header>
                    <div className="green-range-scale green-speed-scale" aria-label="Speed from 0 to 120 kilometers per hour">
                      <b>0</b><div><i /></div><b>120</b>
                    </div>
                  </div>
                </article>
                <article className="green-obd-card">
                  <small>COOLANT TEMP</small>
                  <p><strong>{obdData.coolant ?? "—"}</strong><em>°C</em></p>
                  <span>ENGINE THERMAL</span>
                </article>
                <article className="green-obd-card">
                  <small>SYSTEM VOLTAGE</small>
                  <p><strong>{obdData.voltage?.toFixed(1) ?? "—"}</strong><em>V</em></p>
                  <span>BATTERY SYSTEM</span>
                </article>
              </aside>
              </section>
            )}
          </main>
        )}

        {showFuel ? (
          <main className="fuel-page" aria-label="タント燃費計算">
            <section className="fuel-page-heading">
              <span>
                <small>TANTO / FUEL LOG</small>
                <h1>満タン法 燃費計算</h1>
              </span>
              <p>給油時の走行距離 ÷ 給油量で実燃費を記録します</p>
            </section>

            <section className="fuel-summary" aria-label="今月の燃費集計">
              <article className="fuel-summary-primary">
                <small>今月の平均燃費</small>
                <strong>{monthlyFuelEconomy === null ? "—" : monthlyFuelEconomy.toFixed(1)}</strong>
                <em>km/L</em>
              </article>
              <article>
                <small>今月の合計給油量</small>
                <strong>{monthlyFuelLiters.toFixed(1)}</strong>
                <em>L</em>
              </article>
              <article>
                <small>今月の合計金額</small>
                <strong>{Math.round(monthlyFuelAmount).toLocaleString("ja-JP")}</strong>
                <em>円</em>
              </article>
              <article>
                <small>今月の走行距離</small>
                <strong>{monthlyFuelDistance.toFixed(1)}</strong>
                <em>km</em>
              </article>
            </section>

            <div className="fuel-workspace">
              <section className="fuel-entry-card" aria-label="給油記録を入力">
                <header>
                  <span><small>NEW REFUEL</small><strong>給油データ入力</strong></span>
                  <b>{currentMonthFuelEntries.length} RECORDS / {currentMonthKey}</b>
                </header>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    recordFuelEntry();
                  }}
                >
                  <label>
                    <span>給油日</span>
                    <input
                      type="date"
                      value={fuelDraft.date}
                      onChange={(event) =>
                        setFuelDraft({ ...fuelDraft, date: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>給油量</span>
                    <div><input
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      value={fuelDraft.liters}
                      onChange={(event) =>
                        setFuelDraft({ ...fuelDraft, liters: event.target.value })
                      }
                    /><em>L</em></div>
                  </label>
                  <label>
                    <span>走行距離</span>
                    <div><input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.1"
                      placeholder="0.0"
                      value={fuelDraft.distanceKm}
                      onChange={(event) =>
                        setFuelDraft({ ...fuelDraft, distanceKm: event.target.value })
                      }
                    /><em>km</em></div>
                  </label>
                  <label>
                    <span>給油金額</span>
                    <div><input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={fuelDraft.amountYen}
                      onChange={(event) =>
                        setFuelDraft({ ...fuelDraft, amountYen: event.target.value })
                      }
                    /><em>円</em></div>
                  </label>
                  <div className="fuel-live-result" aria-live="polite">
                    <span><small>今回の燃費</small><strong>{currentFuelEconomy === null ? "—" : currentFuelEconomy.toFixed(1)}</strong><em>km/L</em></span>
                    <button type="submit" disabled={!fuelDraftIsValid}>記録する</button>
                  </div>
                </form>
              </section>

              <section className="fuel-history-card" aria-label="給油履歴">
                <header>
                  <span><small>FUEL HISTORY</small><strong>給油履歴</strong></span>
                  <b>{fuelEntries.length} TOTAL</b>
                </header>
                <div className="fuel-history-table">
                  {sortedFuelEntries.length === 0 ? (
                    <p>給油データはまだありません</p>
                  ) : (
                    sortedFuelEntries.map((entry) => (
                      <article key={entry.id}>
                        <time>{entry.date.replaceAll("-", ".")}</time>
                        <span><small>燃費</small><strong>{(entry.distanceKm / entry.liters).toFixed(1)}</strong><em>km/L</em></span>
                        <span><small>給油量</small><strong>{entry.liters.toFixed(1)}</strong><em>L</em></span>
                        <span><small>走行</small><strong>{entry.distanceKm.toFixed(1)}</strong><em>km</em></span>
                        <span><small>金額</small><strong>{Math.round(entry.amountYen).toLocaleString("ja-JP")}</strong><em>円</em></span>
                      </article>
                    ))
                  )}
                </div>
              </section>
            </div>
          </main>
        ) : showMusic ? (
          <main className="music-page" aria-label="ミュージックライブラリー">
            <header className="music-page-heading">
              <span>
                <small>Z CAR / MUSIC LIBRARY</small>
                <h1>MUSIC</h1>
              </span>
              <nav className="music-page-switcher" aria-label="ミュージックページ切替">
                <small>PAGE</small>
                <button
                  type="button"
                  className={musicPage === 1 ? "active" : undefined}
                  onClick={() => setMusicPage(1)}
                  aria-current={musicPage === 1 ? "page" : undefined}
                >1</button>
              </nav>
            </header>
            <section className="music-card-grid" aria-label={`ミュージックコンテンツ ${musicPage}ページ目`}>
              <article className="music-content-card music-youtube-card">
                <header><span><i aria-hidden="true" />YOUTUBE</span><b>01</b></header>
                <iframe
                  src={`https://www.youtube.com/embed/videoseries?list=${HOME_YOUTUBE_PLAYLIST_ID}&playsinline=1&rel=0&loop=1`}
                  title="最近の洋楽ポップヒット プレイリスト"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </article>
              {MUSIC_PLAYLISTS.map((playlist) => (
                  <article
                    className="music-content-card music-youtube-card"
                    key={playlist.number}
                  >
                    <header>
                      <span><i aria-hidden="true" />{playlist.label}</span>
                      <b>{String(playlist.number).padStart(2, "0")}</b>
                    </header>
                    <iframe
                      src={`https://www.youtube.com/embed/videoseries?list=${playlist.playlistId}&playsinline=1&rel=0&loop=1`}
                      title={playlist.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      referrerPolicy="strict-origin-when-cross-origin"
                    />
                  </article>
              ))}
            </section>
          </main>
        ) : (
        <main className="dashboard">
          <section className="left-panel map-only-panel" aria-label="現在地マップ">
            <div className="map-frame map-only-frame">
              <div className="map-status-bar" aria-label="ドライブステータス">
                <time>{clock}</time>
                <span className={locationStatus === "ready" ? "ready" : "searching"}>
                  <i aria-hidden="true" />
                  {locationStatus === "ready" ? "GPS LOCK" : locationStatus === "locating" ? "GPS SEARCH" : "GPS OFF"}
                </span>
                <span>
                  {greenHeading === null
                    ? "HDG ---°"
                    : `HDG ${Math.round(greenHeading).toString().padStart(3, "0")}°`}
                </span>
                <span className={isOnline ? "online" : "offline"}>
                  <i aria-hidden="true" />
                  {isOnline ? "ONLINE" : "OFFLINE"}
                </span>
              </div>
              <nav className="map-shortcuts" aria-label="Googleマップ目的地ショートカット">
                {MAP_SHORTCUTS.map((shortcut) => (
                  <button
                    key={shortcut.number}
                    type="button"
                    disabled={!shortcut.destination}
                    onClick={() => shortcut.destination && openMap(shortcut.destination)}
                    aria-label={
                      shortcut.destination
                        ? `${shortcut.number}番 ${shortcut.label}へのナビを開始`
                        : `${shortcut.number}番 未登録`
                    }
                  >
                    <b>{shortcut.number}</b>
                  </button>
                ))}
              </nav>
              <div
                ref={liveMapElementRef}
                className="live-map-canvas"
                aria-label="現在地を追従するライブマップ"
              />
              <nav className="map-obd-bar map-commute-bar" aria-label="出勤・退勤ナビ">
                <button type="button" onClick={() => openMap(MAP_SHORTCUTS[0].destination)}>
                  <small>WORK ROUTE</small>
                  <strong>出勤</strong>
                  <em>店舗へ</em>
                </button>
                <button type="button" onClick={() => openMap(MAP_SHORTCUTS[1].destination)}>
                  <small>HOME ROUTE</small>
                  <strong>退勤</strong>
                  <em>自宅へ</em>
                </button>
              </nav>
            </div>
          </section>

          <section className="right-panel" aria-label="映像とシフトモニター">
            <article className={`home-weather-card ${weatherStatus}`} aria-live="polite">
              <div className="home-weather-icon" aria-hidden="true">
                {weather ? (
                  <svg viewBox="0 0 48 48">
                    <WeatherGlyph
                      code={weather.code}
                      isDay={weather.isDay}
                      x={24}
                      y={24}
                      size={42}
                    />
                  </svg>
                ) : (
                  <span>—</span>
                )}
              </div>
              <div className="home-weather-copy">
                <small>TODAY WEATHER</small>
                <strong>
                  {weather
                    ? weatherLabel(weather.code)
                    : weatherStatus === "error"
                      ? "WEATHER UNAVAILABLE"
                      : "ACQUIRING WEATHER"}
                </strong>
              </div>
              <div className="home-weather-temperature">
                <span>
                  <strong>{weather ? Math.round(weather.temperature) : "—"}</strong>
                  <em>°C</em>
                </span>
                <small>現在地</small>
              </div>
            </article>
            <article
              className="home-random-youtube music-youtube-card"
              aria-label={`${homePlaylist.title} YouTubeプレイヤー`}
            >
              <header>
                <span><i aria-hidden="true" />{homePlaylist.label}</span>
                <b>RANDOM {String(homePlaylist.number).padStart(2, "0")}</b>
              </header>
              <iframe
                key={homePlaylist.playlistId}
                src={`https://www.youtube.com/embed/videoseries?list=${homePlaylist.playlistId}&playsinline=1&rel=0&loop=1`}
                title={homePlaylist.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </article>
            <div className="shift-monitor" aria-live="polite">
              <header>
                <span className="schedule-mini-icon" aria-hidden="true">Z</span>
                <span>
                  <small>Z PORTAL SHIFT</small>
                  <strong>{shiftFeed?.displayName || "七塚 俊介"}</strong>
                </span>
                <em>{nextShift ? "確定シフト" : "TODAY"}</em>
              </header>
              <div className={`today-shift ${monitorTone}`}>
                <span>
                  <small>TODAY</small>
                  <strong>{monitorMessage}</strong>
                </span>
                <time>{monitorValue}</time>
              </div>
              <div className="week-shifts" aria-label="今日から1週間の勤務予定">
                {weekShifts.map((item, index) => (
                  <div className={item.shift ? "working" : "off"} key={item.dateKey}>
                    <span>
                      <small>{index === 0 ? "今日" : item.weekday}</small>
                      <strong>{item.day}</strong>
                    </span>
                    <em>{item.shift ? item.shift.startTime : "休"}</em>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
        )}

        <footer>
          安全運転を最優先してください
        </footer>
      </div>
      )}

      <dialog ref={homeDialog}>
        <div className="dialog-card">
          <h2>本日の勤務を終了します</h2>
          <p>退勤時刻 <b>{clock}</b></p>
          <div className="two-actions">
            <button onClick={() => homeDialog.current?.close()}>
              キャンセル
            </button>
            <button className="confirm" onClick={completeCheckout}>
              退勤してナビを開始
            </button>
          </div>
        </div>
      </dialog>

      <dialog ref={themeDialog} className="theme-dialog-shell">
        <div className="dialog-card meter-theme-dialog">
          <header>
            <span>
              <small>FULLSCREEN DISPLAY</small>
              <h2>METER THEME</h2>
            </span>
            <button
              type="button"
              onClick={() => themeDialog.current?.close()}
              aria-label="Close theme settings"
            >
              CLOSE
            </button>
          </header>
          <div className="meter-theme-options">
            <button
              type="button"
              className={settings.meterTheme === "green" ? "selected" : undefined}
              onClick={() => {
                setSettings({ ...settings, meterTheme: "green" });
                themeDialog.current?.close();
              }}
            >
              <i className="theme-preview green" aria-hidden="true">
                <span className="turquoise-label">TURQUOISE BLUE</span>
              </i>
              <span><b>TURQUOISE BLUE</b><small>TURQUOISE COCKPIT THEME</small></span>
              <em>{settings.meterTheme === "green" ? "ACTIVE" : "SELECT"}</em>
            </button>
            <button
              type="button"
              className={settings.meterTheme === "red-triple" ? "selected red" : "red"}
              onClick={() => {
                setSettings({ ...settings, meterTheme: "red-triple" });
                themeDialog.current?.close();
              }}
            >
              <i className="theme-preview red" aria-hidden="true">
                <span>RED</span>
              </i>
              <span><b>RED</b><small>RED COCKPIT THEME</small></span>
              <em>{settings.meterTheme === "red-triple" ? "ACTIVE" : "SELECT"}</em>
            </button>
          </div>
        </div>
      </dialog>

      <dialog ref={settingsDialog}>
        <div className="dialog-card settings-card">
          <h2>Z CAR 設定</h2>
          <label>
            店舗名
            <input
              value={draft.storeName}
              onChange={(event) =>
                setDraft({ ...draft, storeName: event.target.value })
              }
            />
          </label>
          <label>
            店舗住所 / 検索語
            <input
              value={draft.storeDest}
              onChange={(event) =>
                setDraft({ ...draft, storeDest: event.target.value })
              }
            />
          </label>
          <label>
            勤務開始
            <input
              type="time"
              value={draft.start}
              onChange={(event) =>
                setDraft({ ...draft, start: event.target.value })
              }
            />
          </label>
          <label>
            自宅住所 / 検索語
            <input
              value={draft.homeDest}
              onChange={(event) =>
                setDraft({ ...draft, homeDest: event.target.value })
              }
            />
          </label>
          <label>
            Google Routes APIキー
            <input
              type="password"
              autoComplete="off"
              value={draft.googleRoutesApiKey}
              placeholder="Google Cloudで発行したキーを入力"
              onChange={(event) =>
                setDraft({ ...draft, googleRoutesApiKey: event.target.value })
              }
            />
            <small className="settings-hint">
              この端末内だけに保存され、到着予定時間の取得に使用します。
            </small>
          </label>
          <label>
            車両ID
            <input
              value={draft.carId}
              onChange={(event) =>
                setDraft({ ...draft, carId: event.target.value })
              }
            />
          </label>
          <div className="two-actions">
            <button onClick={() => settingsDialog.current?.close()}>
              キャンセル
            </button>
            <button
              className="confirm"
              onClick={() => {
                setSettings({
                  ...draft,
                  storeName: draft.storeName || defaults.storeName,
                  storeDest:
                    draft.storeDest || draft.storeName || defaults.storeDest,
                  start: draft.start || defaults.start,
                  carId: draft.carId || defaults.carId,
                });
                settingsDialog.current?.close();
              }}
            >
              保存
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
