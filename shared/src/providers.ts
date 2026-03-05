import { ProviderDefinition } from './types';

// Based on https://github.com/eshaham/israeli-bank-scrapers/blob/master/src/definitions.ts
export const PROVIDERS: ProviderDefinition[] = [
    {
        id: 'hapoalim',
        name: 'Bank Hapoalim',
        nameHe: 'בנק הפועלים',
        credentialFields: [
            { name: 'userCode', label: 'User Code', labelHe: 'קוד משתמש', type: 'text', required: true },
            { name: 'password', label: 'Password', labelHe: 'סיסמה', type: 'password', required: true },
        ],
    },
    {
        id: 'leumi',
        name: 'Bank Leumi',
        nameHe: 'בנק לאומי',
        credentialFields: [
            { name: 'username', label: 'Username', labelHe: 'שם משתמש', type: 'text', required: true },
            { name: 'password', label: 'Password', labelHe: 'סיסמה', type: 'password', required: true },
        ],
    },
    {
        id: 'mizrahi',
        name: 'Mizrahi Bank',
        nameHe: 'בנק מזרחי',
        credentialFields: [
            { name: 'username', label: 'Username', labelHe: 'שם משתמש', type: 'text', required: true },
            { name: 'password', label: 'Password', labelHe: 'סיסמה', type: 'password', required: true },
        ],
    },
    {
        id: 'discount',
        name: 'Discount Bank',
        nameHe: 'בנק דיסקונט',
        credentialFields: [
            { name: 'id', label: 'ID Number', labelHe: 'מספר תעודת זהות', type: 'text', required: true },
            { name: 'password', label: 'Password', labelHe: 'סיסמה', type: 'password', required: true },
            { name: 'num', label: 'Account Number', labelHe: 'מספר חשבון', type: 'text', required: true },
        ],
    },
    {
        id: 'mercantile',
        name: 'Mercantile Bank',
        nameHe: 'בנק מרכנתיל',
        credentialFields: [
            { name: 'id', label: 'ID Number', labelHe: 'מספר תעודת זהות', type: 'text', required: true },
            { name: 'password', label: 'Password', labelHe: 'סיסמה', type: 'password', required: true },
            { name: 'num', label: 'Account Number', labelHe: 'מספר חשבון', type: 'text', required: true },
        ],
    },
    {
        id: 'otsarHahayal',
        name: 'Bank Otsar Hahayal',
        nameHe: 'בנק אוצר החייל',
        credentialFields: [
            { name: 'username', label: 'Username', labelHe: 'שם משתמש', type: 'text', required: true },
            { name: 'password', label: 'Password', labelHe: 'סיסמה', type: 'password', required: true },
        ],
    },
    {
        id: 'max',
        name: 'Max',
        nameHe: 'מקס',
        credentialFields: [
            { name: 'username', label: 'Username', labelHe: 'שם משתמש', type: 'text', required: true },
            { name: 'password', label: 'Password', labelHe: 'סיסמה', type: 'password', required: true },
        ],
    },
    {
        id: 'visaCal',
        name: 'Visa Cal',
        nameHe: 'ויזה כאל',
        credentialFields: [
            { name: 'username', label: 'Username', labelHe: 'שם משתמש', type: 'text', required: true },
            { name: 'password', label: 'Password', labelHe: 'סיסמה', type: 'password', required: true },
        ],
    },
    {
        id: 'isracard',
        name: 'Isracard',
        nameHe: ' ישראכרט',
        credentialFields: [
            { name: 'id', label: 'ID Number', labelHe: 'מספר תעודת זהות', type: 'text', required: true },
            { name: 'card6Digits', label: 'Last 6 Card Digits', labelHe: '6 ספרות אחרונות של הכרטיס', type: 'text', required: true },
            { name: 'password', label: 'Password', labelHe: 'סיסמה', type: 'password', required: true },
        ],
    },
    {
        id: 'amex',
        name: 'Amex',
        nameHe: 'אמריקן אקספרס',
        credentialFields: [
            { name: 'id', label: 'ID Number', labelHe: 'מספר תעודת זהות', type: 'text', required: true },
            { name: 'card6Digits', label: 'Last 6 Card Digits', labelHe: '6 ספרות אחרונות של הכרטיס', type: 'text', required: true },
            { name: 'password', label: 'Password', labelHe: 'סיסמה', type: 'password', required: true },
        ],
    },
    {
        id: 'union',
        name: 'Union',
        nameHe: 'אגוד',
        credentialFields: [
            { name: 'username', label: 'Username', labelHe: 'שם משתמש', type: 'text', required: true },
            { name: 'password', label: 'Password', labelHe: 'סיסמה', type: 'password', required: true },
        ],
    },
    {
        id: 'beinleumi',
        name: 'Beinleumi',
        nameHe: 'בינלאומי',
        credentialFields: [
            { name: 'username', label: 'Username', labelHe: 'שם משתמש', type: 'text', required: true },
            { name: 'password', label: 'Password', labelHe: 'סיסמה', type: 'password', required: true },
        ],
    },
    {
        id: 'massad',
        name: 'Massad',
        nameHe: 'מסד',
        credentialFields: [
            { name: 'username', label: 'Username', labelHe: 'שם משתמש', type: 'text', required: true },
            { name: 'password', label: 'Password', labelHe: 'סיסמה', type: 'password', required: true },
        ],
    },
    {
        id: 'yahav',
        name: 'Bank Yahav',
        nameHe: 'בנק יהב',
        credentialFields: [
            { name: 'username', label: 'Username', labelHe: 'שם משתמש', type: 'text', required: true },
            { name: 'nationalID', label: 'National ID', labelHe: 'מספר תעודת זהות', type: 'text', required: true },
            { name: 'password', label: 'Password', labelHe: 'סיסמה', type: 'password', required: true },
        ],
    },
    {
        id: 'beyahadBishvilha',
        name: 'Beyahad Bishvilha',
        nameHe: 'ביחד בשבילך',
        credentialFields: [
            { name: 'id', label: 'ID Number', labelHe: 'מספר תעודת זהות', type: 'text', required: true },
            { name: 'password', label: 'Password', labelHe: 'סיסמה', type: 'password', required: true },
        ],
    },
    {
        id: 'oneZero',
        name: 'One Zero',
        nameHe: 'וואן זירו',
        credentialFields: [
            { name: 'email', label: 'Email', labelHe: 'דוא״ל', type: 'text', required: true },
            { name: 'password', label: 'Password', labelHe: 'סיסמה', type: 'password', required: true },
            { name: 'phoneNumber', label: 'Phone Number', labelHe: 'מספר טלפון', type: 'text', required: true, placeholder: '+972...', placeholderHe: '+972...' },
            { name: 'otpLongTermToken', label: 'OTP Long Term Token', labelHe: 'אסימון OTP ארוך טווח', type: 'text', required: false, placeholder: 'Optional - for automated OTP', placeholderHe: 'אופציונלי - ל-OTP אוטומטי' },
        ],
    },
    {
        id: 'behatsdaa',
        name: 'Behatsdaa',
        nameHe: 'בהצדעה',
        credentialFields: [
            { name: 'id', label: 'ID Number', labelHe: 'מספר תעודת זהות', type: 'text', required: true },
            { name: 'password', label: 'Password', labelHe: 'סיסמה', type: 'password', required: true },
        ],
    },
    {
        id: 'pagi',
        name: 'Pagi',
        nameHe: 'פג״י',
        credentialFields: [
            { name: 'username', label: 'Username', labelHe: 'שם משתמש', type: 'text', required: true },
            { name: 'password', label: 'Password', labelHe: 'סיסמה', type: 'password', required: true },
        ],
    },
];
