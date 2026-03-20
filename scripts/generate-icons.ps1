Add-Type -AssemblyName System.Drawing

$resourcesDir = "C:\Programas\Ebooks\projeto-base\resources"
$tempDir = "C:\Programas\Ebooks\projeto-base\resources\_temp-icons"

if (-not (Test-Path $tempDir)) { New-Item -ItemType Directory -Path $tempDir | Out-Null }

function Create-IconPng {
    param([int]$size, [string]$outputPath)

    $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    # Rounded rectangle (black background)
    $radius = [int]($size * 0.18)
    $r2 = $radius * 2
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0,              0,              $r2, $r2, 180, 90)
    $path.AddArc($size - $r2,   0,              $r2, $r2, 270, 90)
    $path.AddArc($size - $r2,   $size - $r2,   $r2, $r2, 0,   90)
    $path.AddArc(0,              $size - $r2,   $r2, $r2, 90,  90)
    $path.CloseFigure()

    $blackBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::Black)
    $g.FillPath($blackBrush, $path)

    # "T" in white, bold, centered
    $fontSize = [float]($size * 0.56)
    $font = New-Object System.Drawing.Font("Arial", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $whiteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center

    $g.DrawString("T", $font, $whiteBrush, [System.Drawing.RectangleF]::new(0, 0, $size, $size), $sf)

    $g.Dispose()
    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()

    Write-Host "  Created $size x $size : $outputPath"
}

# Generate PNGs for all required sizes
$icoSizes = @(16, 24, 32, 48, 64, 128, 256)
Write-Host "`nGenerating icon PNGs..."

foreach ($s in $icoSizes) {
    Create-IconPng -size $s -outputPath "$tempDir\icon-$s.png"
}

# Also generate 512 and 1024 for Linux / general use
Create-IconPng -size 512  -outputPath "$tempDir\icon-512.png"
Create-IconPng -size 1024 -outputPath "$tempDir\icon-1024.png"

# Copy Linux icon
Copy-Item "$tempDir\icon-512.png" "$resourcesDir\icon.png" -Force
Write-Host "`nLinux icon saved: icon.png (512x512)"

# Build multi-size ICO (PNG-based, Windows Vista+ compatible)
Write-Host "`nBuilding multi-size ICO..."

$entries = @()
foreach ($s in $icoSizes) {
    $bytes = [System.IO.File]::ReadAllBytes("$tempDir\icon-$s.png")
    $entries += @{ Width = $s; Height = $s; Bytes = $bytes }
}

$headerSize  = 6
$dirEntrySize = 16
$dataStart   = $headerSize + $dirEntrySize * $entries.Count

$stream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($stream)

# ICONDIR
$writer.Write([uint16]0)               # Reserved
$writer.Write([uint16]1)               # Type = ICO
$writer.Write([uint16]$entries.Count)  # Count

# ICONDIRENTRY for each image
$offset = $dataStart
foreach ($e in $entries) {
    $w = if ($e.Width  -ge 256) { 0 } else { [byte]$e.Width  }
    $h = if ($e.Height -ge 256) { 0 } else { [byte]$e.Height }
    $writer.Write([byte]$w)
    $writer.Write([byte]$h)
    $writer.Write([byte]0)              # ColorCount (0 = no palette)
    $writer.Write([byte]0)              # Reserved
    $writer.Write([uint16]1)            # Planes
    $writer.Write([uint16]32)           # BitCount
    $writer.Write([uint32]$e.Bytes.Length)
    $writer.Write([uint32]$offset)
    $offset += $e.Bytes.Length
}

# Image data (raw PNG bytes)
foreach ($e in $entries) {
    $writer.Write($e.Bytes)
}

$writer.Flush()
$icoBytes = $stream.ToArray()
[System.IO.File]::WriteAllBytes("$resourcesDir\icon.ico", $icoBytes)
$stream.Dispose()
$writer.Dispose()

Write-Host "Windows ICO saved: icon.ico ($([math]::Round($icoBytes.Length/1024))KB, $($icoSizes.Count) sizes: $($icoSizes -join ', '))"

# Cleanup temp dir
Remove-Item $tempDir -Recurse -Force
Write-Host "`nDone. Icons ready in: $resourcesDir"
