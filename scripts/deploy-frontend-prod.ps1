$isMainBranch = .\common-constants.ps1

# -----------------------
Write-Output "Building the React App and copying the distribution files to the S3 bucket .."

$stack_outputs = .\get-stack-outputs.ps1 -STACK_NAME $STACK_NAME

# Update the appConfig.json file
$rest_api_url      = .\get-api-url.ps1 -stack_outputs $stack_outputs -TYPE 'Rest'
$websocket_api_url = .\get-api-url.ps1 -stack_outputs $stack_outputs -TYPE 'WebSocket'
$cloudfront_url    = ($stack_outputs | Where-Object { $_.OutputKey -eq "CloudFrontUrl" }).OutputValue
$redirect_sign_in  = $cloudfront_url  # /callback
$redirect_sign_out = $cloudfront_url # /logout
.\generate-config-content.ps1   -stack_outputs $stack_outputs `
                                -rest_api_url $rest_api_url `
                                -websocket_api_url $websocket_api_url `
                                -frontend_build_time `
                                -redirect_sign_in $redirect_sign_in `
                                -redirect_sign_out $redirect_sign_out

cd ../frontend/enc-notes
npm run build

$S3_BUCKET = ($stack_outputs | Where-Object { $_.OutputKey -eq "S3BucketName" }).OutputValue
if (-not $S3_BUCKET) {
    Write-Error "Failed to find S3 bucket name in CloudFormation outputs"
    exit 1
}
Write-Output "Uploading frontend to : s3://$S3_BUCKET"
aws s3 sync build "s3://$S3_BUCKET"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to upload files to S3 bucket. Please check your AWS credentials and bucket permissions."
    exit 1
}
cd ../../scripts
Copy-Item -Path $LAST_DEV_CONFIG_FILE_PATH -Destination $CONFIG_FILE_PATH -Force

# Create CloudFront invalidation
$cloudfront_distribution_id = ($stack_outputs | Where-Object { $_.OutputKey -eq "CloudFrontDistributionId" }).OutputValue
if ($cloudfront_distribution_id) {
    aws cloudfront create-invalidation --distribution-id $cloudfront_distribution_id --paths "/*"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create CloudFront invalidation. Please check your AWS credentials and permissions."
    } else {
        Write-Output "CloudFront invalidation created successfully."
    }
} else {
    Write-Error "Failed to find CloudFront distribution ID in CloudFormation outputs"
}

Write-Output "Deployment complete."
Write-Output "Your website is available at the following URL: ${cloudfront_url}"

