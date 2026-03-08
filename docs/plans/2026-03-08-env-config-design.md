# Design: Environment Configuration and Profile Saving Fix

## Goal
Add an option to configure environment data from the UI and ensure the user is notified of errors when saving profiles with an invalid encryption key.

## Proposed Changes

### 1. Server-Side: Environment Configuration API
- **New Service**: `server/src/services/configService.ts`
    - `getEnv()`: Reads variables from `.env`.
    - `updateEnv(vars)`: Writes variables to `.env`.
    - `restartServer()`: Triggers a server restart by calling `process.exit(0)`.
- **New Route**: `server/src/routes/configRoutes.ts`
    - `GET /api/config/env`: Returns current (masked) environment variables.
    - `POST /api/config/env`: Updates the `.env` file.
    - `POST /api/config/restart`: Restarts the server.
- **Update `index.ts`**: Register the new routes.

### 2. Client-Side: Environment Configuration UI
- **New Component**: `client/src/components/EnvironmentSettings.tsx`
    - A form to edit:
        - `GEMINI_API_KEY` (masked)
        - `GOOGLE_CLIENT_ID`
        - `GOOGLE_CLIENT_SECRET` (masked)
        - `GOOGLE_REDIRECT_URI`
        - `ENCRYPTION_KEY` (64-character hex string)
        - `PORT`
        - `DATA_DIR`
    - A "Save and Restart Server" button.
- **Update `ConfigurationPanel.tsx`**: Add an "Environment" tab to include `EnvironmentSettings`.

### 3. Profile Saving Bug Fix
- **Update `client/src/hooks/useProfiles.ts`**: Add `onError` callbacks to mutations to handle server errors.
- **Update `client/src/components/ProfileManager.tsx`**: Add a visual notification (e.g., using `alert` or a toast) when `handleSaveProfile` fails.

## Verification Plan

### Automated Tests
- No automated tests planned for UI changes, but manual verification will be thorough.

### Manual Verification
1. **Profile Saving**:
    - Purposely set a short or invalid `ENCRYPTION_KEY` on the server and try to save a profile.
    - Verify that an error message is displayed to the user.
2. **Environment Configuration**:
    - Update a variable (e.g., `PORT`) via the new UI.
    - Click "Save and Restart".
    - Verify that the server restarts and the new setting is applied (after manually updating the URL if the port changed).
3. **Variable Masking**:
    - Verify that sensitive variables (keys, secrets) are masked in the UI.

## Questions for User
1. **Editable Variables**: Is there any other environment variable you'd like to be able to edit from the UI?
2. **Restart Mechanism**: Is `process.exit(0)` appropriate for your setup? (e.g., are you using Docker with `restart: always`?)
3. **Encryption Key**: Would you like the UI to offer an "Auto-generate" button for the `ENCRYPTION_KEY` (64 hex characters)?
