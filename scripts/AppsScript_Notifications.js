/*
 * سكربت نظام إشعارات Expo الخارجي والداخلي المتطور
 * يدعم جمع وتحديث لغة المستخدم فورياً وإرسال الإشعارات بعناوين ثابتة مترجمة
 * متصل مباشرة بالشيت الخاص بك عن طريق الـ ID
 */

const SPREADSHEET_ID = '1kZKjF2KDsGT0HslGSenN-pDTzx4FpX0QDPqX0ZOnriY';
const SHEET_NAME = 'KHMI_NOFICATION';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * دالة الإعداد الأساسية - يتم تشغيلها مرة واحدة يدوياً من المحرر
 */
function setup() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  createSheetIfNotExists(ss);
  createTriggerIfNotExists(ss);
  Logger.log("✅ تم تجهيز الشيت بنجاح وتشغيل نظام المراقبة الفورية!");
}

function createSheetIfNotExists(ss) {
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headers = [
      'device_id',          // 1 (A)
      'hardware_id',        // 2 (B)
      'expo_token',         // 3 (C)
      'status',             // 4 (D)
      'individual_message', // 5 (E)
      'broadcast_message',  // 6 (F)
      'language',           // 7 (G)
      'app_version'         // 8 (H)
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.getRange(1, 1, 1, headers.length).setBackground("#d9edf7");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(5, 250);
    sheet.setColumnWidth(6, 250);
  } else {
    // التأكد من وجود عمود اللغة في حال كان الشيت موجود مسبقا
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headers.indexOf('language') === -1) {
      sheet.getRange(1, 7).setValue('language')
        .setFontWeight("bold").setBackground("#d9edf7");
    }
  }
}

function createTriggerIfNotExists(ss) {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    let triggerExists = false;

    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'handleEditEvent') {
        triggerExists = true;
        break;
      }
    }

    if (!triggerExists) {
      ScriptApp.newTrigger('handleEditEvent')
        .forSpreadsheet(ss)
        .onEdit()
        .create();
    }
  } catch (e) {
    Browser.msgBox("تنبيه: حدث خطأ أثناء إنشاء المشغل تلقائياً بسبب تداخل الحسابات في جوجل. يرجى إضافة المشغل يدوياً من محرر الأكواد.");
  }
}

/**
 * دالة لتنظيف الشيت من الصفوف الفارغة المزعجة التي تسبب القفز لأسفل
 */
function cleanupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  const maxRows = sheet.getMaxRows();

  // البحث عن آخر صف يحتوي فعلياً على بيانات في عمود الـ hardware_id
  const values = sheet.getRange("B:B").getValues();
  let actualLastRow = 1;
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i][0] && String(values[i][0]).trim() !== "") {
      actualLastRow = i + 1;
      break;
    }
  }

  if (maxRows > actualLastRow + 5) {
    sheet.deleteRows(actualLastRow + 1, maxRows - actualLastRow - 1);
  }

  Browser.msgBox("✅ تم تنظيف الشيت. آخر صف نشط هو: " + actualLastRow);
}

/**
 * إضافة قائمة خاصة في الشيت للتحكم السهل
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📨 نظام الإشعارات')
    .addItem('🧹 تنظيف الشيت (حذف الفراغات)', 'cleanupSheet')
    .addItem('⚙️ تشغيل النظام (Setup)', 'setup')
    .addToUi();
}

function handleEditEvent(e) {
  try {
    if (!e || !e.range) return;

    const sheet = e.range.getSheet();
    if (sheet.getName() !== SHEET_NAME) return;

    const row = e.range.getRow();
    const col = e.range.getColumn();
    
    // معالجة القص واللصق (حيث تكون e.value غير معرفة)
    let value = e.value;
    if (value === undefined) {
      value = e.range.getValue();
    }

    if (row <= 1 || !value || value.toString().trim() === "") return;

    // 🎯 إرسال فردي: (individual_message)
    if (col === 5) {
      sheet.getRange(row, 4).setValue("⏳ تجهيز الإرسال الفردي...");
      const token = sheet.getRange(row, 3).getValue();
      const lang = sheet.getRange(row, 7).getValue() || 'ar'; // أخذ اللغة من العمود G
      if (token && token.includes('ExponentPushToken')) {
        sheet.getRange(row, 4).setValue("🚀 جاري الاتصال بـ Expo...");
        const responseStatus = sendExpoPushNotification([{ token: token, lang: lang }], value);
        sheet.getRange(row, 4).setValue("إرسال فردي: " + responseStatus);
      } else {
        sheet.getRange(row, 4).setValue("❌ خطأ: التوكن غير صحيح");
      }
    }

    // 📣 إرسال جماعي: (broadcast_message)
    if (col === 6) {
      sheet.getRange(row, 4).setValue("⏳ تجهيز الإرسال الجماعي...");
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return;

      const dataRange = sheet.getRange(2, 3, lastRow - 1, 5).getValues(); // أعمدة C الى G
      const targets = [];

      for (let i = 0; i < dataRange.length; i++) {
        const t = dataRange[i][0]; // Column C (Token)
        const l = dataRange[i][4] || 'ar'; // Column G (Language)
        if (t && typeof t === 'string' && t.includes('ExponentPushToken')) {
          targets.push({ token: t, lang: l });
        }
      }

      if (targets.length > 0) {
        sheet.getRange(row, 4).setValue("🚀 جاري إرسال للكل (" + targets.length + " جهاز)...");
        const responseStatus = sendExpoPushNotification(targets, value);
        sheet.getRange(row, 4).setValue("إرسال جماعي لـ " + targets.length + " جهاز: " + responseStatus);
      } else {
        sheet.getRange(row, 4).setValue("❌ خطأ: لا يوجد توكنات مسجلة");
      }
    }
  } catch (error) {
    // التقاط أي خطأ برمجي وطباعته في الشيت لمعرفة السبب
    if (e && e.range) {
      e.range.getSheet().getRange(e.range.getRow(), 4).setValue("⚠️ خطأ سكربت: " + error.toString());
    }
  }
}

/**
 * عناوين الإشعارات مترجمة حسب لغة المستخدم
 */
const NOTIF_TITLES = {
  ar: 'إشعار جديد من ⲭⲏⲙⲓ',
  en: 'New notification from ⲭⲏⲙⲓ',
  fr: 'Nouvelle notification de ⲭⲏⲙⲓ',
  de: 'Neue Benachrichtigung von ⲭⲏⲙⲓ'
};

/**
 * دالة الإرسال إلى سيرفرات Expo مباشرة مع تحديد اللغة
 */
function sendExpoPushNotification(targets, message) {
  if (!targets || !Array.isArray(targets) || targets.length === 0) {
    return "خطأ: فشل قراءة التوكن / غير صالح";
  }

  const allMessages = [];
  const safeMessage = String(message || "");

  for (let i = 0; i < targets.length; i++) {
    if (targets[i] && targets[i].token) {
      const userLang = String(targets[i].lang).toLowerCase().trim();
      const localizedTitle = NOTIF_TITLES[userLang] || NOTIF_TITLES['ar'];

      allMessages.push({
        to: String(targets[i].token),
        sound: 'notification.wav',
        title: localizedTitle,
        body: safeMessage,
        priority: 'high',
        badge: 1,
        channelId: 'default',
        data: {
          message: safeMessage,
          type: 'internal_external'
        },
      });
    }
  }

  if (allMessages.length === 0) return "خطأ: التوكنات فارغة";

  // تكسير الرسائل إلى مجموعات (Chunks) بحد أقصى 100 لكل طلب
  // هذا يحل مشكلة الخطأ: "$": String must contain at most 100 character(s)
  const CHUNK_SIZE = 100;
  let successCount = 0;
  let failCount = 0;
  let lastError = "";

  for (let i = 0; i < allMessages.length; i += CHUNK_SIZE) {
    const chunk = allMessages.slice(i, i + CHUNK_SIZE);

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(chunk),
      muteHttpExceptions: true
    };

    try {
      const response = UrlFetchApp.fetch(EXPO_PUSH_URL, options);
      const result = JSON.parse(response.getContentText());

      if (result && result.errors) {
        failCount += chunk.length;
        lastError = result.errors[0]?.message || "خطأ مجهول";
      } else if (result && result.data) {
        let chunkSuccess = 0;
        let chunkFail = 0;
        for (let j = 0; j < result.data.length; j++) {
          if (result.data[j].status === 'error') {
            chunkFail++;
            lastError = result.data[j].message || "خطأ بالتوكن";
          } else {
            chunkSuccess++;
          }
        }
        successCount += chunkSuccess;
        failCount += chunkFail;
      } else {
        successCount += chunk.length;
      }
    } catch (error) {
      failCount += chunk.length;
      lastError = "خطأ بالاتصال بالسيرفر";
    }
  }

  if (failCount === 0 && successCount > 0) {
    return "تم النجاح (" + successCount + " جهاز)";
  } else if (successCount > 0 && failCount > 0) {
    return "نجاح جزئي: تم لـ " + successCount + " وفشل " + failCount + " (" + lastError + ")";
  } else if (failCount > 0) {
    return "فشل: " + lastError;
  } else {
    return "فشل: لم يتم الإرسال";
  }
}

/**
 * دالة POST التي سيقوم تطبيقك بإرسال بيانات المستخدم إليها عند فتحه أو تغيير لغته مباشرة
 */
function doPost(e) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  createSheetIfNotExists(ss);
  const sheet = ss.getSheetByName(SHEET_NAME);

  try {
    const data = JSON.parse(e.postData.contents);
    const hardwareId = String(data.hardware_id || '').trim();

    if (!hardwareId) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Missing hardware_id" })).setMimeType(ContentService.MimeType.JSON);
    }

    // 1️⃣ التحقق من حالة التوكن (Action: verify)
    if (data.action === "verify") {
      const expoToken = String(data.expo_token || '').trim();
      const dataRange = sheet.getDataRange().getValues();
      
      for (let i = dataRange.length - 1; i >= 1; i--) {
        if (String(dataRange[i][1]).trim() === hardwareId) {
          const rowToken = String(dataRange[i][2]).trim();
          const matches = rowToken === expoToken && expoToken !== 'no_token' && expoToken !== '';
          return ContentService.createTextOutput(JSON.stringify({ 
            status: "success", 
            exists: true, 
            matches: matches,
            sheetToken: rowToken 
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success", exists: false })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2️⃣ عملية التسجيل أو التحديث الكامل (Action: register)
    if (data.action === "register") {
      const deviceId = data.device_id || '';
      const expoToken = String(data.expo_token || '').trim();
      const language = data.language || 'ar';
      const appVersion = data.app_version || '';

      const dataRange = sheet.getDataRange().getValues();
      let rowsDeleted = 0;

      // الحل الجذري: حذف أي صفوف متكررة لنفس الـ hardware_id قبل البدء لضمان وجود صف واحد فقط
      for (let i = dataRange.length - 1; i >= 1; i--) {
        if (String(dataRange[i][1]).trim() === hardwareId) {
          sheet.deleteRow(i + 1);
          rowsDeleted++;
        }
      }

      // إضافة الجهاز كصف جديد تماماً
      let targetRow = sheet.getLastRow() + 1;
      sheet.getRange(targetRow, 1, 1, 8).setValues([[
        deviceId,
        hardwareId,
        expoToken || 'no_token',
        'مزامنة جذرية: ' + new Date().toLocaleString('ar-EG'),
        '',
        '',
        language,
        appVersion
      ]]);

      return ContentService.createTextOutput(JSON.stringify({ 
        status: "success", 
        action: "cleaned_and_inserted", 
        deleted: rowsDeleted,
        row: targetRow 
      })).setMimeType(ContentService.MimeType.JSON);
    }

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

// للتحقق فقط
function doGet(e) {
  return ContentService.createTextOutput("Notification System is Online (With Advanced Localization)");
}
