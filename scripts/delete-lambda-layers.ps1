# Get the current AWS region
$region = aws configure get region

# Retrieve all Lambda layers in the specified region
Write-Host "Collecting layers in region: $region"
$layers = aws lambda list-layers --region $region --query 'Layers[*].LayerName' --output json | ConvertFrom-Json

foreach ($layerName in $layers) {
    Write-Host "Processing layer: $layerName"

    # Retrieve versions for the current layer
    $versions = aws lambda list-layer-versions --layer-name $layerName --region $region --query 'LayerVersions[*].Version' --output json | ConvertFrom-Json
    $latestVersion = $versions[0]

    foreach ($version in $versions) {
        if ($version -ne $latestVersion) {
            Write-Host "Deleting $layerName version $version"
            aws lambda delete-layer-version --layer-name $layerName --version-number $version --region $region
        }
        else {
            Write-Host "Skipping latest version: $version"
        }
    }
    
    Write-Host "Finished processing layer: $layerName"
}

Write-Host "Finished deleting all older versions of the layers"
