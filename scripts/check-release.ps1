$headers = @{ Authorization = "token $env:GH_TOKEN" }
$r = Invoke-RestMethod -Uri 'https://api.github.com/repos/luiscriativo/tecius/releases/tags/v1.0.0' -Headers $headers
Write-Host "Name:" $r.name
Write-Host "Tag:" $r.tag_name
Write-Host "Draft:" $r.draft
Write-Host "URL:" $r.html_url
Write-Host "Assets:" ($r.assets | ForEach-Object { $_.name } | Join-String -Separator ', ')
