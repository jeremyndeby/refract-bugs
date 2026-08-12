$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$outputDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'assets\bugs'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$assets = @(
  @{ Name = 'progress-reconnect.png'; Title = 'Progress after reconnect'; Accent = '#6C5CE7'; Lines = @('Episode 4', '42 min watched', 'Reconnect → previous value') },
  @{ Name = 'subtitle-overlap.png'; Title = 'Subtitle menu'; Accent = '#00B894'; Lines = @('English', 'Norsk', 'Player controls overlap') },
  @{ Name = 'subtitle-overlap-large-text.png'; Title = 'Large text mode'; Accent = '#FDCB6E'; Lines = @('Subtitle settings', 'English', 'Controls cover final choice') },
  @{ Name = 'search-clear.png'; Title = 'Search filters'; Accent = '#6C5CE7'; Lines = @('Query visually cleared', '0 active chips', '12 of 148 results') },
  @{ Name = 'poster-grid.png'; Title = 'Collection grid'; Accent = '#00B894'; Lines = @('Fast scroll', 'Placeholder ratio', 'Poster size corrected') },
  @{ Name = 'watched-toggle.png'; Title = 'Watched toggle'; Accent = '#6C5CE7'; Lines = @('Search result', 'First tap ignored', 'Fixed: responds once') },
  @{ Name = 'import-progress.png'; Title = 'Import progress'; Accent = '#00B894'; Lines = @('1,248 items', '99%', 'Completed event received') }
)

foreach ($asset in $assets) {
  $bitmap = [System.Drawing.Bitmap]::new(1280, 800)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#1E2225'))
    $accent = [System.Drawing.ColorTranslator]::FromHtml($asset.Accent)
    $cardBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#353B48'))
    $textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#F4F4F6'))
    $mutedBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#B2BEC3'))
    $accentBrush = [System.Drawing.SolidBrush]::new($accent)
    $borderPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#444C56'), 3)
    $accentPen = [System.Drawing.Pen]::new($accent, 14)
    $titleFont = [System.Drawing.Font]::new('Segoe UI', 42, [System.Drawing.FontStyle]::Bold)
    $bodyFont = [System.Drawing.Font]::new('Segoe UI', 28, [System.Drawing.FontStyle]::Regular)
    $smallFont = [System.Drawing.Font]::new('Segoe UI', 20, [System.Drawing.FontStyle]::Regular)

    $graphics.FillRectangle($cardBrush, 100, 90, 1080, 620)
    $graphics.DrawRectangle($borderPen, 100, 90, 1080, 620)
    $graphics.DrawLine($accentPen, 100, 90, 100, 710)
    $graphics.FillEllipse($accentBrush, 155, 150, 54, 54)
    $graphics.DrawString($asset.Title, $titleFont, $textBrush, 245, 140)
    $y = 270
    foreach ($line in $asset.Lines) {
      $graphics.FillRectangle($mutedBrush, 165, $y + 12, 16, 16)
      $graphics.DrawString($line, $bodyFont, $textBrush, 215, $y)
      $y += 92
    }
    $graphics.FillRectangle($accentBrush, 165, 590, 320, 12)
    $graphics.FillRectangle($mutedBrush, 165, 620, 720, 8)
    $graphics.DrawString('Public fixture · no author data', $smallFont, $mutedBrush, 165, 655)

    $path = Join-Path $outputDirectory $asset.Name
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    foreach ($resource in @($graphics, $bitmap, $cardBrush, $textBrush, $mutedBrush, $accentBrush, $borderPen, $accentPen, $titleFont, $bodyFont, $smallFont)) {
      if ($null -ne $resource) { $resource.Dispose() }
    }
  }
}
