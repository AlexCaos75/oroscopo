<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);
date_default_timezone_set("Europe/Rome");

header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");
header("Expires: 0");
header("Content-Type: application/json; charset=utf-8");

// ==========================
// 🔒 SICUREZZA BASE (referrer + header segreto)
// ==========================
$ALLOWED_HOSTS = [
  "alexcaos.altervista.org",
  "alexcaos75.github.io"
];

$SECRET = "LUNA_SECRET_2026"; // deve combaciare con JS
$ref = $_SERVER["HTTP_REFERER"] ?? "";
$hdr = $_SERVER["HTTP_X_LUNA_SECRET"] ?? "";

// Helper: controlla se referrer contiene uno degli host consentiti
function isAllowedReferrer($ref, $hosts) {
  if ($ref === "") return true; // ✅ tollerante (evita 403 a caso)
  foreach ($hosts as $h) {
    if (stripos($ref, $h) !== false) return true;
  }
  return false;
}

if (!isAllowedReferrer($ref, $ALLOWED_HOSTS)) {
  http_response_code(403);
  echo json_encode(["ok"=>false,"error"=>"Forbidden (bad referer)"], JSON_UNESCAPED_UNICODE);
  exit;
}

if ($hdr !== $SECRET) {
  http_response_code(403);
  echo json_encode(["ok"=>false,"error"=>"Forbidden (bad secret)"], JSON_UNESCAPED_UNICODE);
  exit;
}

// ==========================
// 🧼 SANITIZE ASCII (no caratteri strani)
// ==========================
function sanitizePlainASCII($s) {
  $s = (string)($s ?? "");

  // sostituzioni "smart"
  $s = str_replace(["“","”"], '"', $s);
  $s = str_replace(["‘","’"], "'", $s);

  // rimuove accenti (iconv)
  $t = @iconv("UTF-8", "ASCII//TRANSLIT//IGNORE", $s);
  if ($t !== false) $s = $t;

  // lascia solo ASCII stampabile + newline/tab
  $s = preg_replace('/[^\x09\x0A\x0D\x20-\x7E]/', ' ', $s);

  // pulizia spazi e doppioni
  $s = preg_replace('/\?{2,}/', '?', $s);
  $s = preg_replace('/"{2,}/', '"', $s);
  $s = preg_replace("/'{2,}/", "'", $s);
  $s = preg_replace('/[ \t]+/', ' ', $s);
  $s = preg_replace("/\n{3,}/", "\n\n", $s);

  return trim($s);
}

// ==========================
// 🔥 FIREBASE
// ==========================
$today = date("Y-m-d");
$base  = "https://ruota-lunare-2026-default-rtdb.europe-west1.firebasedatabase.app/ruota-lunare";

// Se le rules bloccano scrittura anonima, metti qui un token valido
define("FIREBASE_AUTH", ""); // "" = nessun auth

function withAuth(string $url): string {
  if (FIREBASE_AUTH === "") return $url;
  $sep = (strpos($url, "?") === false) ? "?" : "&";
  return $url . $sep . "auth=" . urlencode(FIREBASE_AUTH);
}

$dailyUrl      = withAuth($base . "/oroscopiDaily/" . $today . ".json");
$currentObjUrl = withAuth($base . "/oroscopiCurrent.json");
$currentStrUrl = withAuth($base . "/oroscopiCurrentDate.json");

// ==========================
// 🧠 COOLDOWN (anti-spam server)
// ==========================
$cooldownSec = 120;
$lockFile = __DIR__ . "/_update_lock.json";

$now = time();
$last = 0;
if (file_exists($lockFile)) {
  $j = json_decode(@file_get_contents($lockFile), true);
  if (is_array($j) && isset($j["last"])) $last = (int)$j["last"];
}

if (($now - $last) < $cooldownSec) {
  echo json_encode([
    "ok" => true,
    "skipped" => true,
    "reason" => "cooldown",
    "day" => $today,
    "seconds_left" => $cooldownSec - ($now - $last)
  ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
  exit;
}
file_put_contents($lockFile, json_encode(["last"=>$now]));

// ==========================
// 🔮 PAYLOAD (ASCII safe + updatedAt ms)
// ==========================
$updatedAtMs = (int)round(microtime(true) * 1000);

$data = [
  "Ariete"     => sanitizePlainASCII("Giornata di energia e nuove sfide."),
  "Toro"       => sanitizePlainASCII("Stabilita e riflessioni profonde."),
  "Gemelli"    => sanitizePlainASCII("Comunicazione al centro di tutto."),
  "Cancro"     => sanitizePlainASCII("Emozioni intense, segui listinto."),
  "Leone"      => sanitizePlainASCII("Brilla senza paura."),
  "Vergine"    => sanitizePlainASCII("Ordine e precisione premiano."),
  "Bilancia"   => sanitizePlainASCII("Equilibrio tra cuore e mente."),
  "Scorpione"  => sanitizePlainASCII("Trasformazioni in arrivo."),
  "Sagittario" => sanitizePlainASCII("Desiderio di avventura."),
  "Capricorno" => sanitizePlainASCII("Determinazione e risultati."),
  "Acquario"   => sanitizePlainASCII("Idee fuori dagli schemi."),
  "Pesci"      => sanitizePlainASCII("Intuizioni forti."),
  "updatedAt"  => $updatedAtMs
];

$currentPayload = [
  "date" => $today,
  "updatedAt" => $updatedAtMs
];

// ==========================
// 🌐 PUT JSON (cURL -> fallback stream)
// ==========================
function putJsonCurl(string $url, string $json): array {
  if (!function_exists("curl_init")) {
    return [0, "", "curl_not_available"];
  }

  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST => "PUT",
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
      "Content-Type: application/json",
      "Content-Length: " . strlen($json),
      "User-Agent: OROSCOPO-UPDATER/1.1"
    ],
    CURLOPT_POSTFIELDS => $json,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 20,
  ]);

  $res  = curl_exec($ch);
  $err  = curl_error($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if ($res === false) return [0, "", "curl_error: " . $err];
  return [$code, (string)$res, ""];
}

function putJsonStream(string $url, string $json): array {
  $opts = [
    "http" => [
      "method"  => "PUT",
      "header"  => "Content-Type: application/json\r\nUser-Agent: OROSCOPO-UPDATER/1.1\r\n",
      "content" => $json,
      "timeout" => 20
    ]
  ];

  $ctx = stream_context_create($opts);
  $res = @file_get_contents($url, false, $ctx);

  $statusLine = $http_response_header[0] ?? "";
  preg_match('#HTTP/\d\.\d\s+(\d+)#', $statusLine, $m);
  $code = isset($m[1]) ? (int)$m[1] : 0;

  if ($res === false) {
    $e = error_get_last();
    return [0, "", "stream_error: " . ($e["message"] ?? "unknown")];
  }
  return [$code, (string)$res, ""];
}

function putJsonRobust(string $url, $payload): array {
  $json = json_encode($payload, JSON_UNESCAPED_UNICODE);

  [$code, $res, $err] = putJsonCurl($url, $json);
  if ($code > 0) return [$code, $res, "curl_ok"];

  [$code2, $res2, $err2] = putJsonStream($url, $json);
  if ($code2 > 0) return [$code2, $res2, "stream_ok"];

  $why = $err ?: $err2 ?: "unknown";
  return [0, "", $why];
}

// ==========================
// 🚀 UPDATE
// ==========================
[$cDaily, $rDaily, $mDaily]    = putJsonRobust($dailyUrl, $data);
[$cCurObj, $rCurObj, $mCurObj] = putJsonRobust($currentObjUrl, $currentPayload);
[$cCurStr, $rCurStr, $mCurStr] = putJsonRobust($currentStrUrl, $today);

file_put_contents(
  __DIR__ . "/update_log.txt",
  date("c") . " daily=$cDaily($mDaily) curObj=$cCurObj($mCurObj) curStr=$cCurStr($mCurStr)\n",
  FILE_APPEND
);

echo json_encode([
  "ok" => true,
  "day" => $today,
  "daily" => ["http"=>$cDaily, "mode"=>$mDaily],
  "currentObj" => ["http"=>$cCurObj, "mode"=>$mCurObj],
  "currentStr" => ["http"=>$cCurStr, "mode"=>$mCurStr],
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
