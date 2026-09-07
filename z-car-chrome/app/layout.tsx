import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PHONE_MAX_EDGE, PHONE_SETUP_SKIP_KEY } from "./settings-store";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * スマホから開いたときに設定ページへ送るための先読みスクリプト。
 * React の読み込みを待つとダッシュボードが一瞬映ってしまうので、
 * HTML を読んでいる途中(まだ何も描画されていない時点)で判定する。
 */
const phoneRedirectScript = `(function(){try{
var b=${JSON.stringify(basePath)};
if(location.pathname.indexOf(b+"/settings")===0)return;
if(/[?&]app(=|&|$)/.test(location.search)){try{sessionStorage.setItem(${JSON.stringify(PHONE_SETUP_SKIP_KEY)},"1")}catch(e){}return}
try{if(sessionStorage.getItem(${JSON.stringify(PHONE_SETUP_SKIP_KEY)})==="1")return}catch(e){}
if(Math.min(window.innerWidth,window.innerHeight)>=${PHONE_MAX_EDGE})return;
location.replace(b+"/settings/")
}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Z CAR",
  description: "PORMIDO G10向け Zポータル・カーナビホーム",
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    icon: `${basePath}/favicon.svg`,
    shortcut: `${basePath}/favicon.svg`,
  },
  openGraph: {
    title: "Z CAR",
    description: "Z PORTAL | CAR",
    images: [`${basePath}/og.png`],
  },
  twitter: {
    card: "summary_large_image",
    title: "Z CAR",
    description: "Z PORTAL | CAR",
    images: [`${basePath}/og.png`],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0b0d10",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <script dangerouslySetInnerHTML={{ __html: phoneRedirectScript }} />
        {children}
      </body>
    </html>
  );
}
