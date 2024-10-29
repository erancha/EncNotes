aws cloudformation deploy --template-file .\apigateway-logging-role.yaml --stack-name api-gateway-logging-role --capabilities CAPABILITY_NAMED_IAM
$arn = aws cloudformation describe-stacks --stack-name api-gateway-logging-role --query 'Stacks[0].Outputs[0].OutputValue' --output text
aws apigateway update-account --patch-operations op='replace',path='/cloudwatchRoleArn',value=$arn
Write-Host "Successfully updated API Gateway account with role ARN: $arn"