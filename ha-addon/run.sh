#!/bin/bash
set -e

CONFIG_PATH=/data/options.json
echo "Starting Bank Scraper Add-on..."

if [ -f "$CONFIG_PATH" ]; then
    echo "Reading config from $CONFIG_PATH"
    
    # helper to export if key exists and is not null
    export_json_key() {
        local key=$1
        local env_var=$2
        local val=$(jq --raw-output ".$key // empty" $CONFIG_PATH)
        if [ ! -z "$val" ]; then
            echo "Setting $env_var"
            export "$env_var"="$val"
        fi
    }

    export_json_key "oauth_client_id" "OAUTH_CLIENT_ID"
    export_json_key "oauth_client_secret" "OAUTH_CLIENT_SECRET"
    export_json_key "oauth_redirect_uri" "OAUTH_REDIRECT_URI"
    export_json_key "drive_folder_id" "DRIVE_FOLDER_ID"
    export_json_key "app_secret" "APP_SECRET"
    
    # Handle nested or complex objects if necessary, or just rely on simple keys
    # For settings.json, we can allow passing it as a raw string or construct it
fi

# Start the application
cd /usr/src/app
npm start
