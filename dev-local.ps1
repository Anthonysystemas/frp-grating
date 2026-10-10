Get-Content .env.maskel | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_]+)\s*=\s*(.*)$') {
    Set-Item -Path "env:$($Matches[1])" -Value $Matches[2].Trim('"')
  }
}
npx vercel dev