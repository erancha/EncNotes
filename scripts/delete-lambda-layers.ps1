$region = aws configure get region
$layerName = "CorsHeadersLayer" 

$versions = aws lambda list-layer-versions --layer-name $layerName --region $region --query 'LayerVersions[*].Version' --output json | ConvertFrom-Json
$latestVersion = $versions[0]

foreach ($version in $versions) {
    if ($version -ne $latestVersion) {
        Write-Host "Deleting $layerName version $version"
        aws lambda delete-layer-version --layer-name $layerName --version-number $version --region $region
    } else {
        Write-Host "Skipping latest version: $version"
    }
}

Write-Host "Finished deleting all versions of $layerName"
