$stack_outputs = aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs" --output json | ConvertFrom-Json
# Write-Host "Stack outputs:"
$stack_outputs | ForEach-Object { Write-Output "  $($_.OutputKey): $($_.OutputValue)" }
return $stack_outputs