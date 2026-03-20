param([string]$Token, [string]$Tag = "v1.0.0")

$headers = @{
  Authorization = "token $Token"
  Accept        = "application/vnd.github+json"
}
$base = "https://api.github.com/repos/luiscriativo/tecius"

# Find release by tag
$release = Invoke-RestMethod -Uri "$base/releases/tags/$Tag" -Headers $headers -ErrorAction SilentlyContinue
if ($release) {
  Invoke-RestMethod -Uri "$base/releases/$($release.id)" -Method Delete -Headers $headers
  Write-Host "Release $Tag deleted (id=$($release.id))"
} else {
  Write-Host "No release found for $Tag"
}

# Delete the tag via refs API
try {
  Invoke-RestMethod -Uri "$base/git/refs/tags/$Tag" -Method Delete -Headers $headers
  Write-Host "Tag $Tag deleted from remote"
} catch {
  Write-Host "Tag deletion: $($_.Exception.Message)"
}
