param (
   [array]$stack_outputs,
   [string]$TYPE # Rest or WebSocket
)

# Write-Host $stack_outputs

Set-Variable -Name 'API_URL_KEY_NAME' -Value "${TYPE}ApiUrl" -Option Constant
$rest_api_url = ($stack_outputs | Where-Object { $_.OutputKey -eq $API_URL_KEY_NAME }).OutputValue
if (-not $rest_api_url) {
   Write-Error "Failed to find ${API_URL_KEY_NAME} in CloudFormation outputs"
   exit 1
}

return $rest_api_url