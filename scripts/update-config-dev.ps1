# Update the appConfig.json file
$stack_outputs = .\get-stack-outputs.ps1
$rest_api_url = .\get-api-url.ps1 -stack_outputs $stack_outputs -TYPE 'Rest'
$websocket_api_url = .\get-api-url.ps1 -stack_outputs $stack_outputs -TYPE 'WebSocket'
$redirect_sign_in = "http://localhost:3000" # /callback
$redirect_sign_out = "http://localhost:3000" # /logout
            
.\generate-config-content.ps1 `
   -stack_outputs $stack_outputs `
   -rest_api_url $rest_api_url `
   -websocket_api_url $websocket_api_url `
   -backend_build_time `
   -redirect_sign_in $redirect_sign_in `
   -redirect_sign_out $redirect_sign_out

$isMainBranch = .\common-constants.ps1
Copy-Item -Path $CONFIG_FILE_PATH -Destination $LAST_DEV_CONFIG_FILE_PATH            