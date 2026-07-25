@description('Azure Static Web App resource name')
param siteName string = 'opengraph-web-prod'

@description('Azure region used for the Static Web App metadata')
param location string = 'westus2'

@description('Canonical production hostname. DNS must CNAME this host to the Static Web App hostname.')
param customHostname string = 'www.opengraph.work'

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

resource productionDomain 'Microsoft.Web/staticSites/customDomains@2023-12-01' = {
  parent: staticSite
  name: customHostname
  properties: {
    validationMethod: 'cname-delegation'
  }
}

output siteName string = staticSite.name
output defaultHostname string = staticSite.properties.defaultHostname
output sku string = staticSite.sku.name
output customHostname string = productionDomain.name
