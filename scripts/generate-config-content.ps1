param (
  [array]$stack_outputs,
  [string]$rest_api_url,
  [string]$websocket_api_url,
  [switch]$backend_build_time = $false,
  [switch]$frontend_build_time = $false,
  [string]$redirect_sign_in,
  [string]$redirect_sign_out
)

$build_time = ""
if ($backend_build_time) {
  $build_time = (Get-Date -Format "yyyy MM/dd_HH:mm") + " "
}
if ($frontend_build_time) {
  if (-Not (Test-Path $CONFIG_FILE_PATH)) {
    Write-Output "Existing config file not found at $CONFIG_FILE_PATH"
    exit 1
  }
  $existing_config = Get-Content $CONFIG_FILE_PATH | ConvertFrom-Json
  $build_time = $existing_config.BUILD + " | " + (Get-Date -Format "MM/dd_HH:mm")
}
$build_time = $build_time.Trim()

$cognito_user_pool_id = ($stack_outputs | Where-Object { $_.OutputKey -eq "UserPoolId" }).OutputValue
$cognito_user_pool_client_id = ($stack_outputs | Where-Object { $_.OutputKey -eq "UserPoolClientId" }).OutputValue
$cognito_domain = ($stack_outputs | Where-Object { $_.OutputKey -eq "CognitoDomain" }).OutputValue

# Check if the config file doesn't exist
if (-Not (Test-Path $CONFIG_FILE_PATH)) {
    # If the file doesn't exist, create a new one with all the provided information
    $aws_region = aws configure get region
    if (-not $aws_region) {
        Write-Error "Failed to retrieve AWS region from CLI configuration. Please ensure AWS CLI is configured."
        exit 1
    }

    $config_content = @"
    {
        "REST_API_URL": "$rest_api_url",
        "WEBSOCKET_API_URL": "$websocket_api_url",
        "BUILD": "$build_time",
        "COGNITO": {
            "userPoolId": "$cognito_user_pool_id",
            "userPoolWebClientId": "$cognito_user_pool_client_id",
            "region": "$aws_region",
            "domain": "$cognito_domain",
            "redirectSignIn": "$redirect_sign_in",
            "redirectSignOut": "$redirect_sign_out"
        }
    }
"@

    Set-Content -Path $CONFIG_FILE_PATH -Value $config_content
    Write-Output "New config file created successfully at $CONFIG_FILE_PATH"
} else {
    # If the file exists, read its content
    $existing_config = Get-Content $CONFIG_FILE_PATH | ConvertFrom-Json

    Write-Host $build_time

    # Update the specified values
    $existing_config.BUILD = $build_time
    $existing_config.REST_API_URL = $rest_api_url
    $existing_config.WEBSOCKET_API_URL = $websocket_api_url
    $existing_config.COGNITO.userPoolId = $cognito_user_pool_id
    $existing_config.COGNITO.userPoolWebClientId = $cognito_user_pool_client_id
    $existing_config.COGNITO.domain = $cognito_domain
    $existing_config.COGNITO.redirectSignIn = $redirect_sign_in
    $existing_config.COGNITO.redirectSignOut = $redirect_sign_out

    # Convert the updated config back to JSON and save it
    $updated_config = $existing_config | ConvertTo-Json -Depth 10
    Set-Content -Path $CONFIG_FILE_PATH -Value $updated_config

    Write-Output "Existing config file updated successfully at ${CONFIG_FILE_PATH} : ${updated_config}"
}