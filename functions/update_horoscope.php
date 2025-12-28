<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);
date_default_timezone_set("Europe/Rome");

// ==========================
// 🔒 SICUREZZA (referrer + header segreto)
// ==========================
$ALLOWED_HOST = "alexcaos.altervista.org";
$SECRET = "LUNA_SECRET_2026"; // deve combaciare con JS

header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");
header("Expires: 0");
header("Content-Type: application/json; charset=utf-8");

$ref = $_SERVER["HTTP_REFERER"] ?? "";
$hdr = $_SERVER["HTTP_X_LUNA_SECRET"] ?? "";

if ($ref === "" || strpos($ref, $ALLOWED_HOST) === false) {
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
// 🔥 FIREBASE
// ==========================
$today = date("Y-m-d");
$base  = "https://ruota-lunare-2026-default-rtdb.europe-west1.firebasedatabase.app/ruota-lunare";

// Se le rules bloccano scrittura anonima, metti qui un token valido
const FIREBASE_AUTH = ""; // "" = nessun auth

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
// 🔮 PAYLOAD
// ==========================
$data = [
  "Ariete"    => "Giornata di energia e nuove sfide.",
  "Toro"      => "Stabilità e riflessioni profonde.",
  "Gemelli"   => "Comunicazione al centro di tutto.",
  "Cancro"    => "Emozioni intense, segui l’istinto.",
  "Leone"     => "Brilla senza paura.",
  "Vergine"   => "Ordine e precisione premiano.",
  "Bilancia"  => "Equilibrio tra cuore e mente.",
  "Scorpione" => "Trasformazioni in arrivo.",
  "Sagittario"=> "Desiderio di avventura.",
  "Capricorno"=> "Determinazione e risultati.",
  "Acquario"  => "Idee fuori dagli schemi.",
  "Pesci"     => "Intuizioni forti.",
  "updatedAt" => time()
];

$currentPayload = [
  "date" => $today,
  "updatedAt" => time()
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
      "User-Agent: OROSCOPO-UPDATER/1.0"
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
      "header"  => "Content-Type: application/json\r\n" .
                   "User-Agent: OROSCOPO-UPDATER/1.0\r\n",
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

  // 1) prova cURL
  [$code, $res, $err] = putJsonCurl($url, $json);
  if ($code > 0) return [$code, $res, "curl_ok"];
  // se fallisce, 2) fallback stream
  [$code2, $res2, $err2] = putJsonStream($url, $json);
  if ($code2 > 0) return [$code2, $res2, "stream_ok"];

  // se falliscono entrambi, ritorna l'errore più utile
  $why = $err ?: $err2 ?: "unknown";
  return [0, "", $why];
}

// ==========================
// 🚀 UPDATE
// ==========================
[$cDaily, $rDaily, $mDaily]       = putJsonRobust($dailyUrl, $data);
[$cCurObj, $rCurObj, $mCurObj]    = putJsonRobust($currentObjUrl, $currentPayload);
[$cCurStr, $rCurStr, $mCurStr]    = putJsonRobust($currentStrUrl, $today);

// Log
file_put_contents(
  __DIR__ . "/update_log.txt",
  date("c") . " daily=$cDaily($mDaily) curObj=$cCurObj($mCurObj) curStr=$cCurStr($mCurStr)\n",
  FILE_APPEND
);

// Output diagnostico (finale)
echo json_encode([
  "ok" => true,
  "day" => $today,
  "daily" => ["http"=>$cDaily, "mode"=>$mDaily],
  "currentObj" => ["http"=>$cCurObj, "mode"=>$mCurObj],
  "currentStr" => ["http"=>$cCurStr, "mode"=>$mCurStr],
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
