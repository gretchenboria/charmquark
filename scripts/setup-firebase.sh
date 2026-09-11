#!/bin/bash
set -e

echo "========================================================="
echo " 🔥 Automating Firebase Setup for CharmQuark"
echo "========================================================="

echo "1. Logging into Firebase (this will open your browser)..."
npx -y firebase-tools@latest login

PROJECT_ID="cq-app-$(date +%s)"
echo -e "\n2. Creating new Firebase Project: $PROJECT_ID"
echo "(If this fails, you may need to visit console.firebase.google.com first to accept the Terms of Service)"
npx -y firebase-tools@latest projects:create $PROJECT_ID --display-name "CharmQuark"

echo -e "\n3. Registering Web App..."
APP_INFO=$(npx -y firebase-tools@latest apps:create WEB charmquark-web --project $PROJECT_ID --json)
APP_ID=$(echo $APP_INFO | grep -o '"appId":"[^"]*' | cut -d'"' -f4)

echo -e "\n4. Fetching Web SDK Configuration..."
npx -y firebase-tools@latest apps:sdkconfig WEB $APP_ID --project $PROJECT_ID

echo -e "\n========================================================="
echo " ✅ Setup Complete!"
echo " Copy the config values above into Cloudflare Pages!"
echo " NOTE: You still need to enable Google SSO in the Firebase Console manually."
echo "========================================================="
