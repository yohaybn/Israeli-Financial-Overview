#!/bin/bash
set -e

CONFIG_PATH=/data/options.json
echo "Starting Financial Overview Add-on..."

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
    export_json_key "google_api_key" "GEMINI_API_KEY"
    
fi

# Start the application
# DATA_DIR is /data by default in Dockerfile, which is the HA persistent partition
# Exit 42 = graceful restart (see ConfigService.restart); loop so the add-on does not exit.
cd /usr/src/app
set +e
while true; do
    node server/dist/index.js
    ec=$?
    if [ "$ec" -eq 42 ]; then
        echo "Restart requested, restarting..."
        continue
    fi
    exit "$ec"
done
