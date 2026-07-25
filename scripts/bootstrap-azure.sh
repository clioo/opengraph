#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-rg-opengraph-prod}"
LOCATION="${AZURE_LOCATION:-westus2}"
SITE_NAME="${AZURE_STATIC_SITE_NAME:-opengraph-web-prod}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-clioo/opengraph}"

az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none

az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file infra/main.bicep \
  --parameters siteName="$SITE_NAME" location="$LOCATION" \
  --output none

DEPLOYMENT_TOKEN="$(az staticwebapp secrets list \
  --name "$SITE_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query properties.apiKey \
  --output tsv)"

if [[ -z "$DEPLOYMENT_TOKEN" ]]; then
  echo "Azure did not return a deployment token." >&2
  exit 1
fi

gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN \
  --repo "$GITHUB_REPOSITORY" \
  --body "$DEPLOYMENT_TOKEN"

HOSTNAME="$(az staticwebapp show \
  --name "$SITE_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query defaultHostname \
  --output tsv)"

echo "Azure Static Web App is ready: https://$HOSTNAME"
echo "GitHub deployment secret configured for $GITHUB_REPOSITORY."
