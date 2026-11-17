/**
 * ==========================================
 * KHMI - نظام متكامل (نسخة مدمجة مع التدريبات والأسماء)
 * ==========================================
 */

const TRK_MAIN_SHEET    = "Dic";
const TRK_USERS_SHEET   = "KHMI_Users";
const TRK_ACTIVITY_SHEET = "KHMI_Activity";
const TRK_BACKUP_SHEET  = "KHMI_Backup";
// الإضافات الجديدة
const TRK_NAMES_SHEET   = "KHMI_Names";
const TRK_TRAINING_SHEET = "KHMI_Training";
const TRK_LESSONS_SHEET = "KHMI_LessonViews";
const TRK_EXAMS_SHEET   = "KHMI_ExamSubmissions";
const TRK_DOWNLOADS_SHEET = "KHMI_Downloads";
const TRK_NOTIFS_SHEET  = "KHMI_NotifClicks";
const TRK_SHARES_SHEET  = "KHMI_AppShares";
const TRK_SEARCH_LOG_SHEET = "KHMI_SearchQueries";
const TRK_ERRORS_SHEET   = "KHMI_Errors";
const TRK_SETTINGS_SHEET = "KHMI_Settings";
const TRK_NAV_SHEET      = "KHMI_Navigation";
const TRK_SESSIONS_SHEET = "KHMI_Sessions";
const TRK_SYNC_LOGS_SHEET = "KHMI_SyncLogs";
const TRK_MEDIA_SHEET    = "KHMI_MediaInteractions";
const TRK_ENGAGEMENT_SHEET = "KHMI_UserEngagement";
const TRK_SECURITY_SHEET = "KHMI_SecurityEvents";
const TRK_PERFORMANCE_SHEET = "KHMI_PerformanceLogs";
const NOTIFICATION_SHEET_NAME = "KHMI_NOFICATION";
const ADMIN_LOGS_SHEET_NAME = "ADMIN_LOGS";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const NOTIF_TITLES = { 
  ar: 'إشعار جديد من ⲭⲏⲙⲓ', 
  en: 'New notification from ⲭⲏⲙⲓ', 
  fr: 'Nouvelle notification de ⲭⲏⲙⲓ', 
  de: 'Neue Benachrichtigung von ⲭⲏⲙⲓ' 
};

// ───────────────────────────────────────────────────────────────────
// 1. doGet و doPost (تم حذف دوال الإشعارات)
// ───────────────────────────────────────────────────────────────────

function doGet(e) {
  try {
    ensureAllSheetsExist();
    const action = e.parameter.action;
    
    // إحصائيات وأدوات لوحة التحكم
    if (action === "getAdminStats") return getAdminStats();
    if (action === "getAppConfig") return getAppConfig();
    if (action === "getUser") return getUserByHardwareId({ hardwareId: e.parameter.hardwareId });
    if (action === "getUserData") return getUserData({ deviceId: e.parameter.deviceId });
    if (action === "ping") return createResponse({ success: true, message: "KHMI Unified Backend is alive!" });
    
    // دروس وامتحانات (توجيه للوظائف المدمجة)
    if (action === "getLessons") return handleGetLessons();
    if (action === "getQuestions") return handleGetQuestions(e.parameter.url);
    if (action === "getValidCodes") return handleGetValidCodes();
    if (action === "getPrerequisiteCodes") return handleGetPrerequisiteCodes(e.parameter.lessonNum, e.parameter.level);
    if (action === "checkFinalExamCode") return handleCheckFinalExamCode(e.parameter.code, e.parameter.level);
    if (action === "getFinalExamCredentials") return getFinalExamCredentials(e.parameter.level);
    if (action === "getCertificate") return handleGetCertificate(e.parameter.code, e.parameter.level);
    if (action === "getAllCertificates") return handleGetAllStatuses(e.parameter.level);
    if (action === "getUserStatus") return handleGetUserStatus(e.parameter.code, e.parameter.level);
    if (action === "getCertificateFullStatus") return handleGetCertificateFullStatus(e.parameter.code, e.parameter.level);
    
    if (action === "getDailyWord") return getDailyWord();
    
    return createResponse({ success: false, error: "Unknown GET action: " + action });
  } catch (err) {
    return createResponse({ success: false, error: err.toString() });
  }
}

function doPost(e) {
  try {
    const cache = CacheService.getScriptCache();
    if (!cache.get("sheets_verified")) {
      ensureAllSheetsExist();
      cache.put("sheets_verified", "true", 3600);
    }

    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    // 1. إدارة المستخدمين والتتبع الأساسي
    if (action === "register") return registerUser(data);
    if (action === "activity") return logActivity(data);
    if (action === "backup") return backupUserData(data);
    if (action === "batchActivities") return batchActivities(data);
    if (action === "updateUserInfo") return updateUserInfo(data);
    if (action === "sendAdminNotification") return handleSendAdminNotification(data);
    
    // 2. تتبع الرؤى المتخصص (للإحصائيات الدقيقة)
    if (action === "search") return logSearch(data);
    if (action === "lesson_view") return logLesson(data);
    if (action === "exam_submit") return logExam(data);
    if (action === "download") return logDownload(data);
    if (action === "share") return logShare(data);

    // 3. لوحة التحكم والتحكم عن بعد
    if (action === "updateAppConfig") return updateAppConfig(data);
    if (action === "executeSystemCommand") return executeSystemCommand(data);
    if (action === "generateCode") return handleGenerateCode(data);
    if (action === "submitExam") return handleSubmitExam(data);
    if (action === "updateDailyWord") return updateDailyWord(data);
    if (action === "clearLogs") return clearLogs();

    return createResponse({ success: false, error: "Unknown POST action: " + action });
  } catch (err) {
    return createResponse({ success: false, error: err.toString() });
  }
}

// ───────────────────────────────────────────────────────────────────
// 2. إنشاء جميع الشيتات (بدون شيت الإشعارات)
// ───────────────────────────────────────────────────────────────────

// دالة مساعدة للتحقق من وجود الشيت وكتابة العناوين إذا نقصت
function verifySheetHeaders(sheetName, expectedHeaders) {
  if (!sheetName) {
    Logger.log("Error: sheetName is undefined!");
    return null;
  }
  if (!expectedHeaders || expectedHeaders.length === 0) {
    Logger.log("Warning: No headers provided for " + sheetName);
    return null;
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(expectedHeaders);
    sheet.getRange("1:1").setFontWeight("bold").setBackground("#f3f3f3");
    return sheet;
  }
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(expectedHeaders);
    sheet.getRange("1:1").setFontWeight("bold").setBackground("#f3f3f3");
    return sheet;
  }
  
  // التحقق من الأعمدة الناقصة وإضافتها في النهاية
  const currentHeaders = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  const missingHeaders = expectedHeaders.filter(h => !currentHeaders.includes(h));
  
  if (missingHeaders.length > 0) {
    let nextCol = sheet.getLastColumn() + 1;
    missingHeaders.forEach(h => {
      sheet.getRange(1, nextCol).setValue(h).setFontWeight("bold").setBackground("#f3f3f3");
      nextCol++;
    });
  }
  return sheet;
}

function ensureAllSheetsExist() {
  // 1. شيت المستخدمين
  verifySheetHeaders(TRK_USERS_SHEET, [
    "device_id", "hardware_id", "first_seen", "last_seen",
    "app_version", "device_model", "total_searches",
    "total_favorites", "total_opens", "total_audio_plays", "total_training",
    "ip_address", "language", "theme", "whatsapp_clicks",
    "facebook_clicks", "telegram_clicks", "offline_synced", "country", "flag", "user_code", "user_name"
  ]);

  // 2. شيت النشاطات
  verifySheetHeaders(TRK_ACTIVITY_SHEET, [
    "timestamp", "device_id", "session_id", "action",
    "word_id", "word_coptic", "word_arabic", "details", "duration_ms", "event_id", "hardware_id", "coptic_date", "user_code", "user_name"
  ]);

  // 3. شيت الأسماء
  verifySheetHeaders(TRK_NAMES_SHEET, [
    "timestamp", "hardware_id", "en_name", "cop_name", "event_id", "coptic_date", "user_code", "user_name"
  ]);

  // 4. شيت التدريبات (جديد)
  verifySheetHeaders(TRK_TRAINING_SHEET, [
    "timestamp", "hardware_id", "training_type", "details", "event_id", "coptic_date", "user_code", "user_name"
  ]);

  // 5. شيت الدروس
  verifySheetHeaders(TRK_LESSONS_SHEET, [
    "timestamp", "hardware_id", "lesson_title", "event_id", "coptic_date", "user_code", "user_name"
  ]);

  // 6. شيت الامتحانات
  verifySheetHeaders(TRK_EXAMS_SHEET, [
    "timestamp", "hardware_id", "exam_details", "result", "event_id", "coptic_date", "user_code", "user_name"
  ]);

  // 7. شيت التحميلات
  verifySheetHeaders(TRK_DOWNLOADS_SHEET, [
    "timestamp", "hardware_id", "details", "event_id", "coptic_date", "user_code", "user_name"
  ]);

  // 8. شيت الإشعارات
  verifySheetHeaders(TRK_NOTIFS_SHEET, [
    "timestamp", "hardware_id", "notif_action", "details", "event_id", "coptic_date", "user_code", "user_name"
  ]);

  // 9. شيت المشاركات
  verifySheetHeaders(TRK_SHARES_SHEET, [
    "timestamp", "hardware_id", "details", "event_id", "coptic_date", "user_code", "user_name"
  ]);

  // 10. شيت البحث
  verifySheetHeaders(TRK_SEARCH_LOG_SHEET, [
    "timestamp", "hardware_id", "query", "results_count", "event_id", "coptic_date", "user_code", "user_name"
  ]);

  // 11. شيت الأخطاء
  verifySheetHeaders(TRK_ERRORS_SHEET, [
    "timestamp", "hardware_id", "error_type", "details", "event_id", "coptic_date", "user_code", "user_name"
  ]);

  // 12. شيت الإعدادات
  verifySheetHeaders(TRK_SETTINGS_SHEET, [
    "timestamp", "hardware_id", "setting_name", "new_value", "event_id", "coptic_date", "user_code", "user_name"
  ]);

  // 13. شيت التنقل
  verifySheetHeaders(TRK_NAV_SHEET, [
    "timestamp", "hardware_id", "screen_name", "event_id", "coptic_date", "user_code", "user_name"
  ]);

  // 14. شيت الجلسات
  verifySheetHeaders(TRK_SESSIONS_SHEET, [
    "timestamp", "hardware_id", "duration_sec", "event_id", "coptic_date", "user_code", "user_name"
  ]);

  // 15. شيت المزامنة
  verifySheetHeaders(TRK_SYNC_LOGS_SHEET, [
    "timestamp", "hardware_id", "sync_action", "items_count", "status", "event_id", "coptic_date", "user_code", "user_name"
  ]);

  // 16. شيت تفاعل الميديا
  verifySheetHeaders(TRK_MEDIA_SHEET, [
    "timestamp", "hardware_id", "action", "media_title", "extra_info", "event_id", "coptic_date", "user_code", "user_name"
  ]);

  // 17. شيت التفاعل العميق
  verifySheetHeaders(TRK_ENGAGEMENT_SHEET, [
    "timestamp", "hardware_id", "engagement_type", "target", "duration_ms", "event_id", "coptic_date", "user_code", "user_name"
  ]);

  // 18. شيت الأمن
  verifySheetHeaders(TRK_SECURITY_SHEET, [
    "timestamp", "hardware_id", "event", "severity", "details", "event_id", "coptic_date", "user_code", "user_name"
  ]);

  // 19. شيت الأداء
  verifySheetHeaders(TRK_PERFORMANCE_SHEET, [
    "timestamp", "hardware_id", "metric", "value", "event_id", "coptic_date", "user_code", "user_name"
  ]);

  // 20. شيت النسخ الاحتياطي
  verifySheetHeaders(TRK_BACKUP_SHEET, ["device_id", "backup_data", "last_backup"]);

  // 21. الشيت الرئيسي
  verifySheetHeaders(TRK_MAIN_SHEET, ["Welcome", "Status"]);
}

// ───────────────────────────────────────────────────────────────────
// 3. الدوال الأساسية
// ───────────────────────────────────────────────────────────────────

function registerUser(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(TRK_USERS_SHEET);
    if (!sheet) return createResponse({ success: false, error: "Users sheet not found" });

    const lastRow = sheet.getLastRow();
    let rowIndex = -1;
    if (lastRow > 0) {
      const deviceIds = sheet.getRange(1, 1, lastRow, 1).getValues();
      for (let i = 0; i < deviceIds.length; i++) {
        if (deviceIds[i][0] === data.deviceId) { rowIndex = i + 1; break; }
      }
    }

    const now = new Date().toISOString();
    const currentIp = data.ip || "";

    if (rowIndex !== -1) {
      // 1. تحديث مستخدم موجود
      sheet.getRange(rowIndex, 4).setValue(now); // last_seen (D)
      
      const currentOpens = Number(sheet.getRange(rowIndex, 9).getValue()) || 0;
      sheet.getRange(rowIndex, 9).setValue(currentOpens + 1); // total_opens (I)
      
      if (data.appVersion) sheet.getRange(rowIndex, 5).setValue(data.appVersion); // app_version (E)
      if (data.deviceModel) sheet.getRange(rowIndex, 6).setValue(data.deviceModel); // device_model (F)
      
      if (currentIp && currentIp !== "unknown") {
        sheet.getRange(rowIndex, 12).setValue(currentIp); // ip_address (L)
        const geoData = getCountryDataFromServer(currentIp);
        if (geoData.name) {
          sheet.getRange(rowIndex, 19).setValue(geoData.name + " " + geoData.emoji); // country (S)
          const flagFormula = '=IMAGE("https://flagcdn.com/w80/' + geoData.code.toLowerCase() + '.png")';
          sheet.getRange(rowIndex, 20).setFormula(flagFormula); // flag (T)
        }
      } else if (data.country && data.country !== "unknown") {
        sheet.getRange(rowIndex, 19).setValue(data.country); // country (S)
      }

      if (data.language) sheet.getRange(rowIndex, 13).setValue(data.language); // language (M)
      if (data.theme !== undefined) sheet.getRange(rowIndex, 14).setValue(data.theme ? "dark" : "light"); // theme (N)
      if (data.offlineSynced !== undefined) sheet.getRange(rowIndex, 18).setValue(data.offlineSynced); // offline_synced (R)
      if (data.userCode) sheet.getRange(rowIndex, 21).setValue(data.userCode); // user_code (U)
      if (data.userName) sheet.getRange(rowIndex, 22).setValue(data.userName); // user_name (V)
      
      return createResponse({ success: true, isNew: false, totalOpens: currentOpens + 1 });
    } else {
      // 2. تسجيل مستخدم جديد
      let realLastRow = 0;
      const colA = sheet.getRange("A:A").getValues();
      for (let i = colA.length - 1; i >= 0; i--) {
        if (colA[i][0] && colA[i][0].toString().trim() !== "") {
          realLastRow = i + 1;
          break;
        }
      }
      
      const targetRow = realLastRow + 1;
      let countryName = data.country || "";
      let flagFormula = "";
      
      if (currentIp && currentIp !== "unknown") {
        const geoData = getCountryDataFromServer(currentIp);
        if (geoData.name) {
          countryName = geoData.name + " " + geoData.emoji;
          flagFormula = '=IMAGE("https://flagcdn.com/w80/' + geoData.code.toLowerCase() + '.png")';
        }
      }

      const rowData = [
        data.deviceId,           // 1: A
        data.hardwareId || "",   // 2: B
        now,                     // 3: C
        now,                     // 4: D
        data.appVersion || "1.0.0", // 5: E
        data.deviceModel || "unknown", // 6: F
        0, 0, 1, 0, 0,           // 7:G, 8:H, 9:I, 10:J, 11:K
        currentIp,               // 12: L
        data.language || "",      // 13: M
        data.theme ? "dark" : "light", // 14: N
        0, 0, 0,                 // 15:O, 16:P, 17:Q
        data.offlineSynced || false, // 18: R
        countryName,             // 19: S
        "",                      // 20: T
        data.userCode || "",     // 21: U
        data.userName || ""      // 22: V
      ];
      
      sheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);
      if (flagFormula) {
        sheet.getRange(targetRow, 20).setFormula(flagFormula);
      }
      return createResponse({ success: true, isNew: true, totalOpens: 1 });
    }
  } catch (err) {
    return createResponse({ success: false, error: err.toString() });
  }
}

function updateUserInfo(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(TRK_USERS_SHEET);
    if (!sheet) return createResponse({ success: false });
    const existingData = sheet.getDataRange().getValues();
    for (let i = 1; i < existingData.length; i++) {
      if (existingData[i][0] === data.deviceId) {
        if (data.language) sheet.getRange(i + 1, 13).setValue(data.language); // language (M)
        if (data.theme !== undefined) sheet.getRange(i + 1, 14).setValue(data.theme ? "dark" : "light"); // theme (N)
        if (data.social) {
          const social = data.social;
          if (social.whatsapp) sheet.getRange(i + 1, 15).setValue((Number(existingData[i][14]) || 0) + 1); // whatsapp (O)
          if (social.facebook) sheet.getRange(i + 1, 16).setValue((Number(existingData[i][15]) || 0) + 1); // facebook (P)
          if (social.telegram) sheet.getRange(i + 1, 17).setValue((Number(existingData[i][16]) || 0) + 1); // telegram (Q)
        }
        if (data.offlineSynced !== undefined) sheet.getRange(i + 1, 18).setValue(data.offlineSynced); // offline_synced (R)
        break;
      }
    }
    return createResponse({ success: true });
  } catch (err) {
    return createResponse({ success: false, error: err.toString() });
  }
}

function batchActivities(data) {
  try {
    const activities = data.activities || [];
    let successCount = 0;
    activities.forEach(act => {
      const res = logActivity(act);
      if (res && res.success) successCount++;
    });
    return createResponse({ success: true, count: successCount });
  } catch (err) {
    return createResponse({ success: false, error: err.toString() });
  }
}

function logActivity(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(TRK_ACTIVITY_SHEET);
    if (!sheet) return createResponse({ success: false });

    // --- منع التكرار باستخدام eventId ---
    const eventId = data.eventId || "";
    if (eventId) {
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        // فحص آخر 500 صف فقط للسرعة
        const startRow = Math.max(2, lastRow - 500);
        const ids = sheet.getRange(startRow, 10, (lastRow - startRow) + 1, 1).getValues();
        for (let i = 0; i < ids.length; i++) {
          if (ids[i][0] === eventId) {
            return createResponse({ success: true, note: "already_exists" });
          }
        }
      }
    }

    const now = new Date().toISOString();
    const cDate = getCopticDate(new Date());
    const action = data.activityAction || data.action || "";
    const hId = data.hardwareId || "";
    
    const uCode = data.userCode || "";
    const uName = data.userName || "";
    
    // 1. Log to specialized sheets based on action
    if (action === "lesson_view") {
      const s = ss.getSheetByName(TRK_LESSONS_SHEET);
      if (s) s.appendRow([now, hId, data.details || "Unknown Lesson", cDate.full, uCode, uName]);
    } else if (action === "exam_submit") {
      const s = ss.getSheetByName(TRK_EXAMS_SHEET);
      if (s) s.appendRow([now, hId, data.details || "Unknown Exam", data.wordCoptic || "No Result", cDate.full, uCode, uName]);
    } else if (action === "download_content") {
      const s = ss.getSheetByName(TRK_DOWNLOADS_SHEET);
      if (s) s.appendRow([now, hId, data.details || "Unknown Content", cDate.full, uCode, uName]);
    } else if (action.startsWith("notif_click")) {
      const s = ss.getSheetByName(TRK_NOTIFS_SHEET);
      if (s) s.appendRow([now, hId, action, data.details || "", cDate.full, uCode, uName]);
    } else if (action === "app_share_attempt") {
      const s = ss.getSheetByName(TRK_SHARES_SHEET);
      if (s) s.appendRow([now, hId, data.details || "unknown", cDate.full, uCode, uName]);
    } else if (action === "search_query") {
      const s = ss.getSheetByName(TRK_SEARCH_LOG_SHEET);
      if (s) s.appendRow([now, hId, data.details || "", data.durationMs || "0", eventId, cDate.full, uCode, uName]);
    } else if (action === "error_event") {
      const s = ss.getSheetByName(TRK_ERRORS_SHEET);
      if (s) s.appendRow([now, hId, data.wordArabic || "Error", data.details || "", cDate.full, uCode, uName]);
    } else if (action === "settings_change") {
      const s = ss.getSheetByName(TRK_SETTINGS_SHEET);
      if (s) s.appendRow([now, hId, data.wordArabic || "setting", data.details || "", cDate.full, uCode, uName]);
    } else if (action === "screen_view") {
      const s = ss.getSheetByName(TRK_NAV_SHEET);
      if (s) s.appendRow([now, hId, data.details || "unknown", cDate.full, uCode, uName]);
    } else if (action === "training_session") {
      const s = ss.getSheetByName(TRK_TRAINING_SHEET);
      if (s) s.appendRow([now, hId, data.details || "Practice", data.wordArabic || "", eventId, cDate.full, uCode, uName]);
    } else if (action === "name_coptic") {
      const s = ss.getSheetByName(TRK_NAMES_SHEET);
      if (s) {
        const lastRow = s.getLastRow();
        let foundRow = -1;
        if (lastRow > 1) {
          const ids = s.getRange(2, 2, lastRow - 1, 1).getValues();
          for (let i = 0; i < ids.length; i++) {
            if (ids[i][0] === hId) {
              foundRow = i + 2;
              break;
            }
          }
        }
        let nameEn = data.wordArabic || data.details || "";
        let nameCop = data.wordCoptic || "";
        
        try {
          if (nameEn.indexOf('{') === 0) {
            const parsed = JSON.parse(nameEn);
            if (parsed.en) nameEn = parsed.en;
            if (parsed.cop) nameCop = parsed.cop;
          }
        } catch(e) {}
        
        const row = [now, hId, nameEn, nameCop, eventId, cDate.full, uCode, uName];
        if (foundRow !== -1) {
          s.getRange(foundRow, 1, 1, row.length).setValues([row]);
        } else {
          s.appendRow(row);
        }
      }
    } else if (action === "session_end") {
      const s = ss.getSheetByName(TRK_SESSIONS_SHEET);
      if (s) s.appendRow([now, hId, Math.floor((data.durationMs || 0) / 1000), cDate.full, uCode, uName]);
    } else if (action.startsWith("offline_sync")) {
      const s = ss.getSheetByName(TRK_SYNC_LOGS_SHEET);
      if (s) s.appendRow([now, hId, action, data.durationMs || 0, data.details || "", cDate.full, uCode, uName]);
    } else if (action.startsWith("video_") || action.startsWith("audio_")) {
      const s = ss.getSheetByName(TRK_MEDIA_SHEET);
      if (s) s.appendRow([now, hId, action, data.wordArabic || "Media", data.details || "", cDate.full, uCode, uName]);
    } else if (action === "modal_open" || action === "list_end_reached" || action === "scroll_depth") {
      const s = ss.getSheetByName(TRK_ENGAGEMENT_SHEET);
      if (s) s.appendRow([now, hId, action, data.details || "", data.durationMs || 0, cDate.full, uCode, uName]);
    } else if (action === "security_alert" || action === "exam_abandoned") {
      const s = ss.getSheetByName(TRK_SECURITY_SHEET);
      if (s) s.appendRow([now, hId, action, "HIGH", data.details || "", cDate.full, uCode, uName]);
    } else if (action === "memory_warning" || action === "network_status" || action === "battery_low" || action === "brightness_high") {
      const s = ss.getSheetByName(TRK_PERFORMANCE_SHEET);
      if (s) {
        const lastRow = s.getLastRow();
        let foundRow = -1;
        if (lastRow > 1) {
          const ids = s.getRange(2, 2, lastRow - 1, 1).getValues();
          for (let i = 0; i < ids.length; i++) {
            if (ids[i][0] === hId) {
              foundRow = i + 2;
              break;
            }
          }
        }
        
        const row = [now, hId, action, data.details || "", eventId, cDate.full, uCode, uName];
        if (foundRow !== -1) {
          s.getRange(foundRow, 1, 1, row.length).setValues([row]);
        } else {
          s.appendRow(row);
        }
      }
    }

    const rowData = [
      now,
      data.deviceId || "",
      data.sessionId || "",
      action,
      data.wordId || "",
      data.wordCoptic || "",
      data.wordArabic || "",
      data.details || "",
      data.durationMs || "",
      data.eventId || "",
      hId,
      cDate.full,
      uCode,
      uName
    ];

    // الإضافة دائماً في صف جديد في شيت النشاطات الرئيسي
    let realLastRow = 0;
    const colB = sheet.getRange("B:B").getValues();
    for (let k = colB.length - 1; k >= 0; k--) {
      if (colB[k][0] && colB[k][0].toString().trim() !== "") {
        realLastRow = k + 1;
        break;
      }
    }
    sheet.getRange(realLastRow + 1, 1, 1, rowData.length).setValues([rowData]);

    if (data.deviceId && action) {
      updateUserStats(data.deviceId, action);
    }
    return createResponse({ success: true });
  } catch (err) {
    return createResponse({ success: false, error: err.toString() });
  }
}

function updateUserStats(deviceId, action) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(TRK_USERS_SHEET);
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === deviceId) {
        let colIndex = -1;
        if (action === "search") colIndex = 6;
        else if (action === "favorite") colIndex = 7;
        else if (action === "open") colIndex = 8;
        else if (action === "audio_play") colIndex = 9;
        else if (action === "training_session") colIndex = 10;
        if (colIndex === -1) return;
        sheet.getRange(i + 1, 4).setValue(new Date().toISOString());
        const currentValue = Number(data[i][colIndex]) || 0;
        sheet.getRange(i + 1, colIndex + 1).setValue(currentValue + 1);
        break;
      }
    }
  } catch (err) { Logger.log(err); }
}

// ───────────────────────────────────────────────────────────────────
// 4. النسخ الاحتياطي (تم حذف دوال الإشعارات)
// ───────────────────────────────────────────────────────────────────

function backupUserData(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(TRK_BACKUP_SHEET);
    if (!sheet) return createResponse({ success: false });
    const existingData = sheet.getDataRange().getValues();
    let found = false;
    for (let i = 1; i < existingData.length; i++) {
      if (existingData[i][0] === data.deviceId) {
        sheet.getRange(i + 1, 2).setValue(JSON.stringify(data.userData));
        sheet.getRange(i + 1, 3).setValue(new Date().toISOString());
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.appendRow([data.deviceId, JSON.stringify(data.userData), new Date().toISOString()]);
    }
    return createResponse({ success: true });
  } catch (err) {
    return createResponse({ success: false, error: err.toString() });
  }
}

function getUserByHardwareId(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(TRK_USERS_SHEET);
    if (!sheet) return createResponse({ success: false });
    const sheetData = sheet.getDataRange().getValues();
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][1] === data.hardwareId) {
        return createResponse({ success: true, deviceId: sheetData[i][0] });
      }
    }
    return createResponse({ success: false });
  } catch (err) {
    return createResponse({ success: false, error: err.toString() });
  }
}

function getUserData(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(TRK_BACKUP_SHEET);
    if (!sheet) return createResponse({ success: false });
    const sheetData = sheet.getDataRange().getValues();
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][0] === data.deviceId) {
        const userData = JSON.parse(sheetData[i][1]);
        return createResponse({ success: true, userData: userData });
      }
    }
    return createResponse({ success: false });
  } catch (err) {
    return createResponse({ success: false, error: err.toString() });
  }
}

function createResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function forceCleanupUsersSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TRK_USERS_SHEET);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  const maxRows = sheet.getMaxRows();
  if (maxRows > lastRow) {
    sheet.deleteRows(lastRow + 1, maxRows - lastRow);
  }
  SpreadsheetApp.getUi().alert("✅ تم تنظيف الصفوف الفارغة الزائدة بنجاح.");
}

/**
 * جلب بيانات الدولة بالكامل (الاسم، الرمز، الإيموجي) بدقة
 */
function getCountryDataFromServer(ip) {
  const result = { name: "", code: "", emoji: "" };
  if (!ip || ip === "unknown") return result;
  
  try {
    // المحاولة الأولى: خدمة ip-api (سريعة وممتازة لاسم الدولة الكامل)
    const response = UrlFetchApp.fetch("http://ip-api.com/json/" + ip + "?fields=status,country,countryCode", { muteHttpExceptions: true });
    const data = JSON.parse(response.getContentText());
    if (data.status === "success") {
      result.name = data.country;
      result.code = data.countryCode;
      result.emoji = getFlagEmoji(data.countryCode);
      return result;
    }
  } catch (e) {}

  try {
    // المحاولة الثانية في حالة الفشل: ipapi.co
    const resp = UrlFetchApp.fetch("https://ipapi.co/" + ip + "/json/", { muteHttpExceptions: true });
    const d = JSON.parse(resp.getContentText());
    if (d.country_name) {
      result.name = d.country_name;
      result.code = d.country_code;
      result.emoji = getFlagEmoji(d.country_code);
    }
  } catch (e) {}

  return result;
}

/**
 * تحويل رمز الدولة إلى إيموجي العلم
 */
function getFlagEmoji(countryCode) {
  if (!countryCode) return "";
  try {
    const codePoints = countryCode
      .toUpperCase()
      .split("")
      .map(char => 127397 + char.charCodeAt());
    return String.fromCodePoint(...codePoints);
  } catch(e) { return countryCode; }
}

/**
 * تحويل التاريخ الميلادي إلى القبطي (النظام السكندري)
 */
function getCopticDate(date) {
  if (!date) date = new Date();
  
  // السنة القبطية تبدأ يوم 11 سبتمبر (أو 12 في السنوات الكبيسة)
  // هذا تبسيط دقيق بما يكفي للغرض الإحصائي
  const months = [
    "توت", "بابة", "هاتور", "كيهك", "طوبة", "أمشير", 
    "برمهات", "برمودة", "بشنس", "بؤونة", "أبيب", "مسرى", "نسيء"
  ];
  
  const jdn = Math.floor((date.getTime() / 86400000) + 2440587.5);
  const copticEpoch = 1825030; // 1 Tut 1 Era of Martyrs
  let copticDays = jdn - copticEpoch;
  
  let year = Math.floor((copticDays - 0.25) / 365.25);
  let startOfYear = Math.floor(year * 365.25 + 0.5);
  let dayOfYear = copticDays - startOfYear;
  
  let month = Math.floor(dayOfYear / 30);
  let day = Math.floor(dayOfYear % 30) + 1;
  
  if (month > 12) {
    month = 12;
    day = dayOfYear - (12 * 30) + 1;
  }
  
  return {
    day: day,
    month: months[month] || "نسيء",
    year: year + 1,
    full: day + " " + (months[month] || "نسيء") + " " + (year + 1)
  };
}

function onOpen() {
  ensureAllSheetsExist();
  SpreadsheetApp.getUi()
    .createMenu("📨 KHMI")
    .addItem("🔄 إنشاء الشيتات يدويًا", "ensureAllSheetsExist")
    .addItem("🧹 تنظيف الصفوف الفارغة", "forceCleanupUsersSheet")
    .addToUi();
}

// ───────────────────────────────────────────────────────────────────
// 6. دوال لوحة التحكم (إضافة فقط)
// ───────────────────────────────────────────────────────────────────

function getAppConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("CONFIG");
  if (!sheet) { sheet = ss.insertSheet("CONFIG"); sheet.appendRow(["Key", "Value"]); }
  const data = sheet.getDataRange().getValues();
  const config = {};
  for (let i = 1; i < data.length; i++) { config[data[i][0]] = data[i][1]; }
  return createResponse({ success: true, config: config });
}

function updateAppConfig(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("CONFIG");
  if (!sheet) { sheet = ss.insertSheet("CONFIG"); sheet.appendRow(["Key", "Value"]); }
  const config = data.config;
  Object.keys(config).forEach(k => {
    const keys = sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), 1).getValues();
    let row = -1;
    for (let i = 0; i < keys.length; i++) { if (keys[i][0] === k) { row = i + 1; break; } }
    if (row !== -1) sheet.getRange(row, 2).setValue(config[k]);
    else sheet.appendRow([k, config[k]]);
  });
  return createResponse({ success: true });
}

function executeSystemCommand(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("CONFIG");
  if (!sheet) { sheet = ss.insertSheet("CONFIG"); sheet.appendRow(["Key", "Value"]); }
  const cmdValue = JSON.stringify({ id: data.commandId, time: data.timestamp });
  const keys = sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), 1).getValues();
  let row = -1;
  for (let i = 0; i < keys.length; i++) { if (keys[i][0] === "system_command") { row = i + 1; break; } }
  if (row !== -1) sheet.getRange(row, 2).setValue(cmdValue);
  else sheet.appendRow(["system_command", cmdValue]);
  return createResponse({ success: true });
}

function getAdminStats() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName(TRK_USERS_SHEET);
  const activitySheet = ss.getSheetByName(TRK_ACTIVITY_SHEET);
  const searchSheet = ss.getSheetByName(TRK_SEARCH_LOG_SHEET);
  const lessonsSheet = ss.getSheetByName(TRK_LESSONS_SHEET);
  const shareSheet = ss.getSheetByName(TRK_SHARES_SHEET);
  const notifSheet = ss.getSheetByName("KHMI_NOFICATION");

  // 1. حساب الجمهور الحقيقي مع كاش للسيرفر (لمنع البطء)
  const scriptCache = CacheService.getScriptCache();
  let totalUsers = Number(scriptCache.get("total_users_count"));
  
  if (!totalUsers && notifSheet) {
    const lastRow = notifSheet.getLastRow();
    if (lastRow > 1) {
      const ids = notifSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      const uniqueIds = new Set();
      ids.forEach(r => { if(r[0]) uniqueIds.add(r[0].toString().trim()); });
      totalUsers = uniqueIds.size;
      scriptCache.put("total_users_count", totalUsers.toString(), 600); // كاش لمدة 10 دقائق
    }
  }
  
  if (!totalUsers) totalUsers = 0;

  // 2. حساب المتواجدين اليوم فعلياً (Unique Hardware IDs from today's logs)
  let activeToday = 0;
  const recent = [];
  if (activitySheet) {
    const lastRow = activitySheet.getLastRow();
    if (lastRow > 1) {
      const startRow = Math.max(2, lastRow - 2000);
      const logData = activitySheet.getRange(startRow, 1, (lastRow - startRow) + 1, 14).getValues();
      
      const today = Utilities.formatDate(new Date(), "GMT+3", "yyyy-MM-dd");
      const activeIds = new Set();
      
      logData.forEach(row => {
        if (row[0]) {
          const rowDate = Utilities.formatDate(new Date(row[0]), "GMT+3", "yyyy-MM-dd");
          if (rowDate === today) {
            activeIds.add(row[10]); // hardware_id
          }
        }
      });
      activeToday = activeIds.size;

      // جلب آخر 10 حركات للـ Pulse
      logData.reverse().slice(0, 10).forEach(row => {
        recent.push({
          time: Utilities.formatDate(new Date(row[0]), "GMT+3", "HH:mm"),
          msg: `${row[3]}: ${row[7] || ""}`,
          user: row[13] || "Guest"
        });
      });
    }
  }

  const topSearches = [];
  if (searchSheet) {
    const lastRow = searchSheet.getLastRow();
    if (lastRow > 1) {
      // جلب آخر 2000 بحث (التركيز على الجديد)
      const startRow = Math.max(2, lastRow - 1999);
      const data = searchSheet.getRange(startRow, 3, (lastRow - startRow) + 1, 1).getValues();
      const map = {};
      data.forEach(r => { if(r[0]) map[r[0]] = (map[r[0]] || 0) + 1; });
      Object.keys(map).forEach(k => topSearches.push({ name: k, count: map[k] }));
      topSearches.sort((a,b) => b.count - a.count);
    }
  }

  const topLessons = [];
  if (lessonsSheet) {
    const lastRow = lessonsSheet.getLastRow();
    if (lastRow > 1) {
      // جلب آخر 2000 درس (التركيز على الجديد)
      const startRow = Math.max(2, lastRow - 1999);
      const data = lessonsSheet.getRange(startRow, 3, (lastRow - startRow) + 1, 1).getValues();
      const map = {};
      data.forEach(r => { if(r[0]) map[r[0]] = (map[r[0]] || 0) + 1; });
      Object.keys(map).forEach(k => topLessons.push({ name: k, count: map[k] }));
      topLessons.sort((a,b) => b.count - a.count);
    }
  }

  return createResponse({
    success: true,
    stats: {
      total: totalUsers,
      activeToday: activeToday,
      shares: shareSheet ? Math.max(0, shareSheet.getLastRow() - 1) : 0,
      searches: searchSheet ? Math.max(0, searchSheet.getLastRow() - 1) : 0,
      lessons: lessonsSheet ? Math.max(0, lessonsSheet.getLastRow() - 1) : 0
    },
    recent: recent,
    topSearches: topSearches.slice(0, 5),
    topLessons: topLessons.slice(0, 5)
  });
}

function getCopticDateString() {
  return Utilities.formatDate(new Date(), "GMT+3", "yyyy-MM-dd HH:mm");
}

function logSearch(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(TRK_SEARCH_LOG_SHEET);
    if (!sheet) return createResponse({ success: false });
    const now = new Date().toISOString();
    const row = [now, data.hardwareId || "", data.query || "", data.resultsCount || 0, data.eventId || "", getCopticDateString(), data.userCode || "", data.userName || ""];
    sheet.appendRow(row);
    updateUserStats(data.deviceId, "search");
    return createResponse({ success: true });
  } catch (e) { return createResponse({ success: false, error: e.toString() }); }
}

function logLesson(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(TRK_LESSONS_SHEET);
    if (!sheet) return createResponse({ success: false });
    const now = new Date().toISOString();
    const row = [now, data.hardwareId || "", data.lesson_title || data.details || "", data.eventId || "", getCopticDateString(), data.userCode || "", data.userName || ""];
    sheet.appendRow(row);
    updateUserStats(data.deviceId, "open");
    return createResponse({ success: true });
  } catch (e) { return createResponse({ success: false, error: e.toString() }); }
}

function logExam(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(TRK_EXAMS_SHEET);
    if (!sheet) return createResponse({ success: false });
    const now = new Date().toISOString();
    const row = [now, data.hardwareId || "", data.exam_details || data.details || "", data.score || 0, data.eventId || "", getCopticDateString(), data.userCode || "", data.userName || ""];
    sheet.appendRow(row);
    updateUserStats(data.deviceId, "training_session");
    return createResponse({ success: true });
  } catch (e) { return createResponse({ success: false, error: e.toString() }); }
}

function logDownload(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(TRK_DOWNLOADS_SHEET);
    if (!sheet) return createResponse({ success: false });
    const now = new Date().toISOString();
    const row = [now, data.hardwareId || "", data.details || "", data.eventId || "", getCopticDateString(), data.userCode || "", data.userName || ""];
    sheet.appendRow(row);
    return createResponse({ success: true });
  } catch (e) { return createResponse({ success: false, error: e.toString() }); }
}

function logShare(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(TRK_SHARES_SHEET);
    if (!sheet) return createResponse({ success: false });
    const now = new Date().toISOString();
    const row = [now, data.hardwareId || "", data.details || "", data.eventId || "", getCopticDateString(), data.userCode || "", data.userName || ""];
    sheet.appendRow(row);
    return createResponse({ success: true });
  } catch (e) { return createResponse({ success: false, error: e.toString() }); }
}
/**
 * دالة إرسال إشعارات المسؤول من التطبيق
 */
function handleSendAdminNotification(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. تسجيل العملية في شيت اللوج
    let logSheet = ss.getSheetByName(ADMIN_LOGS_SHEET_NAME);
    if (!logSheet) {
      logSheet = ss.insertSheet(ADMIN_LOGS_SHEET_NAME);
      logSheet.appendRow(["Timestamp", "Type", "Target Row", "Title", "Message (AR)", "Message (EN)", "Token"]);
    }

    // 2. جلب المستهدفين
    const notifSheet = ss.getSheetByName(NOTIFICATION_SHEET_NAME);
    if (!notifSheet) return createResponse({ success: false, error: "Notification sheet not found" });

    const targets = [];
    let loggedToken = "Broadcast";

    if (data.type === "individual") {
      const row = parseInt(data.row);
      if (isNaN(row) || row < 2) return createResponse({ success: false, error: "Invalid row number" });
      const token = notifSheet.getRange(row, 3).getValue();
      const lang = notifSheet.getRange(row, 7).getValue() || "ar";
      if (token && token.includes("ExponentPushToken")) {
        targets.push({ token: token, lang: lang });
        loggedToken = token;
      }
    } else {
      const lastRow = notifSheet.getLastRow();
      if (lastRow < 2) return createResponse({ success: false, error: "No users found" });
      const rawData = notifSheet.getRange(2, 3, lastRow - 1, 5).getValues();
      rawData.forEach(row => {
        const token = row[0];
        const lang = row[4] || "ar";
        if (token && typeof token === "string" && token.includes("ExponentPushToken")) {
          targets.push({ token: token, lang: lang });
        }
      });
      loggedToken = "Broadcast to " + targets.length;
    }

    // تسجيل اللوج
    logSheet.appendRow([new Date(), data.type, data.row || "Global", "Auto", data.body_ar, data.body_en, loggedToken]);

    // الإرسال الفعلي
    const resultStatus = sendExpoPushNotification(targets, null, (data.body_ar || data.body_en));
    
    return createResponse({ 
      success: true, 
      count: targets.length,
      status: resultStatus 
    });

  } catch (e) {
    return createResponse({ success: false, error: e.toString() });
  }
}

/**
 * دالة الإرسال إلى سيرفرات Expo
 */
function sendExpoPushNotification(targets, title, message) {
  const allMessages = [];
  targets.forEach(t => {
    const userLang = String(t.lang).toLowerCase().trim();
    const finalTitle = title || (NOTIF_TITLES[userLang] || NOTIF_TITLES['ar']);
    
    allMessages.push({
      to: String(t.token),
      sound: 'notification.wav',
      title: finalTitle,
      body: message,
      priority: 'high',
      badge: 1,
      channelId: 'default',
      data: { message: message, title: finalTitle }
    });
  });

  const CHUNK_SIZE = 100;
  let successCount = 0;
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
      if (result && result.data) {
        result.data.forEach(r => { if (r.status !== 'error') successCount++; });
      }
    } catch (e) {}
  }
  return "Sent to " + successCount + " devices";
}

function getDailyWord() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(TRK_SETTINGS_SHEET);
    if (!sheet) return createResponse({ success: false, error: "Settings sheet not found" });
    const data = sheet.getDataRange().getValues();
    // البحث عن كلمة اليوم في الشيت (نفترض أنها مخزنة بمفتاح daily_word)
    let word = { coptic: "", arabic: "", pron: "" };
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === "daily_word") {
        try {
          word = JSON.parse(data[i][1]);
        } catch(e) {
          // fallback if not JSON
          word.coptic = data[i][1];
        }
        break;
      }
    }
    return createResponse({ success: true, word: word });
  } catch (e) { return createResponse({ success: false, error: e.toString() }); }
}

function updateDailyWord(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(TRK_SETTINGS_SHEET);
    if (!sheet) return createResponse({ success: false });
    
    const wordJson = JSON.stringify(data.word);
    const keys = sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), 1).getValues();
    let row = -1;
    for (let i = 0; i < keys.length; i++) { if (keys[i][0] === "daily_word") { row = i + 1; break; } }
    
    if (row !== -1) sheet.getRange(row, 2).setValue(wordJson);
    else sheet.appendRow(["daily_word", wordJson]);
    
    return createResponse({ success: true });
  } catch (e) { return createResponse({ success: false, error: e.toString() }); }
}

function clearLogs() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = [TRK_ACTIVITY_SHEET, TRK_SEARCH_LOG_SHEET, TRK_LESSONS_SHEET, TRK_EXAMS_SHEET, TRK_DOWNLOADS_SHEET, ADMIN_LOGS_SHEET_NAME];
    sheets.forEach(name => {
      const sheet = ss.getSheetByName(name);
      if (sheet && sheet.getLastRow() > 1) {
        sheet.deleteRows(2, sheet.getLastRow() - 1);
      }
    });
    return createResponse({ success: true });
  } catch (e) { return createResponse({ success: false, error: e.toString() }); }
}
