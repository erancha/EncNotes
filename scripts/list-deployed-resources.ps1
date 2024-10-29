# Ensure you have AWS PowerShell module installed
# Install-Module -Name AWSPowerShell.NetCore -Force

# Import the AWS module
Import-Module AWSPowerShell

# Set your AWS Region
$region = "us-east-1" # Change to your desired region

# Get all the subnets in the region
$subnets = Get-EC2Subnet -Region $region

# Create a hashtable to store resources by subnet
$resourcesBySubnet = @{}

foreach ($subnet in $subnets) {
   $subnetId = $subnet.SubnetId
   $resourcesBySubnet[$subnetId] = @()

   # Get EC2 Instances in the subnet
   $ec2Instances = Get-EC2Instance -Filter @{ Name = 'subnet-id'; Values = $subnetId } -Region $region
   foreach ($instance in $ec2Instances.Instances) {
      $resourcesBySubnet[$subnetId] += [PSCustomObject]@{
         ResourceType = "EC2 Instance"
         ResourceId   = $instance.InstanceId
         ResourceName = $instance.Tags | Where-Object { $_.Key -eq 'Name' } | Select-Object -ExpandProperty Value
      }
   }

   # Get Lambda Functions (Lambda functions do not belong to a subnet, they just use VPC configuration)
   $lambdaFunctions = Get-LMFunction -Region $region
   foreach ($lambda in $lambdaFunctions) {
      if ($lambda.VpcConfig) {
         foreach ($subnetIdInVpc in $lambda.VpcConfig.SubnetIds) {
            if ($subnetIdInVpc -eq $subnetId) {
               $resourcesBySubnet[$subnetId] += [PSCustomObject]@{
                  ResourceType = "Lambda Function"
                  ResourceId   = $lambda.FunctionName
                  ResourceName = $lambda.FunctionName
               }
            }
         }
      }
   }

   # Get ElastiCache Clusters in the subnet
   $redisClusters = Get-EC2CacheCluster -Region $region
   foreach ($cluster in $redisClusters) {
      if ($cluster.SubnetGroupName -eq $subnetId) {
         $resourcesBySubnet[$subnetId] += [PSCustomObject]@{
            ResourceType = "ElastiCache Cluster"
            ResourceId   = $cluster.CacheClusterId
            ResourceName = $cluster.CacheClusterId
         }
      }
   }
}

# Output the results
foreach ($subnetId in $resourcesBySubnet.Keys) {
   Write-Output "Subnet ID: $subnetId"
   foreach ($resource in $resourcesBySubnet[$subnetId]) {
      Write-Output "  Resource Type: $($resource.ResourceType), Resource ID: $($resource.ResourceId), Resource Name: $($resource.ResourceName)"
   }
}
