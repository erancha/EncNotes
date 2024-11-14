# # Get the directory of the current script
# $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# # Set relative paths based on the script's location
# $mainRepoPath = Join-Path $scriptDir "..\.."
# $submoduleName = "kms-deks-redis-dynamodb-based-encryption"
# $submoduleRepoUrl = "https://github.com/erancha/$submoduleName.git"
# $submodulePath = Join-Path (Join-Path $mainRepoPath "..") $submoduleName
# $layerCodePath = Join-Path $mainRepoPath "backend\notes\layers\encryption\encryption.js"
# $readmePath = Join-Path $submodulePath "README.md"

# 1. Create a New Repository for the Submodule (Create the directory)
# New-Item -ItemType Directory -Path $submodulePath -Force

# # 2. Initialize the New Repository Locally
# Set-Location -Path $submodulePath
# git init

# # 3. Copy the encryption.js File into the Submodule
# Copy-Item -Path $layerCodePath -Destination $submodulePath

# # 4. Add a README or other initial files if necessary (optional)
# $readmeContent = "# KMS-DEKs Elasticache-Redis DynamoDB based encryption submodule`n" +
#                  "`n" +
#                  "This submodule requires the following environment variables: (process.env.*)`n" +
#                  "1. APP_AWS_REGION - the current AWS region`n" +
#                  "2. KMS_KEY_ALIAS - a KMS key alias to generate DEKs`n" +
#                  "3. USERS_TABLE_NAME - a dynamodb table name containing the encrypted DEKs`n" +
#                  "4. ELASTICACHE_REDIS_ADDRESS - an elasticache redis server to manage plaintext DEKs`n"

# # Create/update README.md
# Set-Content -Path $readmePath -Value $readmeContent

# # 5. Commit the initial state of the submodule and push to GitHub
# git branch -M main
# git add .
# git commit -m "Initial commit for the KMS-DEKs Elasticache Redis DynamoDB based encryption submodule"

# # Push the commit to the remote repository
# git remote add origin $submoduleRepoUrl
# git push -u origin main

# 6. Remove the Old Layer Code
# Remove-Item $layerCodePath -Force
# git rm $layerCodePath
# git commit -m "Removed original encryption.js file, now using submodule"

# # 7. Add the Submodule to the Main Repository
# Set-Location -Path $mainRepoPath
# git submodule add $submoduleRepoUrl "backend/notes/layers/encryption"
# git commit -m "Added a submodule to implement the lambda encryption layer"

# Set-Location -Path $scriptDir
Write-Host "Submodule setup completed successfully."
