$currentBranch = git rev-parse --abbrev-ref HEAD
$isMainBranch = $currentBranch -eq 'main'

if ($isMainBranch) {
    Set-Variable -Name 'STACK_NAME' -Value 'en' -Scope Global
} else {
    Set-Variable -Name 'STACK_NAME' -Value 'en-f12' -Scope Global
    Write-Host "Remember to add/remove NotesLambdaSG as an inbound rule to MyElasticacheRedisSG !" -ForegroundColor Yellow -BackgroundColor DarkRed
}

Set-Variable -Name 'CONFIG_FILE_PATH'          -Value '../frontend/enc-notes/public/appConfig.json' -Scope Global
Set-Variable -Name 'LAST_DEV_CONFIG_FILE_PATH' -Value '../frontend/enc-notes/appConfigDev.json'     -Scope Global

return $isMainBranch
