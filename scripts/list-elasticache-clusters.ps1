# Define a function to get ElastiCache Redis clusters in a specified region
function Get-RedisClusters {
   param (
       [string]$region
   )

   # Execute the AWS CLI command to describe ElastiCache clusters
   $clusters = aws elasticache describe-cache-clusters --region $region --query "CacheClusters[?Engine=='redis'].[CacheClusterId, CacheNodeType, Engine, CacheClusterStatus]" --output json
   $clustersObject = $clusters | ConvertFrom-Json
   if ($clustersObject) {
       # Write region header
       Write-Output "Region: $region"
       
       # Check if there are any clusters and write them out
       if ($clustersObject.Count -gt 0) {
           foreach ($cluster in $clustersObject) {
               Write-Output "Cluster ID: $($cluster[0]), Node Type: $($cluster[1]), Engine: $($cluster[2]), Status: $($cluster[3])"
           }
       } else {
           Write-Output "No Redis clusters found in region: $region"
       }
       Write-Output ""
   }
}

# Get all available regions for ElastiCache
$regions = aws ec2 describe-regions --query "Regions[*].RegionName" --output text

# Split and trim the regions string into an array
$regionArray = $regions -split '\s+' | ForEach-Object { $_.Trim() }

# Loop through each region and get the Redis clusters
foreach ($region in $regionArray) {
   if (-not [string]::IsNullOrWhiteSpace($region)) {
       Get-RedisClusters -region $region
   }
}
