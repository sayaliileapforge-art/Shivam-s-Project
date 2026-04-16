# fix_strings.ps1 - Fix broken $e string interpolation in Dart catch blocks
$file = "lib\features\vendor\screens\vendor_screens.dart"
$lines = [System.IO.File]::ReadAllLines($file, [System.Text.Encoding]::UTF8)
$fixed = 0
for ($i = 0; $i -lt $lines.Length; $i++) {
    # The broken string is: Text('Error: \'))  - the \' was meant to be $e
    # Correct Dart: Text('Error: $e'))
    if ($lines[$i] -match "Text\('Error: \\'\)\)\)") {
        $lines[$i] = $lines[$i] -replace [regex]::Escape("Text('Error: \')))")  , "Text('Error: `$e')))"
        $fixed++
        Write-Host "Fixed line $($i+1)"
    }
}
[System.IO.File]::WriteAllLines($file, $lines, [System.Text.Encoding]::UTF8)
Write-Host "Total fixed: $fixed"
