# Draws the Sky Climb icon and saves icon.png + icon.ico in the project root
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)

# Rounded sky background
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 56
$path.AddArc(0, 0, $r, $r, 180, 90); $path.AddArc($size - $r - 1, 0, $r, $r, 270, 90)
$path.AddArc($size - $r - 1, $size - $r - 1, $r, $r, 0, 90); $path.AddArc(0, $size - $r - 1, $r, $r, 90, 90)
$path.CloseFigure()
$sky = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point 0, $size), ([System.Drawing.Color]::FromArgb(61, 139, 255)), ([System.Drawing.Color]::FromArgb(205, 238, 255))
$g.FillPath($sky, $path)
$g.SetClip($path)

# Lava at the bottom
$g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 80, 20))), 0, 212, $size, 44)
$g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 200, 60))), 30, 222, 40, 12)
$g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 200, 60))), 150, 232, 50, 12)

# Cloud
$white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(235, 255, 255, 255))
$g.FillRectangle($white, 30, 40, 70, 22); $g.FillRectangle($white, 46, 28, 36, 20)

# Staircase of colored blocks
$colors = @(@(79, 140, 255), @(61, 220, 132), @(255, 210, 63), @(176, 108, 255))
$shadow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(60, 0, 0, 0))
for ($i = 0; $i -lt 4; $i++) {
  $x = 18 + $i * 52; $y = 180 - $i * 36
  $c = $colors[$i]
  $g.FillRectangle($shadow, $x + 4, $y + 4, 48, 26)
  $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($c[0], $c[1], $c[2]))), $x, $y, 48, 26)
  $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70, 255, 255, 255))), $x, $y, 48, 7)
}

# Blocky character standing on the top block
$cx = 190; $base = 72
$yellow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 210, 63))
$blue = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(47, 125, 246))
$green = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(61, 220, 132))
$black = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(34, 34, 34))
$g.FillRectangle($green, $cx - 12, $base - 22, 11, 22); $g.FillRectangle($green, $cx + 1, $base - 22, 11, 22)
$g.FillRectangle($blue, $cx - 13, $base - 44, 26, 22)
$g.FillRectangle($yellow, $cx - 23, $base - 44, 9, 20); $g.FillRectangle($yellow, $cx + 14, $base - 60, 9, 20)
$g.FillRectangle($yellow, $cx - 9, $base - 60, 18, 16)
$g.FillRectangle($black, $cx - 5, $base - 56, 3, 4); $g.FillRectangle($black, $cx + 2, $base - 56, 3, 4)
$g.FillRectangle($black, $cx - 4, $base - 49, 8, 2)

$g.Dispose()
$pngPath = Join-Path $root 'icon.png'
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

# Wrap the PNG in an .ico container (PNG-compressed icons are supported since Windows Vista)
$png = [System.IO.File]::ReadAllBytes($pngPath)
$ms = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $ms
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]1)
$w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0)
$w.Write([UInt16]1); $w.Write([UInt16]32); $w.Write([UInt32]$png.Length); $w.Write([UInt32]22)
$w.Write($png)
[System.IO.File]::WriteAllBytes((Join-Path $root 'icon.ico'), $ms.ToArray())
Write-Output "Icon written"
