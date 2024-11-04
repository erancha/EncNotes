$isMainBranch = .\common-constants.ps1
Set-Variable -Name 'TEMPLATE_FILE' -Value '.\template.yaml' -Option Constant 

$startTime = Get-Date

Write-Output "`n$(Get-Date -Format 'HH:mm:ss') Validating the SAM template .."
sam validate --template-file $TEMPLATE_FILE # --lint | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() }
if ($LASTEXITCODE -eq 0) {
    Write-Output "`n$(Get-Date -Format 'HH:mm:ss') Starting a build, stack ${STACK_NAME} .."

    Write-Output "`n$(Get-Date -Format 'HH:mm:ss') Preparing lambda layers .."

    $projectFolder = (Get-Location).Path + "/.."

    Set-Location "${projectFolder}/backend/layers/jsonwebtoken/nodejs/"
    npm install
    Set-Location ..
    Compress-Archive -Update -Path * -DestinationPath ../jsonwebtoken-layer.zip

    Set-Location "${projectFolder}/backend/notes/layers/encryption/"
    Compress-Archive -Update -Path *.js -DestinationPath ../notes-encryption-layer.zip

    Set-Location "${projectFolder}/backend/layers/awssdkv3/nodejs/"
    npm install
    Set-Location ..
    Compress-Archive -Update -Path * -DestinationPath ../awssdkv3-layer.zip

    Set-Location "${projectFolder}/backend/layers/ioredis/nodejs/"
    npm install
    Set-Location ..
    Compress-Archive -Update -Path * -DestinationPath ../ioredis-layer.zip

    Set-Location "${projectFolder}/scripts/"

    Write-Output "`n$(Get-Date -Format 'HH:mm:ss') sam build --template-file $TEMPLATE_FILE ..`n"
    sam build --template-file $TEMPLATE_FILE
    if ($LASTEXITCODE -eq 0) {
        $endTime = Get-Date
        $elapsedTime = [math]::Round(($endTime - $startTime).TotalSeconds)
        Write-Output "`n$(Get-Date -Format 'HH:mm:ss') Build completed, time elapsed: $elapsedTime seconds."

        Set-Variable -Name 'EXISTING_USER_POOL_ID' -Value 'eu-central-1_OHq1aZYju' -Option Constant 
        if ($EXISTING_USER_POOL_ID -eq '') {
            Write-Output "`n$(Get-Date -Format 'HH:mm:ss') Retrieving Google Client ID and Secret from AWS Secrets Manager .."
            $googleClientIdResponse = aws secretsmanager get-secret-value --secret-id "/ena/google-client-id"
            $googleClientSecretResponse = aws secretsmanager get-secret-value --secret-id "/ena/google-client-secret"
            $googleClientId = ($googleClientIdResponse     | ConvertFrom-Json).SecretString
            $googleClientSecret = ($googleClientSecretResponse | ConvertFrom-Json).SecretString
            if ($LASTEXITCODE -ne 0) {
                Write-Output "Failed to retrieve secrets: /ena/google-client-id and /ena/google-client-secret. Please configure them in https://console.cloud.google.com/."
                exit 1  # Exit the script with a non-zero exit code
            }
        }
        else {
            $googleClientId = "EXISTING_USER_POOL_ID ${EXISTING_USER_POOL_ID}, therefore no need to pass $googleClientId."
            $googleClientSecret = "EXISTING_USER_POOL_ID ${EXISTING_USER_POOL_ID}, therefore no need to pass $googleClientSecret."
        }

        # Start-Sleep -Seconds 120
        Write-Output "`n$(Get-Date -Format 'HH:mm:ss') Deploying .."
        # --no-execute-changeset `  # create a change set without executing it, to see what changes CloudFormation plans to make.

        # Build the parameter overrides string dynamically
        $parameterOverrides = @(
            "S3PublicAccess=true",
            "SenderEmail=webcharm.tech@gmail.com",
            "GoogleClientId=$googleClientId",
            "GoogleClientSecret=$googleClientSecret",
            "ExistingNotesTableName='ena-notes'",
            "ExistingNotesTableStreamArn='arn:aws:dynamodb:eu-central-1:575491442067:table/ena-notes/stream/2024-11-02T23:23:36.905'",
            "ExistingUsersTableName='ena-users'",
            "ExistingNotesEncryptionKeyId='d0efc261-b71d-4f5c-9686-9876cc664243'",
            "ExistingUserPoolId='$EXISTING_USER_POOL_ID'",
            "ExistingCognitoDomain='ena-575491442067.auth.eu-central-1.amazoncognito.com'",
            "ExistingIdentityPoolId='eu-central-1:e9f848f2-a3ed-43f9-8ddb-833ca34233ba'",
            "EnableUserDataKeysCache='true'"
        )

        if ($isMainBranch) {
            $parameterOverrides += "StageName='prod'"
            $parameterOverrides += "AllowOnlyCloudfrontOrigin=true"
        }
        else {
            # In feature branch, reuse the follwing resources in the main branch:
            $parameterOverrides += "ExistingElasticacheRedisClusterAddress='en-elasticache-redis-cluster.hz2zez.0001.euc1.cache.amazonaws.com:6379'"
            $parameterOverrides += "ExistingVpcId='vpc-08016eb77e7ac9962'"
            $parameterOverrides += "ExistingPrivateSubnetId='subnet-00a1db5158e0a7992'"
            $parameterOverrides += "ExistingPublicSubnetId='subnet-0bb23ba0a584c6200'"
            $parameterOverrides += "ExistingRouteTableId='rtb-0db060097cafeff04'"
            # $parameterOverrides += "ExistingNotesLambdaRoleArn='arn:aws:iam::575491442067:role/en-NotesLambdaRole-VmuomzbqvMHk'"
            # $parameterOverrides += "ExistingNotesLambdaSGId='sg-01dd76e700f8dc519'"     # en-NotesLambdaSG
            # $parameterOverrides += "ExistingWebSocketLambdaRoleArn='arn:aws:iam::575491442067:role/en-WebSocketLambdaRole-ghRHJTzd0HEZ'"
            # $parameterOverrides += "ExistingWebSocketLambdaSGId='sg-06b3eda068ba6808d'" # en-WebSocketLambdaSG
        }

        # Join the parameter overrides into a single string
        $parameterOverridesString = $parameterOverrides -join " "

        sam deploy  --template-file $TEMPLATE_FILE --stack-name $STACK_NAME `
            --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND CAPABILITY_NAMED_IAM `
            --resolve-s3 `
            --fail-on-empty-changeset false `
            --parameter-overrides $parameterOverridesString
        if (($LASTEXITCODE -ne 0) -and ($LASTEXITCODE -ne 1)) {
            Write-Output "`nDeployment failed with exit code ${LASTEXITCODE}."
        }
        else {
            if ($LASTEXITCODE -eq 1) {
                Write-Output "`nDeployment completed with no changes to deploy. Stack $STACK_NAME is up to date."
            }
            else {
                Write-Output "`nDeployment completed successfully."
            }

            # Update the appConfig.json file
            $stack_outputs = .\get-stack-outputs.ps1
            $rest_api_url = .\get-api-url.ps1 -stack_outputs $stack_outputs -TYPE 'Rest'
            $websocket_api_url = .\get-api-url.ps1 -stack_outputs $stack_outputs -TYPE 'WebSocket'
            $redirect_sign_in = "http://localhost:3000" # /callback
            $redirect_sign_out = "http://localhost:3000" # /logout
           
            .\generate-config-content.ps1   -stack_outputs $stack_outputs `
                -rest_api_url $rest_api_url `
                -websocket_api_url $websocket_api_url `
                -backend_build_time `
                -redirect_sign_in $redirect_sign_in `
                -redirect_sign_out $redirect_sign_out
            Copy-Item -Path $CONFIG_FILE_PATH -Destination $LAST_DEV_CONFIG_FILE_PATH
        }
    }
    else {
        Write-Output "`nSAM build failed."
    }
}

# Calculate and display the elapsed time
$endTime = Get-Date
$elapsedTime = [math]::Round(($endTime - $startTime).TotalSeconds)
Write-Output "`n$(Get-Date -Format 'HH:mm:ss') Total elapsed time: $elapsedTime seconds."
