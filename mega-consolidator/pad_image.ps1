Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("..\graphics\CombinatorIcon.png")
$max = [Math]::Max($img.Width, $img.Height)
$bmp = New-Object System.Drawing.Bitmap($max, $max)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Transparent)
$x = ($max - $img.Width) / 2
$y = ($max - $img.Height) / 2
$g.DrawImage($img, $x, $y, $img.Width, $img.Height)
$bmp.Save("..\graphics\CombinatorIcon_square.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
$img.Dispose()
