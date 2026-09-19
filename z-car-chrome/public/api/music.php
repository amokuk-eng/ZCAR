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
 *   合言葉を渡す:
 *     出す : POST (JSON) {"key":"合言葉","action":"linkcode"}
 *            -> {"ok":true,"code":"XXXXXXXX","expiresIn":600}
 *     使う : POST (JSON) {"action":"linkclaim","code":"XXXXXXXX"}
 *            -> {"ok":true,"key":"合言葉"}
 *     パソコンにカメラが無くても、短い文字列を打つだけで車とつなげるため。
 *     コードは10分で切れ、1回使うと消える。総当たりを防ぐため、外れた
 *     回数も数えて制限する。
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
/** 置き場全体の上限 (2GB)。 */
const MAX_TOTAL_BYTES = 2147483648;
/** 曲数の上限。 */
const MAX_TRACKS = 500;
const MAX_TITLE_LENGTH = 80;
/** プレイリストの上限。 */
const MAX_PLAYLISTS = 12;
const MAX_PLAYLIST_NAME = 24;
/** 合言葉を渡すコードの長さと寿命(秒)。 */
const LINK_CODE_LENGTH = 8;
const LINK_CODE_TTL = 600;
/** 読み違えやすい文字(0/O/1/I など)は使わない。 */
const LINK_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
/** 同じ相手からの外れ回数の上限と、その集計時間(秒)。 */
const LINK_FAIL_MAX = 20;
const LINK_FAIL_WINDOW = 3600;

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
    $linkCode = is_string($body['code'] ?? null) ? strtoupper(trim($body['code'])) : '';
}

/**
 * 合言葉の受け渡しに使う小さな置き場。中身は合言葉そのものなので、
 * 直接アクセスできないよう .htaccess で塞ぐ(音源と違い、外から読む必要が無い)。
 */
function linkDir(): string
{
    $dir = __DIR__ . '/links';
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        fail(500, 'storage unavailable');
    }
    $guard = $dir . '/.htaccess';
    if (!file_exists($guard)) {
        @file_put_contents(
            $guard,
            "Options -Indexes\nRequire all denied\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n",
        );
    }
    return $dir;
}

/**
 * コードの置き場所と鍵。ファイル名はコードそのものではなくハッシュにし、
 * 中身(合言葉)もコードから作った鍵で暗号化する。万一 .htaccess が効かず
 * ファイルを読まれても、コードを知らなければ合言葉は取り出せない。
 */
function linkFile(string $dir, string $code): string
{
    return $dir . '/' . hash('sha256', 'zcar-link-file|' . $code) . '.json';
}

function linkSecret(string $code): string
{
    return hash('sha256', 'zcar-link-secret|' . $code, true);
}

/** 合言葉を、コードを知っている人だけが戻せる形にする。 */
function sealKey(string $key, string $code): array
{
    if (!function_exists('openssl_encrypt')) {
        return ['plain' => $key];
    }
    $iv = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt($key, 'aes-256-gcm', linkSecret($code), OPENSSL_RAW_DATA, $iv, $tag);
    if ($cipher === false) {
        return ['plain' => $key];
    }
    return ['iv' => base64_encode($iv), 'tag' => base64_encode($tag), 'cipher' => base64_encode($cipher)];
}

/** 封を開ける。戻せなければ空文字。 */
function openKey(array $stored, string $code): string
{
    if (isset($stored['plain']) && is_string($stored['plain'])) {
        return $stored['plain'];
    }
    if (!function_exists('openssl_decrypt')) {
        return '';
    }
    foreach (['iv', 'tag', 'cipher'] as $field) {
        if (!isset($stored[$field]) || !is_string($stored[$field])) {
            return '';
        }
    }
    $plain = openssl_decrypt(
        (string) base64_decode($stored['cipher'], true),
        'aes-256-gcm',
        linkSecret($code),
        OPENSSL_RAW_DATA,
        (string) base64_decode($stored['iv'], true),
        (string) base64_decode($stored['tag'], true),
    );
    return is_string($plain) ? $plain : '';
}

/** 期限切れのコードを片付ける(置きっぱなしにしない)。 */
function sweepLinks(string $dir): void
{
    $now = time();
    foreach (glob($dir . '/*.json') ?: [] as $file) {
        // 外れ回数の記録は別の形なので、ここでは触らない。
        if (str_starts_with(basename($file), 'fail-')) {
            continue;
        }
        $stored = json_decode((string) @file_get_contents($file), true);
        if (!is_array($stored) || (int) ($stored['expiresAt'] ?? 0) <= $now) {
            @unlink($file);
        }
    }
    foreach (glob($dir . '/fail-*.json') ?: [] as $file) {
        $stored = json_decode((string) @file_get_contents($file), true);
        if (!is_array($stored) || (int) ($stored['until'] ?? 0) <= $now) {
            @unlink($file);
        }
    }
}

// --- コードを使う(合言葉をまだ持っていない端末から呼ばれる) ---
if (!$isMultipart && $action === 'linkclaim') {
    $dir = linkDir();
    sweepLinks($dir);

    // 総当たりを防ぐため、外した回数を相手ごとに数える。
    $who = hash('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? ''));
    $failFile = $dir . '/fail-' . $who . '.json';
    $fails = json_decode((string) @file_get_contents($failFile), true);
    $failCount = is_array($fails) && (int) ($fails['until'] ?? 0) > time()
        ? (int) ($fails['count'] ?? 0)
        : 0;
    if ($failCount >= LINK_FAIL_MAX) {
        fail(429, 'too many attempts');
    }

    $valid = preg_match('/^[' . LINK_CODE_ALPHABET . ']{' . LINK_CODE_LENGTH . '}$/', $linkCode) === 1;
    $file = $valid ? linkFile($dir, $linkCode) : '';
    $stored = $valid ? json_decode((string) @file_get_contents($file), true) : null;
    $opened = is_array($stored) ? openKey($stored, $linkCode) : '';
    if (!is_array($stored) || $opened === '' || (int) ($stored['expiresAt'] ?? 0) <= time()) {
        @file_put_contents(
            $failFile,
            json_encode(['count' => $failCount + 1, 'until' => time() + LINK_FAIL_WINDOW]),
            LOCK_EX,
        );
        fail(404, 'code not found');
    }
    // 1回使ったら消す。
    @unlink($file);
    respond(['ok' => true, 'key' => $opened]);
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

// --- コードを出す(合言葉を持っている端末から呼ぶ) ---
if ($action === 'linkcode') {
    $linkDir = linkDir();
    sweepLinks($linkDir);
    $alphabet = LINK_CODE_ALPHABET;
    $max = strlen($alphabet) - 1;
    for ($attempt = 0; $attempt < 20; $attempt++) {
        $code = '';
        for ($i = 0; $i < LINK_CODE_LENGTH; $i++) {
            $code .= $alphabet[random_int(0, $max)];
        }
        $file = linkFile($linkDir, $code);
        if (file_exists($file)) {
            continue;
        }
        $written = @file_put_contents(
            $file,
            json_encode(sealKey($key, $code) + ['expiresAt' => time() + LINK_CODE_TTL]),
            LOCK_EX,
        );
        if ($written === false) {
            fail(500, 'storage unavailable');
        }
        @chmod($file, 0600);
        respond(['ok' => true, 'code' => $code, 'expiresIn' => LINK_CODE_TTL]);
    }
    fail(500, 'could not make a code');
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
