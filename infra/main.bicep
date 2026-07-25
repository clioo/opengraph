@description('Azure Static Web App resource name')
param siteName string = 'opengraph-web-prod'

@description('Azure region used for the Static Web App metadata')
param location string = 'westus2'

resource staticSite 'Microsoft.Web/staticSites@2023-12-01' = {
  name: siteName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: 'Enabled'
  }
}

output siteName string = staticSite.name
output defaultHostname string = staticSite.properties.defaultHostname
output sku string = staticSite.sku.name
