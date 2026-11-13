# jalankan-demo.ps1 — Menyalakan n8n + toko demo Glowra sekaligus (masing-masing di jendela sendiri).
#
# Cara pakai: klik kanan file ini di File Explorer -> "Run with PowerShell",
# atau dari PowerShell:  powershell -ExecutionPolicy Bypass -File .\jalankan-demo.ps1
#
# - n8n      : http://localhost:5678  (data & kredensial tersimpan di folder .n8n, TIDAK ikut ke Git)
# - toko demo: http://localhost:3000
# Untuk mematikan: tutup kedua jendela PowerShell yang terbuka (atau tekan Ctrl + C di masing-masing).

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1) n8n — memakai folder project sebagai tempat data (.n8n), versi dikunci supaya sama dengan yang diuji
Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "`$env:N8N_USER_FOLDER='$root'; `$env:N8N_DIAGNOSTICS_ENABLED='false'; `$env:N8N_PORT='5678'; " +
  "Write-Host 'Menyalakan n8n... tunggu tulisan: Editor is now accessible' -ForegroundColor Yellow; npx -y n8n@2.47.4"
)

# 2) Toko demo — build dulu kalau belum ada, lalu jalankan
Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "Set-Location '$root\web'; " +
  "if (-not (Test-Path node_modules)) { npm install }; " +
  "if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local; Write-Host 'Isi web\.env.local dulu, lalu jalankan ulang.' -ForegroundColor Red }; " +
  "npm run build; npm run start"
)

Write-Host "Dua jendela dibuka. Setelah ±1 menit, buka http://localhost:3000 (toko) dan http://localhost:5678 (n8n)." -ForegroundColor Green
