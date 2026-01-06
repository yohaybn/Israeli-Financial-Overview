
import crypto from 'crypto';
import fs from 'fs';

const ALGORITHM = 'aes-256-cbc';

export function encrypt(text, password) {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(password, 'salt', 32);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return { iv: iv.toString('hex'), content: encrypted };
}

export function decrypt(encryptedData, password) {
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const key = crypto.scryptSync(password, 'salt', 32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedData.content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

export function saveEncryptedCredentials(filePath, credentials, password) {
    const encrypted = encrypt(JSON.stringify(credentials), password);
    fs.writeFileSync(filePath, JSON.stringify(encrypted, null, 2));
}

export function loadEncryptedCredentials(filePath, password) {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const encrypted = JSON.parse(fileContent);
    const decryptedString = decrypt(encrypted, password);
    return JSON.parse(decryptedString);
}
