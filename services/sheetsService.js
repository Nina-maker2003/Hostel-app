const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Spreadsheet configuration
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

// Configure email transporter（メール送信者の設定）
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
});

// Get credentials - either from file or environment variables
async function getAuthClient() {
  try {
    // Path to credentials file
    const CREDENTIALS_PATH = path.resolve(__dirname, '../credentials.json');
    
    let auth;
    
    // Check if credentials file exists
    if (fs.existsSync(CREDENTIALS_PATH)) {
      // Use credentials file (works for local development)
      auth = new GoogleAuth({
        keyFile: CREDENTIALS_PATH,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    } else {
      // For render.com: use environment variable or JSON string
      // You would need to set GOOGLE_CREDENTIALS as an environment variable in render.com
      // containing the entire credentials JSON as a string
      const credentials = process.env.GOOGLE_CREDENTIALS ? 
                         JSON.parse(process.env.GOOGLE_CREDENTIALS) : 
                         null;
                         
      if (!credentials) {
        throw new Error('No credentials found - set GOOGLE_CREDENTIALS env variable or provide credentials.json');
      }
      
      auth = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    }
    
    return auth.getClient();
  } catch (error) {
    console.error('Authentication error:', error);
    throw error;
  }
}

// Get Google Sheets client
async function getSheetsClient() {
  try {
    const authClient = await getAuthClient();
    return google.sheets({ version: 'v4', auth: authClient });
  } catch (error) {
    console.error('Error getting sheets client:', error);
    throw error;
  }
}

// Test connection function
async function testConnection() {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID
    });
    return { success: true, title: response.data.properties.title };
  } catch (error) {
    console.error('Connection test failed:', error);
    throw new Error(`Failed to connect to Google Sheets API: ${error.message}`);
  }
}


// Japanese text normalization
function normalizeJapaneseText(text) {
  if (!text) return '';
  
  // Convert full-width to half-width (except katakana)
  const normalized = text
    .replace(/[！-～]/g, function(s) {
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    })
    .replace(/　/g, ' '); // Full-width space to half-width
  
  return normalized;
}

// Get password
async function getPassword() {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: '裏口パスワード!A1',
    });
    
    return response.data.values[0][0];
  } catch (error) {
    console.error('Error getting password:', error);
    throw error;
  }
}

// Verify guest
async function verifyGuest(reservationNumber, roomNumber) {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'シート1!A:K',
    });

    const rows = response.data.values;
    const now = new Date();
    
    
     // Process input reservation number (trim spaces)
     const inputReservationNumber = reservationNumber.toString().trim();
    const trimmedInputRoom = roomNumber.toString().trim().toUpperCase();

// Skip header row
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const currentReservationFull = String(row[0] || '');  // Column A (index 0)
  const currentRoomNumber = row[3];                    // Column D (index 3)
  const checkInDate = row[4];                         // Column E (index 4)
  const checkOutDate = row[5];                        // Column F (index 5)
  const status = row[10];                             // Column K (index 10)

  // Process current reservation based on format rules（inntoと実際の予約番号のズレを修正）)
  let currentReservationFormatted = '';
  
  // Rule 1: If it contains "_", remove everything after "_"
  if (currentReservationFull.includes('_')) {
    currentReservationFormatted = currentReservationFull.split('_')[0];
  } 
  // Rule 2: If it doesn't contain "_" but has "-", remove everything after the last "-"
  else {
    // Find the last "-" in the string
    const lastDashIndex = currentReservationFull.lastIndexOf('-');
    if (lastDashIndex !== -1) {
      currentReservationFormatted = currentReservationFull.substring(0, lastDashIndex);
    } else {
      // No "_" or "-", use as is
      currentReservationFormatted = currentReservationFull;
    }
  }
  
  const trimmedCurrentRoom = currentRoomNumber.toString().trim().toUpperCase();

  // Adjust check-in/out times
  const checkInTime = new Date(checkInDate);
  checkInTime.setHours(15, 0, 0, 0);
  
  const checkOutTime = new Date(checkOutDate);
  checkOutTime.setHours(10, 0, 0, 0);

  if (
    currentReservationFormatted === inputReservationNumber &&
    trimmedCurrentRoom === trimmedInputRoom &&
    status?.toString().trim() === '滞在' &&
    now >= checkInTime && now <= checkOutTime
  ) {
    return true;
  }
}
return false;
} catch (error) {
console.error('Error verifying guest:', error);
throw error;
}
}

// Save extend stay request
async function saveExtendStayRequest(reservationNumber, roomNumber) {
  if (!reservationNumber || !roomNumber) return false;

  try {
    const sheets = await getSheetsClient();

    // Get date in JST with time
    const now = new Date();
    const jst = new Date(
       now.toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        hour12: false
  })
);

const formattedDate = 
  `${jst.getFullYear()}/` +
  `${String(jst.getMonth() + 1).padStart(2, '0')}/` +
  `${String(jst.getDate()).padStart(2, '0')} ` +
  `${String(jst.getHours()).padStart(2, '0')}:` +
  `${String(jst.getMinutes()).padStart(2, '0')}`;

// Extend Stay Requestデバッグ用ログ
console.log('Formatted Date:', formattedDate);

    const newRow = [
      formattedDate,
      reservationNumber,
      roomNumber
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: '延泊リスト!A:C',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: [newRow] }
    });
     // メール送信を追加
     const subject = '延泊リクエストが送信されました';
     const body = `以下の延泊リクエストが送信されました：\n\nメールアドレス: ${reservationNumber}\n部屋番号: ${roomNumber}\n\n送信日時: ${formattedDate}`;
 
     console.log('Extend Stay - Attempting to send email...');
     try {
       await transporter.sendMail({
         from: EMAIL_USER,
         to: "tcuyoyusei@gmail.com",
         subject: subject,
         text: body
       });
       console.log('Extend Stay - Email sent successfully');
     } catch (emailError) {
       console.error('Extend Stay - Error sending email:', emailError);
       // Still return true since the spreadsheet update was successful
     }    
     return true;
  } catch (error) {
    console.error('Error saving extend stay request:', error);
    throw error;
  }
}

// Save feedback and send email
async function sendFeedback(feedbackText) {
  if (!feedbackText) return false;

  try {
    // Save feedback to spreadsheet
    const sheets = await getSheetsClient();

    // Get date in JST with time
const now = new Date();
const jst = new Date(
  now.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour12: false
  })
);

const formattedDate = 
  `${jst.getFullYear()}/` +
  `${String(jst.getMonth() + 1).padStart(2, '0')}/` +
  `${String(jst.getDate()).padStart(2, '0')} ` +
  `${String(jst.getHours()).padStart(2, '0')}:` +
  `${String(jst.getMinutes()).padStart(2, '0')}`;

// デバッグ用ログ
console.log('Formatted Date:', formattedDate);
    const newRow = [
      formattedDate,
      feedbackText
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'フィードバック!A:B',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: [newRow] }
    });

    // Send email
    const subject = '裏口パスワードアプリのフィードバック';
    const body = `以下のフィードバックが送信されました：\n\n${feedbackText}\n\n送信日時: ${formattedDate}`;

    await transporter.sendMail({
      from: EMAIL_USER,
      to: "tcuyoyusei@gmail.com",
      subject: subject,
      text: body
    });

    return true;
  } catch (error) {
    console.error('Error saving feedback or sending email:', error);
    throw error;
  }
}


module.exports = {
  testConnection,
  getPassword,
  verifyGuest,
  sendFeedback,
  saveExtendStayRequest,
};