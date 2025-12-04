#!/bin/bash
# Deploy DAO AI Builder to Databricks Apps
#
# Usage:
#   ./deploy.sh
#
# Prerequisites:
#   - Databricks CLI configured with authentication
#   - Node.js and npm installed
#   - jq installed (for JSON parsing)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

APP_NAME="dao-ai-builder"
BUNDLE_NAME="dao_ai_builder"

echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     DAO AI Builder - Deployment Script     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v databricks &> /dev/null; then
    echo -e "${RED}✗ Databricks CLI not found${NC}"
    echo "  Install with: pip install databricks-cli"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Databricks CLI installed"

if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm not found${NC}"
    echo "  Install Node.js from https://nodejs.org"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} npm installed"

if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}⚠ jq not found - status polling may not work correctly${NC}"
    echo "  Install with: brew install jq"
    HAS_JQ=false
else
    echo -e "  ${GREEN}✓${NC} jq installed"
    HAS_JQ=true
fi

# Verify Databricks authentication
if ! databricks current-user me &> /dev/null; then
    echo -e "${RED}✗ Databricks CLI not authenticated${NC}"
    echo "  Run: databricks configure"
    exit 1
fi
USER_EMAIL=$(databricks current-user me --output json | jq -r '.userName' 2>/dev/null || databricks current-user me --output json | grep -o '"userName":"[^"]*"' | cut -d'"' -f4)
echo -e "  ${GREEN}✓${NC} Authenticated as ${BLUE}${USER_EMAIL}${NC}"
echo ""

# Workspace path where files are synced
WORKSPACE_PATH="/Workspace/Users/${USER_EMAIL}/.bundle/${BUNDLE_NAME}/default/files"
echo -e "  Workspace path: ${BLUE}${WORKSPACE_PATH}${NC}"
echo ""

# Step 1: Generate JSON schema for validation
echo -e "${YELLOW}[1/6] Generating JSON schema...${NC}"
if command -v dao-ai &> /dev/null; then
    dao-ai schema > frontend/public/model_config_schema.json
    echo -e "  ${GREEN}✓${NC} JSON schema generated from dao-ai"
else
    echo -e "  ${YELLOW}⚠${NC} dao-ai not found, using existing schema"
fi
echo ""

# Step 2: Build frontend
echo -e "${YELLOW}[2/6] Building frontend...${NC}"
cd frontend
npm install --silent 2>/dev/null
npm run build 2>&1 | tail -5
cd ..
echo -e "  ${GREEN}✓${NC} Frontend built"
echo ""

# Step 3: Prepare static files
echo -e "${YELLOW}[3/6] Preparing static files...${NC}"
rm -rf static
cp -r frontend/dist static
echo -e "  ${GREEN}✓${NC} Static files copied to ./static"
echo ""

# Step 4: Deploy with Databricks Bundle (creates app + syncs files)
echo -e "${YELLOW}[4/6] Syncing files to Databricks...${NC}"

# Check if app exists, create if needed
if ! databricks apps get "${APP_NAME}" &> /dev/null; then
    echo -e "  App ${BLUE}${APP_NAME}${NC} doesn't exist, creating..."
    # Clean bundle state if app doesn't exist but state does
    if [ -d ".databricks" ]; then
        echo -e "  Cleaning stale bundle state..."
        rm -rf .databricks
    fi
    # Create the app first
    databricks apps create "${APP_NAME}" --description "Visual configuration studio for dao-ai agent systems" 2>&1 | while read line; do
        echo -e "  ${line}"
    done
    echo -e "  ${GREEN}✓${NC} App created"
else
    echo -e "  App ${BLUE}${APP_NAME}${NC} exists"
fi

databricks bundle deploy 2>&1 | while read line; do
    echo -e "  ${line}"
done

echo -e "  ${GREEN}✓${NC} Files synced to workspace"
echo ""

# Step 5: Deploy the app code
echo -e "${YELLOW}[5/6] Deploying app code...${NC}"
echo -e "  Source: ${BLUE}${WORKSPACE_PATH}${NC}"

databricks apps deploy "${APP_NAME}" --source-code-path "${WORKSPACE_PATH}" 2>&1 | while read line; do
    echo -e "  ${line}"
done

echo -e "  ${GREEN}✓${NC} App code deployed"
echo ""

# Step 6: Ensure app is running and wait for it
echo -e "${YELLOW}[6/6] Starting app...${NC}"

# Function to get app status using jq or fallback
get_app_status() {
    local json=$(databricks apps get "${APP_NAME}" --output json 2>/dev/null)
    if [ "$HAS_JQ" = true ]; then
        APP_STATE=$(echo "$json" | jq -r '.app_status.state // "UNKNOWN"')
        COMPUTE_STATE=$(echo "$json" | jq -r '.compute_status.state // "UNKNOWN"')
    else
        # Fallback to python for JSON parsing
        APP_STATE=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('app_status',{}).get('state','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")
        COMPUTE_STATE=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('compute_status',{}).get('state','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")
    fi
}

# Get current compute state and start if needed
get_app_status
if [ "$COMPUTE_STATE" != "ACTIVE" ]; then
    echo -e "  Starting app compute..."
    databricks apps start "${APP_NAME}" > /dev/null 2>&1 || true
fi

# Wait for app to be ready
echo -e "  Waiting for app to be ready..."
MAX_WAIT=180
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    get_app_status
    
    if [ "$APP_STATE" = "RUNNING" ]; then
        echo -e "  ${GREEN}✓${NC} App is running!"
        break
    fi
    
    if [ "$APP_STATE" = "DEPLOYING" ] || [ "$COMPUTE_STATE" = "STARTING" ] || [ "$APP_STATE" = "STARTING" ]; then
        echo -e "  Status: App=${APP_STATE}, Compute=${COMPUTE_STATE} (${WAITED}s)"
    elif [ "$APP_STATE" = "DEPLOY_FAILED" ] || [ "$APP_STATE" = "CRASHED" ]; then
        echo -e "  ${RED}✗ Deployment failed: ${APP_STATE}${NC}"
        echo -e "  Check the Databricks Apps UI for logs"
        break
    else
        echo -e "  Status: App=${APP_STATE}, Compute=${COMPUTE_STATE} (${WAITED}s)"
    fi
    
    sleep 10
    WAITED=$((WAITED + 10))
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo -e "  ${YELLOW}⚠ Timed out waiting for app. It may still be starting.${NC}"
fi

echo ""

# Get app URL
APP_URL=$(databricks apps get "${APP_NAME}" --output json | jq -r '.url' 2>/dev/null || databricks apps get "${APP_NAME}" --output json | grep -o '"url":"[^"]*"' | cut -d'"' -f4)

echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Deployment Complete! 🎉            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
echo ""
echo -e "App URL: ${BLUE}${APP_URL}${NC}"
echo ""
echo -e "Useful commands:"
echo -e "  ${BLUE}databricks apps get ${APP_NAME}${NC}              - View app status"
echo -e "  ${BLUE}databricks apps list-deployments ${APP_NAME}${NC} - View deployment history"
echo -e "  ${BLUE}databricks apps stop ${APP_NAME}${NC}             - Stop the app"
echo -e "  ${BLUE}./deploy.sh${NC}                                  - Redeploy"
echo ""

# Open the app in browser (macOS)
if command -v open &> /dev/null; then
    read -p "Open app in browser? [Y/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        open "${APP_URL}"
    fi
fi
