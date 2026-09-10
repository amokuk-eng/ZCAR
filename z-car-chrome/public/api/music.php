<?php
/**
 * Z CAR 音源置き場 (エックスサーバー上の PHP で動きます)
 *
 * スマホから音楽ファイルを預けて、車の画面で鳴らすための小さな置き場です。
 * 設定同期と同じ合言葉(同期キー)を知っている端末だけが読み書きできます。
 *
 * 使い方:
 *   一覧   : POST (JSON) {"key":"合言葉","action":"list"}
 *            -> {"ok":true,"tracks":[{"id":..,"title":..,"url":..,"size":..}],"totalBytes":..}
 *   置く   : POST (multipart) key=合言葉 & file=音楽ファイル (複数可: file[])
 *            -> {"ok":true,"tracks":[...]}
 *   消す   : POST (JSON) {"key":"合言葉","action":"delete","id":"..."}
 *            -> {"ok":true,"tracks":[...]}
 *
 * 置き場所は media/<合言葉のSHA-256>/ です。合言葉を知らなければ場所が
 * 分からないので、他の人からは辿れません。ただし音は車のブラウザが直接
 * 読みに行くため、この中だけはアクセス禁止にできません(URLを知られない
 * ことで守ります)。一覧のファイル名も推測できない文字列にしています。
 */

declare(strict_types=1);

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const MIN_KEY_LENGTH = 8;
const MAX_KEY_LENGTH = 128;
/** 1曲あたりの上限 (25MB)。 */
const MAX_FILE_BYTES = 26214400;
/** 置き場全体の上限 (600MB)。 */
const MAX_TOTAL_BYTES = 629145600;
/** 曲数の上限。 */
const MAX_TRACKS = 200;
const MAX_TITLE_LENGTH = 80;
/** プレイリストの上限。 */
const MAX_PLAYLISTS = 12;
const MAX_PLAYLIST_NAME = 24;

/** 受け付ける拡張子と、返すときの Content-Type。 */
const ALLOWED_TYPES = [
    'mp3'  => 'audio/mpeg',
    'm4a'  => 'audio/mp4',
    'aac'  => 'audio/aac',
    'wav'  => 'audio/wav',
    'ogg'  => 'audio/ogg',
    'oga'  => 'audio/ogg',
    'opus' => 'audio/ogg',
    'flac' => 'audio/flac',
];

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(int $status, string $message): void
{
    respond(['ok' => false, 'error' => $message], $status);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail(405, 'POST only');
}

$isMultipart = str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data');

if ($isMultipart) {
    $key = is_string($_POST['key'] ?? null) ? trim($_POST['key']) : '';
    $action = 'upload';
    $trackId = '';
    $fromKey = '';
} else {
    $raw = file_get_contents('php://input');
    $body = json_decode((string) $raw, true);
    if (!is_array($body)) {
        fail(400, 'invalid json');
    }
    $key = is_string($body['key'] ?? null) ? trim($body['key']) : '';
    $action = is_string($body['action'] ?? null) ? $body['action'] : 'list';
    $trackId = is_string($body['id'] ?? null) ? $body['id'] : '';
    $fromKey = is_string($body['fromKey'] ?? null) ? trim($body['fromKey']) : '';
}

$keyLength = strlen($key);
if ($keyLength < MIN_KEY_LENGTH || $keyLength > MAX_KEY_LENGTH) {
    fail(400, 'invalid key');
}

$folder = hash('sha256', $key);
$dir = __DIR__ . '/media/' . $folder;
if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
    fail(500, 'storage unavailable');
}

// 一覧表示だけは塞いでおく(URLを知らない人にファイル名を見せない)。
$guard = __DIR__ . '/media/.htaccess';
if (!file_exists($guard)) {
    @file_put_contents($guard, "Options -Indexes\n");
}

/** 置き場の中身を読み、曲の一覧にして返す。 */
function readTracks(string $dir, string $folder): array
{
    $tracks = [];
    foreach (glob($dir . '/*.json') ?: [] as $metaFile) {
        $meta = json_decode((string) file_get_contents($metaFile), true);
        if (!is_array($meta) || !isset($meta['id'], $meta['file'])) {
            continue;
        }
        $audio = $dir . '/' . basename((string) $meta['file']);
        if (!is_file($audio)) {
            continue;
        }
        $tracks[] = [
            'id' => (string) $meta['id'],
            'title' => (string) ($meta['title'] ?? 'TRACK'),
            'url' => 'media/' . $folder . '/' . basename((string) $meta['file']),
            'size' => filesize($audio) ?: 0,
            'addedAt' => (int) ($meta['addedAt'] ?? 0),
        ];
    }
    usort($tracks, static fn(array $a, array $b) => [$a['title'], $a['id']] <=> [$b['title'], $b['id']]);
    return $tracks;
}

function totalBytes(array $tracks): int
{
    return array_sum(array_map(static fn(array $t) => (int) $t['size'], $tracks));
}

/** プレイリストを読む。壊れていれば空として扱う。 */
function readPlaylists(string $dir): array
{
    $file = $dir . '/playlists.json';
    if (!is_file($file)) {
        return ['playlists' => [], 'activePlaylistId' => ''];
    }
    $stored = json_decode((string) file_get_contents($file), true);
    if (!is_array($stored)) {
        return ['playlists' => [], 'activePlaylistId' => ''];
    }
    return [
        'playlists' => is_array($stored['playlists'] ?? null) ? $stored['playlists'] : [],
        'activePlaylistId' => is_string($stored['activePlaylistId'] ?? null)
            ? $stored['activePlaylistId']
            : '',
    ];
}

/** 一覧の返し方はどの操作でも同じ形にそろえる。 */
function respondWithLibrary(string $dir, string $folder): void
{
    $tracks = readTracks($dir, $folder);
    $lists = readPlaylists($dir);
    respond([
        'ok' => true,
        'tracks' => $tracks,
        'totalBytes' => totalBytes($tracks),
        'playlists' => $lists['playlists'],
        'activePlaylistId' => $lists['activePlaylistId'],
    ]);
}

$tracks = readTracks($dir, $folder);

// --- 一覧 ---
if ($action === 'list') {
    respondWithLibrary($dir, $folder);
}

// --- プレイリストの保存(まるごと置き換え) ---
if ($action === 'playlists') {
    $incomingLists = is_array($body['playlists'] ?? null) ? $body['playlists'] : [];
    $known = array_column($tracks, 'id');
    $clean = [];
    foreach ($incomingLists as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $id = isset($entry['id']) && is_string($entry['id']) ? $entry['id'] : '';
        if (!preg_match('/^[a-f0-9]{8,64}$/', $id)) {
            continue;
        }
        $name = isset($entry['name']) && is_string($entry['name']) ? trim($entry['name']) : '';
        $name = mb_substr($name !== '' ? $name : 'PLAYLIST', 0, MAX_PLAYLIST_NAME, 'UTF-8');
        $trackIds = [];
        foreach (is_array($entry['trackIds'] ?? null) ? $entry['trackIds'] : [] as $tid) {
            // 置き場に無いIDは捨てる(消した曲が残り続けないように)。
            if (is_string($tid) && in_array($tid, $known, true) && !in_array($tid, $trackIds, true)) {
                $trackIds[] = $tid;
            }
            if (count($trackIds) >= MAX_TRACKS) {
                break;
            }
        }
        $clean[] = ['id' => $id, 'name' => $name, 'trackIds' => $trackIds];
        if (count($clean) >= MAX_PLAYLISTS) {
            break;
        }
    }
    $active = is_string($body['activePlaylistId'] ?? null) ? $body['activePlaylistId'] : '';
    if ($active !== '' && !in_array($active, array_column($clean, 'id'), true)) {
        $active = '';
    }
    @file_put_contents(
        $dir . '/playlists.json',
        json_encode(
            ['playlists' => $clean, 'activePlaylistId' => $active],
            JSON_UNESCAPED_UNICODE,
        ),
        LOCK_EX,
    );
    respondWithLibrary($dir, $folder);
}

// --- 引っ越し(車とつなぐ前にスマホへ入れた曲を、車の置き場へ移す) ---
if ($action === 'adopt') {
    $fromLength = strlen($fromKey);
    if ($fromLength < MIN_KEY_LENGTH || $fromLength > MAX_KEY_LENGTH || $fromKey === $key) {
        // 移す元が無い(または同じ)なら、そのまま今の中身を返す。
        respondWithLibrary($dir, $folder);
    }
    $fromFolder = hash('sha256', $fromKey);
    $fromDir = __DIR__ . '/media/' . $fromFolder;
    if (is_dir($fromDir)) {
        $moved = 0;
        foreach (glob($fromDir . '/*.json') ?: [] as $metaFile) {
            if (basename($metaFile) === 'playlists.json') {
                continue;
            }
            $meta = json_decode((string) file_get_contents($metaFile), true);
            if (!is_array($meta) || !isset($meta['file'])) {
                continue;
            }
            $audio = $fromDir . '/' . basename((string) $meta['file']);
            if (!is_file($audio) || count($tracks) + $moved >= MAX_TRACKS) {
                continue;
            }
            @rename($audio, $dir . '/' . basename((string) $meta['file']));
            @rename($metaFile, $dir . '/' . basename($metaFile));
            $moved++;
        }
        // 移す先にプレイリストが無ければ、こちらも引き継ぐ。
        if (is_file($fromDir . '/playlists.json') && !is_file($dir . '/playlists.json')) {
            @rename($fromDir . '/playlists.json', $dir . '/playlists.json');
        }
        @unlink($fromDir . '/playlists.json');
        @rmdir($fromDir);
    }
    respondWithLibrary($dir, $folder);
}

// --- 削除 ---
if ($action === 'delete') {
    if ($trackId === '' || !preg_match('/^[a-f0-9]{16,64}$/', $trackId)) {
        fail(400, 'invalid id');
    }
    foreach ($tracks as $track) {
        if ($track['id'] !== $trackId) {
            continue;
        }
        @unlink($dir . '/' . basename($track['url']));
        @unlink($dir . '/' . $trackId . '.json');
    }
    respondWithLibrary($dir, $folder);
}

// --- 追加 ---
if ($action !== 'upload' || empty($_FILES['file'])) {
    fail(400, 'nothing to do');
}

// 1件でも複数でも同じ形にそろえる。
$incoming = $_FILES['file'];
$names = is_array($incoming['name']) ? $incoming['name'] : [$incoming['name']];
$tmps = is_array($incoming['tmp_name']) ? $incoming['tmp_name'] : [$incoming['tmp_name']];
$errors = is_array($incoming['error']) ? $incoming['error'] : [$incoming['error']];
$sizes = is_array($incoming['size']) ? $incoming['size'] : [$incoming['size']];

$used = totalBytes($tracks);
$count = count($tracks);
$saved = 0;
$skipped = [];

foreach ($names as $i => $name) {
    if (($errors[$i] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($tmps[$i] ?? '')) {
        $skipped[] = ['name' => (string) $name, 'reason' => 'アップロードに失敗しました'];
        continue;
    }
    $size = (int) ($sizes[$i] ?? 0);
    $ext = strtolower(pathinfo((string) $name, PATHINFO_EXTENSION));
    if (!isset(ALLOWED_TYPES[$ext])) {
        $skipped[] = ['name' => (string) $name, 'reason' => '対応していない形式です'];
        continue;
    }
    if ($size <= 0 || $size > MAX_FILE_BYTES) {
        $skipped[] = ['name' => (string) $name, 'reason' => '1曲あたりの上限を超えています'];
        continue;
    }
    if ($count >= MAX_TRACKS) {
        $skipped[] = ['name' => (string) $name, 'reason' => '曲数の上限に達しました'];
        continue;
    }
    if ($used + $size > MAX_TOTAL_BYTES) {
        $skipped[] = ['name' => (string) $name, 'reason' => '置き場の空きが足りません'];
        continue;
    }

    $id = bin2hex(random_bytes(16));
    $stored = $id . '.' . $ext;
    if (!@move_uploaded_file($tmps[$i], $dir . '/' . $stored)) {
        $skipped[] = ['name' => (string) $name, 'reason' => '保存できませんでした'];
        continue;
    }
    @chmod($dir . '/' . $stored, 0644);

    $title = pathinfo((string) $name, PATHINFO_FILENAME);
    if ($title === '' || mb_strlen($title, 'UTF-8') > MAX_TITLE_LENGTH) {
        $title = mb_substr($title !== '' ? $title : 'TRACK', 0, MAX_TITLE_LENGTH, 'UTF-8');
    }
    @file_put_contents(
        $dir . '/' . $id . '.json',
        json_encode(
            ['id' => $id, 'file' => $stored, 'title' => $title, 'addedAt' => (int) round(microtime(true) * 1000)],
            JSON_UNESCAPED_UNICODE,
        ),
    );

    $used += $size;
    $count++;
    $saved++;
}

$tracks = readTracks($dir, $folder);
$lists = readPlaylists($dir);
respond([
    'ok' => true,
    'saved' => $saved,
    'skipped' => $skipped,
    'tracks' => $tracks,
    'totalBytes' => totalBytes($tracks),
    'playlists' => $lists['playlists'],
    'activePlaylistId' => $lists['activePlaylistId'],
]);
