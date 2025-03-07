#!/usr/bin/env bash

# CI/CD deploy script
# This script should only be called from the CI/CD server.
# Assumes that current working directory is project root.
# Inspects files changed in the most recent commit
# and deploys the appropriate service

FILES_CHANGED=$(git diff --name-only HEAD HEAD~1)
echo "$FILES_CHANGED"

DEPLOY_APP=false
DEPLOY_SERVER=false

#
# Inspect files changed
#

if [[ "$FILES_CHANGED" =~ build.yml ]]; then
  DEPLOY_SERVER=true
  DEPLOY_APP=true
fi

if [[ "$FILES_CHANGED" =~ deploy-app.sh ]]; then
  DEPLOY_APP=true
fi

if [[ "$FILES_CHANGED" =~ deploy-server.sh ]]; then
  DEPLOY_SERVER=true
fi

if [[ "$FILES_CHANGED" =~ cicd-deploy.sh ]]; then
  DEPLOY_APP=true
  DEPLOY_SERVER=true
fi

if [[ "$FILES_CHANGED" =~ Dockerfile ]]; then
  DEPLOY_SERVER=true
fi

if [[ "$FILES_CHANGED" =~ package-lock.json ]]; then
  DEPLOY_APP=true
  DEPLOY_SERVER=true
fi

if [[ "$FILES_CHANGED" =~ packages/app ]]; then
  DEPLOY_APP=true
fi

if [[ "$FILES_CHANGED" =~ packages/core ]]; then
  DEPLOY_APP=true
  DEPLOY_SERVER=true
fi

if [[ "$FILES_CHANGED" =~ packages/definitions ]]; then
  DEPLOY_APP=true
  DEPLOY_SERVER=true
fi

if [[ "$FILES_CHANGED" =~ packages/fhirtypes ]]; then
  DEPLOY_APP=true
  DEPLOY_SERVER=true
fi

if [[ "$FILES_CHANGED" =~ packages/server ]]; then
  DEPLOY_SERVER=true
fi

if [[ "$FILES_CHANGED" =~ packages/react ]]; then
  DEPLOY_APP=true
fi

#
# Run the appropriate deploy scripts
#

if [[ "$DEPLOY_APP" = true ]]; then
  echo "Deploy app"
  source ./scripts/deploy-app.sh
fi

if [[ "$DEPLOY_SERVER" = true ]]; then
  echo "Deploy server"
  source ./scripts/deploy-server.sh
fi
