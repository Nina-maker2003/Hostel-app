const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const nodemailer = require('nodemailer');
require('dotenv').config();

const CREDENTIALS_PATH = path.resolve(__dirname, '../credentials.json');
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

// メール送信用のトランスポーター設定
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
});

// Google Sheets APIクライアントの初期化
async function getAuthClient() {
  const auth = new GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth.getClient();
}

async function getSheetsClient() {
  const authClient = await getAuthClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

// テスト接続用関数
async function testConnection() {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID
    });
    return { success: true, title: response.data.properties.title };
  } catch (error) {
    console.error('Connection test failed:', error.message);
    throw new Error('Failed to connect to Google Sheets API');
  }
}

// 日本語テキスト正規化関数
function normalizeJapaneseText(text) {
  if (!text) return '';
  
  // 全角→半角変換 (カタカナは対象外)
  const normalized = text
    .replace(/[！-～]/g, function(s) {
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    })
    .replace(/　/g, ' '); // 全角スペース→半角スペース
  
  return normalized;
}

// パスワード取得
async function getPassword() {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: '裏口パスワード!A1',
    });
    
    return response.data.values[0][0];
  } catch (error) {
    console.error('Error getting password:', error.message);
    throw error;
  }
}

// ゲスト認証
async function verifyGuest(name, roomNumber) {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'シート1!A:K',
    });

    const rows = response.data.values;
    const now = new Date();
    
    // 入力された名前を正規化
    const normalizedInputName = normalizeJapaneseText(name).toLowerCase().replace(/\s+/g, '');
    const trimmedInputRoom = roomNumber.toString().trim().toUpperCase();

    // ヘッダー行をスキップ
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      // GASコードでの列の割り当てに合わせる
      // A:予約番号, C:予約者名, D:部屋番号, E:C/I, F:C/O, K:ステータス
      const currentName = String(row[2] || '');    // C列 (インデックス2)
      const currentRoomNumber = row[3];           // D列 (インデックス3)
      const checkInDate = row[4];                 // E列 (インデックス4)
      const checkOutDate = row[5];                // F列 (インデックス5)
      const status = row[10];                     // K列 (インデックス10)

      // シートの名前も正規化
      const normalizedCurrentName = normalizeJapaneseText(currentName).toLowerCase().replace(/\s+/g, '');
      const trimmedCurrentRoom = currentRoomNumber.toString().trim().toUpperCase();

      // チェックイン/アウト時刻の調整
      const checkInTime = new Date(checkInDate);
      checkInTime.setHours(15, 0, 0, 0);
      
      const checkOutTime = new Date(checkOutDate);
      checkOutTime.setHours(10, 0, 0, 0);

      if (
        normalizedCurrentName === normalizedInputName &&
        trimmedCurrentRoom === trimmedInputRoom &&
        status?.toString().trim() === '滞在' &&
        now >= checkInTime && now <= checkOutTime
      ) {
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('Error verifying guest:', error.message);
    throw error;
  }
}

// フィードバック保存とメール送信
async function sendFeedback(feedbackText) {
  if (!feedbackText) return false;

  try {
    // フィードバックをスプレッドシートに保存
    const sheets = await getSheetsClient();
    
    // 日本時間の年月日を取得
    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000); // JST = UTC + 9h
    const formattedDate = `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, '0')}-${String(jst.getDate()).padStart(2, '0')}`;
    
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

    // メール送信機能
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
    console.error('Error saving feedback or sending email:', error.message);
    throw error;
  }
}

// 延泊リクエスト保存
async function saveExtendStayRequest(reservationNumber, roomNumber) {
  if (!reservationNumber || !roomNumber) return false;

  try {
    const sheets = await getSheetsClient();
    
    // 日本時間の年月日を取得
    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000); // JST = UTC + 9h
    const formattedDate = `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, '0')}-${String(jst.getDate()).padStart(2, '0')}`;
    
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

    return true;
  } catch (error) {
    console.error('Error saving extend stay request:', error.message);
    throw error;
  }
}

// 延泊パスワードを確認する関数
async function verifyExtendGuest(reservationNumber, roomNumber) {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: '延泊リスト!A:D',
    });
    
    if (!response.data.values || response.data.values.length <= 1) {
      return false;
    }
    
    const rows = response.data.values;
    
    // 入力された値を整形
    const trimmedReservationNumber = reservationNumber.toString().trim();
    const trimmedRoomNumber = roomNumber.toString().trim().toUpperCase();
    
    // ヘッダー行をスキップ
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      // B:予約番号, C:部屋番号, D:新パスワード
      const currentReservationNumber = row[1] ? row[1].toString().trim() : '';
      const currentRoomNumber = row[2] ? row[2].toString().trim().toUpperCase() : '';
      
      if (currentReservationNumber === trimmedReservationNumber && 
          currentRoomNumber === trimmedRoomNumber) {
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('Error verifying extend guest:', error.message);
    throw error;
  }
}

// 延泊パスワードを取得する関数
async function getExtendPassword(reservationNumber, roomNumber) {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: '延泊リスト!A:D',
    });
    
    if (!response.data.values || response.data.values.length <= 1) {
      return "パスワードが見つかりません"; // "Password not found"
    }
    
    const rows = response.data.values;
    
    // 入力された値を整形
    const trimmedReservationNumber = String(reservationNumber).trim();
    const trimmedRoomNumber = String(roomNumber).trim().toUpperCase();
    
    console.log(`Searching for reservation: ${trimmedReservationNumber}, room: ${trimmedRoomNumber}`);
    
    // ヘッダー行をスキップ
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      
      // 行に十分な列がない場合はスキップ
      if (!row || row.length < 3) continue;
      
      // B:予約番号, C:部屋番号, D:新パスワード
      const currentReservationNumber = row[1] ? String(row[1]).trim() : '';
      const currentRoomNumber = row[2] ? String(row[2]).trim().toUpperCase() : '';
      
      console.log(`Checking row ${i}: reservation=${currentReservationNumber}, room=${currentRoomNumber}`);
      
      if (currentReservationNumber === trimmedReservationNumber && 
          currentRoomNumber === trimmedRoomNumber) {
        // パスワードが存在するか確認
        const password = row.length > 3 && row[3] ? row[3] : "パスワードが設定されていません";
        console.log(`Found match! Password: ${password}`);
        return password;
      }
    }
    console.log("No matching entry found");
    return "パスワードが見つかりません"; // "Password not found"
  } catch (error) {
    console.error('Error getting extend password:', error.message);
    throw error;
  }
}

module.exports = {
  testConnection,
  getPassword,
  verifyGuest,
  sendFeedback,
  saveExtendStayRequest,
  verifyExtendGuest,
  getExtendPassword
};