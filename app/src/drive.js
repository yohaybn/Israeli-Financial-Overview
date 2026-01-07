
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

function enhanceError(err) {
  if (err.message && err.message.includes('Service Accounts do not have storage quota')) {
    err.message += ' [TIP: Use a Shared Drive (Team Drive) folder. Service Accounts have 0 storage quota for personal drives.]';
  }
  return err;
}

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets'
];

function getAuth(authConfig) {
  // 1. Service Account (Path to file)
  if (typeof authConfig === 'string') {
    return new google.auth.GoogleAuth({
      keyFile: authConfig,
      scopes: SCOPES,
    });
  }

  // Normalize: Handle nested 'installed' structure from Google OAuth JSON files
  let normalizedConfig = authConfig;
  if (authConfig.installed) {
    normalizedConfig = {
      client_id: authConfig.installed.client_id,
      client_secret: authConfig.installed.client_secret,
      redirect_uri: authConfig.installed.redirect_uris?.[0] || 'http://localhost:3000/oauth2callback',
      tokens: authConfig.tokens
    };
  } else if (authConfig.redirect_uris) {
    // Flat structure but with redirect_uris array
    normalizedConfig = {
      ...authConfig,
      redirect_uri: authConfig.redirect_uris[0] || 'http://localhost:3000/oauth2callback'
    };
  }

  // 2. OAuth2 Client (Config object with client_id and tokens)
  if (normalizedConfig.client_id && normalizedConfig.tokens) {
    const { client_id, client_secret, redirect_uri, tokens } = normalizedConfig;
    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uri || 'http://localhost:3000/oauth2callback'
    );
    oAuth2Client.setCredentials(tokens);
    return oAuth2Client;
  }

  // 3. Service Account (Credentials object - must have client_email)
  if (authConfig.client_email) {
    return new google.auth.GoogleAuth({
      credentials: authConfig,
      scopes: SCOPES,
    });
  }

  // Fallback error - no valid auth method found
  throw new Error('Invalid auth config: missing tokens for OAuth or client_email for Service Account');
}


// --- OAuth Helpers ---
export function generateAuthUrl(clientId, clientSecret, redirectUri) {
  const oAuth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri || 'http://localhost:3000/oauth2callback'
  );
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline', // Crucial for refresh token
    scope: SCOPES,
    prompt: 'consent' // Force new refresh token
  });
}

export async function getToken(code, clientId, clientSecret, redirectUri) {
  const oAuth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri || 'http://localhost:3000/oauth2callback'
  );
  const { tokens } = await oAuth2Client.getToken(code);
  return tokens;
}

export async function testConnection(authConfig, folderId) {
  try {
    const auth = getAuth(authConfig);
    const drive = google.drive({ version: 'v3', auth });

    // 1. Check List Access
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      pageSize: 1,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });

    // 2. Check Write Access (Upload dummy file)
    const testFileMetadata = {
      name: 'access_test.txt',
      parents: [folderId]
    };
    const media = {
      mimeType: 'text/plain',
      body: 'Test connection'
    };

    const file = await drive.files.create({
      resource: testFileMetadata,
      media: media,
      fields: 'id',
      supportsAllDrives: true
    });

    // 3. Cleanup (Delete dummy file)
    await drive.files.delete({
      fileId: file.data.id,
      supportsAllDrives: true
    });

    return {
      success: true,
      message: `Connection successful! Read & Write access verified. Found ${res.data.files.length} existing file(s).`
    };
  } catch (e) {
    if (e.message && e.message.includes('Service Accounts do not have storage quota')) {
      return {
        success: true,
        message: `Connection Verified (Read-Only). Write failed due to Quota (Personal Account). To upload/save, manually create empty files in the folder and share them with the Service Account email. Found ${res?.data?.files?.length || 0} existing file(s).`
      };
    }
    return { success: false, error: enhanceError(e).message };
  }
}

export async function uploadToDrive(filePath, folderId, authConfig, destinationFilename) {
  try {
    const auth = getAuth(authConfig);
    const drive = google.drive({ version: 'v3', auth });

    const fileName = destinationFilename || path.basename(filePath);

    // Check if file exists to update
    const existing = await drive.files.list({
      q: `name = '${fileName}' and '${folderId}' in parents and trashed = false`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });

    const media = {
      mimeType: fileName.endsWith('.csv') ? 'text/csv' : 'application/json',
      body: fs.createReadStream(filePath)
    };

    if (existing.data.files && existing.data.files.length > 0) {
      console.log(`File '${fileName}' exists. Updating content...`);
      const fileId = existing.data.files[0].id;
      const file = await drive.files.update({
        fileId: fileId,
        media: media,
        fields: 'id',
        supportsAllDrives: true
      });
      console.log('File successfully updated. File Id:', file.data.id);
      return file.data.id;
    }

    const fileMetadata = {
      name: fileName,
      parents: folderId ? [folderId] : [],
    };

    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
      supportsAllDrives: true
    });

    console.log('File successfully uploaded to Drive. File Id:', file.data.id);
    return file.data.id;
  } catch (err) {
    console.error('Error uploading to Drive:', err);
    throw enhanceError(err);
  }
}

export async function addToSheet(rows, folderId, authConfig, filename, append) {
  try {
    const auth = getAuth(authConfig);
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    // Check if file exists
    let spreadsheetId = null;
    let fileExists = false;

    // Exact name match in folder
    const existing = await drive.files.list({
      q: `name = '${filename}' and '${folderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.spreadsheet'`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });

    if (existing.data.files && existing.data.files.length > 0) {
      fileExists = true;
      spreadsheetId = existing.data.files[0].id; // taking the first one
    }

    if (!append || !fileExists) {
      // Create new Sheet
      const resource = {
        properties: { title: filename },
        parents: folderId ? [folderId] : [], // Note: 'parents' in v4 sheets create might not work directly like v3 drive
      };

      // Sheets Create doesn't support parents directly usually, we might need to move it or use drive.files.create with mimeType
      // Better to use Drive API to create the blank sheet or use Sheets API and then move it. 
      // Simplest: Create with Drive API as blank, then update.

      const fileMetadata = {
        name: filename,
        parents: folderId ? [folderId] : [],
        mimeType: 'application/vnd.google-apps.spreadsheet'
      };
      const file = await drive.files.create({
        resource: fileMetadata,
        fields: 'id',
        supportsAllDrives: true
      });
      spreadsheetId = file.data.id;

      // Write Header + Rows
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Sheet1!A1',
        valueInputOption: 'RAW',
        resource: { values: rows }
      });
      return { success: true, type: 'new', id: spreadsheetId };

    } else {
      // Append with Deduplication
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Sheet1!A:Z',
      });
      const existingRows = response.data.values || [];
      let rowsToAppend = rows.slice(1);

      if (existingRows.length > 0) {
        const existingHeader = existingRows[0];
        const newHeader = rows[0];
        const idIndexExisting = existingHeader.indexOf('Identifier');
        const idIndexNew = newHeader.indexOf('Identifier');

        if (idIndexExisting !== -1 && idIndexNew !== -1) {
          const existingIds = new Set(existingRows.map(r => r[idIndexExisting]));
          rowsToAppend = rowsToAppend.filter(r => !existingIds.has(String(r[idIndexNew])));
        }
      }

      if (rowsToAppend.length > 0) {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'Sheet1!A1',
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          resource: { values: rowsToAppend }
        });
      }
      return { success: true, type: 'append', id: spreadsheetId, appendedCount: rowsToAppend.length };
    }
  } catch (err) {
    console.error('Error updating Sheet:', err);
    throw enhanceError(err);
  }
}

export async function updateSheetCategory(description, newCategory, folderId, authConfig) {
  try {
    const auth = getAuth(authConfig);
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    // 1. Find all spreadsheets in the folder
    console.log(`[Drive] Searching for sheets to update category for: "${description}" -> "${newCategory}"`);
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.spreadsheet'`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });

    const files = res.data.files;
    if (!files || files.length === 0) {
      console.log('[Drive] No sheets found to update.');
      return 0;
    }

    let updatedCount = 0;

    // 2. Iterate and update
    for (const file of files) {
      try {
        const spreadsheetId = file.id;

        // Get Header and Data
        const rangeRes = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'Sheet1!A:Z', // Assuming Sheet1
        });

        const rows = rangeRes.data.values;
        if (!rows || rows.length < 2) continue; // No data

        const header = rows[0];
        const descIdx = header.indexOf('Description');
        const catIdx = header.indexOf('Category');

        if (descIdx === -1 || catIdx === -1) continue; // Columns not found

        let sheetUpdates = [];

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (row[descIdx] === description) {
            // UPDATE even if it's the same? No, only if different.
            if (row[catIdx] !== newCategory) {
              // Found a match that needs updating
              // We use A1 notation for update. Row is i+1 (0-based) -> i+1 (1-based)
              const range = `Sheet1!${String.fromCharCode(65 + catIdx)}${i + 1}`;
              sheetUpdates.push({
                range,
                values: [[newCategory]]
              });
            }
          }
        }

        if (sheetUpdates.length > 0) {
          // Batch UPDATE
          const data = sheetUpdates.map(u => ({
            range: u.range,
            values: u.values
          }));

          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            resource: {
              valueInputOption: 'RAW',
              data: data
            }
          });
          console.log(`[Drive] Updated ${sheetUpdates.length} rows in "${file.name}"`);
          updatedCount++;
        }

      } catch (err) {
        console.error(`[Drive] Failed to examine/update sheet "${file.name}":`, err.message);
      }
    }

    return updatedCount;
  } catch (err) {
    console.error('[Drive] Error in updateSheetCategory:', err);
    throw enhanceError(err);
  }
}