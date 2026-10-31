$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
foreach ($iconSize in @(180,192,512,1024)) {
    $bitmap = New-Object System.Drawing.Bitmap($iconSize,$iconSize)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#202a31'))
    $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#f5f7f7'),($iconSize*18/512))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Square
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Square
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Miter
    $points = @(@(331,165),@(230,165),@(174,326),@(285,326),@(311,252),@(254,252)) | ForEach-Object { New-Object System.Drawing.PointF(($_[0]*$iconSize/512),($_[1]*$iconSize/512)) }
    $graphics.DrawLines($pen,[System.Drawing.PointF[]]$points)
    if ($iconSize -eq 1024) { $iconPath = Join-Path $projectRoot 'ios/App/Assets.xcassets/AppIcon.appiconset/Icon.png' }
    elseif ($iconSize -eq 180) { $iconPath = Join-Path $projectRoot 'apple-touch-icon.png' }
    else { $iconPath = Join-Path $projectRoot "icon-$iconSize.png" }
    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $iconPath)) | Out-Null
    $bitmap.Save($iconPath,[System.Drawing.Imaging.ImageFormat]::Png)
    $pen.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
