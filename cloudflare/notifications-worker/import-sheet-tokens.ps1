$ErrorActionPreference = 'Stop'

$workerUrl = 'https://coptic-app-notifications.abraammerzik56.workers.dev'
$sheetCsvUrl = 'https://docs.google.com/spreadsheets/d/1kZKjF2KDsGT0HslGSenN-pDTzx4FpX0QDPqX0ZOnriY/export?format=csv&gid=425952754'

Write-Host 'Reading KHMI_NOFICATION directly from Google Sheets...'
try {
  $sheetResponse = Invoke-WebRequest -Uri $sheetCsvUrl -Method Get -MaximumRedirection 5
} catch {
  throw 'Could not read the sheet. It may require Google sign-in. Do not make token data public.'
}
$csvText = [string]$sheetResponse.Content
if ([string]::IsNullOrWhiteSpace($csvText) -or $csvText -match '(?is)^\s*(<!doctype\s+html|<html)') {
  throw 'Google returned HTML instead of CSV. The sheet may require sign-in. Do not make token data public.'
}
try {
  $rows = @($csvText | ConvertFrom-Csv)
} catch {
  throw 'Could not parse the sheet as CSV. Check that the gid points to KHMI_NOFICATION.'
}
if ($rows.Count -eq 0) { throw 'The sheet is empty or has no data rows.' }

try {
  $adminToken = [regex]::Replace([string](Get-Clipboard -Raw), '[\r\n]+', '').Trim()
} catch {
  throw 'Could not read the Windows clipboard. Copy ADMIN_API_TOKEN to the clipboard, then run this script again.'
}
if ([string]::IsNullOrWhiteSpace($adminToken)) { throw 'Clipboard is empty. Copy ADMIN_API_TOKEN first, then run this script again.' }

# Read column C by position, regardless of its header name.
$devices = [System.Collections.Generic.List[object]]::new()
$seen = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$invalid = 0
$duplicates = 0
$tokenPattern = '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,128}\]$'
foreach ($row in $rows) {
  $properties = @($row.PSObject.Properties)
  if ($properties.Count -lt 3) { $invalid++; continue }
  $token = ([string]$properties[2].Value).Trim()
  if ($token -notmatch $tokenPattern) { $invalid++; continue }
  if (-not $seen.Add($token)) { $duplicates++; continue }
  $devices.Add(@{ expoToken = $token; language = 'ar' })
}

if ($devices.Count -eq 0) {
  throw "No valid Expo tokens found in column C. Invalid: $invalid; duplicates: $duplicates"
}
Write-Host "Valid unique tokens: $($devices.Count) | Invalid/blank: $invalid | Duplicates: $duplicates"
$confirm = Read-Host 'To import without deactivating existing records, type IMPORT'
if ($confirm -cne 'IMPORT') { throw 'Cancelled. Nothing was imported.' }

$totalAdded = 0
$totalExisting = 0
for ($i = 0; $i -lt $devices.Count; $i += 100) {
  $end = [Math]::Min($i + 99, $devices.Count - 1)
  $batch = @($devices.GetRange($i, $end - $i + 1))
  $body = @{ devices = $batch } | ConvertTo-Json -Depth 5 -Compress
  $response = Invoke-RestMethod -Method Post -Uri "$workerUrl/admin/import-legacy" -Headers @{ Authorization = "Bearer $adminToken" } -ContentType 'application/json; charset=utf-8' -Body $body
  $totalAdded += [int]$response.addedOrReactivated
  $totalExisting += [int]$response.alreadyPresent
  Write-Host "Batch $([int]($i / 100) + 1): received $($response.received), added/reactivated $($response.addedOrReactivated), already present $($response.alreadyPresent), invalid at server $($response.invalid)"
}
$adminToken = $null
Write-Host "Import complete. Added/reactivated: $totalAdded | Already present: $totalExisting | Invalid/blank in CSV: $invalid | Duplicates: $duplicates"
