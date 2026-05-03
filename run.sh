#!/command/with-contenv sh
set -e

CONFIG_PATH=/data/options.json
echo "Starting Financial Overview Add-on..."

if [ -f "$CONFIG_PATH" ]; then
    echo "Reading config from $CONFIG_PATH"

    export_json_key() {
        key=$1
        env_var=$2
        val=$(jq --raw-output ".$key // empty" "$CONFIG_PATH")
        if [ -n "$val" ]; then
            echo "Setting $env_var"
            export "$env_var=$val"
        fi
    }

    export_json_key "google_client_id" "GOOGLE_CLIENT_ID"
    export_json_key "google_client_secret" "GOOGLE_CLIENT_SECRET"
    export_json_key "google_redirect_uri" "GOOGLE_REDIRECT_URI"
    export_json_key "drive_folder_id" "DRIVE_FOLDER_ID"
    export_json_key "gemini_api_key" "GEMINI_API_KEY"
    export_json_key "telegram_bot_token" "TELEGRAM_BOT_TOKEN"
    export_json_key "eodhd_api_token" "EODHD_API_TOKEN"

fi

# Home Assistant: Supervisor proxies Ingress to `ingress_port` in ha-addon/config.yaml (default 9203). The
# app must listen on that port. Force here so a data volume with runtime-settings (PORT=3000 from
# a plain Docker run) or a base image with PORT=3000 cannot make the add-on UI unreachable.
export PORT=9203
# Persist on the HA data volume; runtime-settings.json must not override with ./data (wrong cwd).
export DATA_DIR=/data
export DATA_DIR_STICKY=1
export NODE_ENV=production

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
