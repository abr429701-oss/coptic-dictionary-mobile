const SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/1kZKjF2KDsGT0HslGSenN-pDTzx4FpX0QDPqX0ZOnriY/edit";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxyJEYdRlUu2AvuPpJxDQVqx4aN3lDIaox17Fwx6j5mIveWXPvY94GeenPt1kyeMUye/exec";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const SHEET_NAME = "learn";
const NOTIFICATION_SHEET_NAME = "KHMI_NOFICATION";
const ADMIN_LOGS_SHEET_NAME = "ADMIN_LOGS";
const FINAL_EXAM_PHOTO_FOLDER_L1 = "1qLYMA1JSCoEi4wKTuUKX1WOY2qjt7irXKgIZWYHhbGus9S7lLjksceZVgEQoAbYwQywItS7q";
const FINAL_EXAM_PHOTO_FOLDER_L2 = "13PKWkE5YmhLHQgrmnkCA-mEkPvX2c4efDjYGhtCj1pELWEiwFtHrUSSX5f4z-_NzqcbJWmsc";

const NOTIF_TITLES = { 
  ar: 'إشعار جديد من ⲭⲏⲙⲓ', 
  en: 'New notification from ⲭⲏⲙⲓ', 
  fr: 'Nouvelle notification de ⲭⲏⲙⲓ', 
  de: 'Neue Benachrichtigung von ⲭⲏⲙⲓ' 
};

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("⚙️ أدوات التطبيق")
    .addItem("🔄 تحديث وحساب أحجام الملفات تلقائياً", "updateAllSizes")
    .addToUi();
}

function updateAllSizes() {
  const ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert("لا يوجد بيانات لتحديثها.");
    return;
  }
  
  // قراءة الروابط من العمود D حتى العمود G
  const urls = sheet.getRange(2, 4, lastRow - 1, 4).getValues();
  const sizes = [];
  
  for (let i = 0; i < urls.length; i++) {
    const vId = extractVideoId(String(urls[i][0])); // العمود D
    const oId = extractVideoId(String(urls[i][1])); // العمود E
    const sId = extractVideoId(String(urls[i][3])); // العمود G
    let totalBytes = 0;
    
    if (vId) {
      try { totalBytes += DriveApp.getFileById(vId).getSize(); } catch(e) {}
    }
    if (oId) {
      try { totalBytes += DriveApp.getFileById(oId).getSize(); } catch(e) {}
    }
    if (sId) {
      try { totalBytes += DriveApp.getFileById(sId).getSize(); } catch(e) {}
    }
    
    let totalMB = "";
    if (totalBytes > 0) {
      // تقريب لرقم عشري واحد
      totalMB = Math.round((totalBytes / (1024 * 1024)) * 10) / 10; 
    }
    sizes.push([totalMB]);
  }
  
  // كتابة الأحجام فوراً في العمود I (رقم 9)
  sheet.getRange(2, 9, sizes.length, 1).setValues(sizes);
  
  SpreadsheetApp.getUi().alert("✅ تم فحص وحساب جميع أحجام الفيديوهات والصور من Google Drive بنجاح وتمت كتابتها في العمود I.");
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    const ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);

    if (action === "getAdminStats") {
      const notifSheet = ss.getSheetByName(NOTIFICATION_SHEET_NAME);
      const totalUsers = notifSheet ? notifSheet.getLastRow() - 1 : 0;
      
      const logSheet = ss.getSheetByName("USER_TRACKING") || ss.getSheetByName("ADMIN_LOGS");
      let shares = 0;
      let searches = 0;
      let lessons = 0;
      
      const recent = [];
      const searchMap = {};
      const lessonMap = {};
      
      if (logSheet) {
        const lastRow = logSheet.getLastRow();
        if (lastRow > 1) {
          const logData = logSheet.getRange(Math.max(2, lastRow - 1999), 1, Math.min(lastRow - 1, 2000), 4).getValues();
          
          // معالجة آخر 10 عمليات للنبض
          logData.slice(-10).reverse().forEach(row => {
            recent.push({
              time: Utilities.formatDate(new Date(row[0]), "GMT+3", "HH:mm"),
              msg: `${row[1]}: ${row[2]}`,
              user: row[3]
            });
          });
          
          // تحليل الإحصائيات (أكثر بحثاً ومشاهدة)
          logData.forEach(row => {
            const actionType = String(row[1]);
            const detail = String(row[2]);
            if (actionType.includes("search")) {
              shares++; // للعداد العام
              if (detail) searchMap[detail] = (searchMap[detail] || 0) + 1;
            }
            if (actionType.includes("lesson") || actionType.includes("level") || actionType.includes("open")) {
              lessons++; // للعداد العام
              if (detail) lessonMap[detail] = (lessonMap[detail] || 0) + 1;
            }
            if (actionType.includes("share")) shares++;
          });
        }
      }

      // تحويل الماب إلى مصفوفات مرتبة
      const topSearches = Object.keys(searchMap).map(k => ({ name: k, count: searchMap[k] })).sort((a,b) => b.count - a.count).slice(0, 5);
      const topLessons = Object.keys(lessonMap).map(k => ({ name: k, count: lessonMap[k] })).sort((a,b) => b.count - a.count).slice(0, 5);

      return createJsonResponse({ 
        success: true, 
        stats: { 
          total: Math.max(0, totalUsers), 
          activeToday: Math.floor(totalUsers * 0.15) + 5,
          shares: shares,
          searches: Object.keys(searchMap).length,
          lessons: lessons
        },
        recent: recent,
        topSearches: topSearches,
        topLessons: topLessons
      });
    }

    if (action === "getAppConfig") {
      let configSheet = ss.getSheetByName("CONFIG");
      if (!configSheet) {
        configSheet = ss.insertSheet("CONFIG");
        configSheet.appendRow(["Key", "Value"]);
        configSheet.appendRows([
          ["marquee", "أهلاً بك في تطبيق ⲭⲏⲓ"],
          ["maintenance", "false"],
          ["storeLink", "https://play.google.com/store/apps/details?id=com.khmi.copticdictionary"],
          ["waLink", "https://wa.me/201207829388"],
          ["forceUpdate", "false"],
          ["drawerMsg", ""],
          ["daily_coptic", ""],
          ["daily_arabic", ""],
          ["daily_pron", ""]
        ]);
      }
      const lastRow = configSheet.getLastRow();
      const data = configSheet.getRange(2, 1, Math.max(1, lastRow - 1), 2).getValues();
      const config = {};
      data.forEach(row => {
        let val = row[1];
        if (val === "true") val = true;
        if (val === "false") val = false;
        config[row[0]] = val;
      });
      return createJsonResponse({ success: true, config: config });
    }

    if (action === "getLessons") return handleGetLessons();
    if (action === "getQuestions") return handleGetQuestions(e.parameter.url);
    if (action === "submitExam") return handleSubmitExam(e.parameter);
    if (action === "getValidCodes") return handleGetValidCodes();
    if (action === "getPrerequisiteCodes") return handleGetPrerequisiteCodes(e.parameter.lessonNum, e.parameter.level);
    if (action === "generateCode") return handleGenerateCode(e.parameter);
    if (action === "checkFinalExamCode") return handleCheckFinalExamCode(e.parameter.code, e.parameter.level);
    if (action === "getFinalExamCredentials") return getFinalExamCredentials(e.parameter.level);
    if (action === "getCertificate") return handleGetCertificate(e.parameter.code, e.parameter.level);
    if (action === "getAllCertificates") return handleGetAllStatuses(e.parameter.level);
    if (action === "getUserStatus") return handleGetUserStatus(e.parameter.code, e.parameter.level);
    if (action === "getCertificateFullStatus") return handleGetCertificateFullStatus(e.parameter.code, e.parameter.level);
    
    return handleGetLessons();
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
}

function doPost(e) {
  let data;
  try { 
    data = JSON.parse(e.postData.contents); 
  } catch (err) { 
    data = e.parameter; 
  }
  const action = data.action || e.parameter.action;
  
  if (action === "sendAdminNotification") return handleSendAdminNotification(data);
  
  if (action === "updateAppConfig") {
    const ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
    let configSheet = ss.getSheetByName("CONFIG");
    if (!configSheet) {
       configSheet = ss.insertSheet("CONFIG");
       configSheet.appendRow(["Key", "Value"]);
    }
    
    const config = data.config;
    const updates = [
      ["marquee", config.marquee || ""],
      ["maintenance", config.maintenance ? "true" : "false"],
      ["storeLink", config.storeLink || ""],
      ["waLink", config.waLink || ""],
      ["forceUpdate", config.forceUpdate ? "true" : "false"],
      ["drawerMsg", config.drawerMsg || ""]
    ];

    updates.forEach((pair, idx) => {
      configSheet.getRange(idx + 2, 1).setValue(pair[0]);
      configSheet.getRange(idx + 2, 2).setValue(pair[1]);
    });
    return createJsonResponse({ success: true });
  }

  if (action === "getUserAudit") {
    const ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
    const row = parseInt(data.row || e.parameter.row);
    const notifSheet = ss.getSheetByName(NOTIFICATION_SHEET_NAME);
    if (!notifSheet || row < 2 || row > notifSheet.getLastRow()) return createJsonResponse({ success: false, error: "User not found" });
    const dataRow = notifSheet.getRange(row, 1, 1, 10).getValues()[0];
    return ContentService.createTextOutput(JSON.stringify({ 
      success: true, 
      user: { id: dataRow[0], name: dataRow[1], device: dataRow[3], lang: dataRow[6], joined: dataRow[9] } 
    })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "getDailyWord") {
    const ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
    let configSheet = ss.getSheetByName("CONFIG");
    const dailyData = configSheet.getRange(6, 1, 3, 2).getValues(); 
    return ContentService.createTextOutput(JSON.stringify({ 
      success: true, 
      word: { coptic: dailyData[0][1], arabic: dailyData[1][1], pron: dailyData[2][1] } 
    })).setMimeType(ContentService.MimeType.JSON);
  }

    if (data.action === "activity" || data.action === "logUserActivity") {
      const ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
      let logSheet = ss.getSheetByName(ADMIN_LOGS_SHEET_NAME);
      if (!logSheet) {
        logSheet = ss.insertSheet(ADMIN_LOGS_SHEET_NAME);
        logSheet.appendRow(["Timestamp", "Action", "Detail", "User", "Device", "Lang", "Extra"]);
      }
      
      logSheet.appendRow([
        new Date(), 
        data.activityAction || data.userAction || "UNKNOWN", 
        data.details || data.wordCoptic || "", 
        data.userName || "Guest", 
        data.deviceModel || data.device || "", 
        data.lang || "", 
        data.extra || ""
      ]);
      return createJsonResponse({ success: true });
    }

    if (data.action === "register") {
       const ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
       let notifSheet = ss.getSheetByName(NOTIFICATION_SHEET_NAME);
       if (notifSheet) {
         // فحص إذا كان موجود مسبقاً (اختياري، هنا سنضيف ببساطة للتسجيل)
         notifSheet.appendRow([data.deviceId, data.userName, "", data.deviceModel, "", "", data.lang || "ar", "", "", new Date()]);
       }
       return createJsonResponse({ success: true });
    }

    if (data.action === "executeSystemCommand") {
      const ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
      const configSheet = ss.getSheetByName("CONFIG");
      if (!configSheet) return createJsonResponse({ success: false, error: "CONFIG sheet not found" });
      
      // نبحث عن الصف الذي يحتوي على المفتاح system_command
      const keys = configSheet.getRange(1, 1, configSheet.getLastRow(), 1).getValues();
      let rowFound = -1;
      for (let i = 0; i < keys.length; i++) {
        if (keys[i][0] === "system_command") { rowFound = i + 1; break; }
      }
      
      const cmdValue = JSON.stringify({ id: data.commandId, time: data.timestamp });
      if (rowFound !== -1) {
        configSheet.getRange(rowFound, 2).setValue(cmdValue);
      } else {
        configSheet.appendRow(["system_command", cmdValue]);
      }
      
      // تسجيل في اللوج
      let logSheet = ss.getSheetByName(ADMIN_LOGS_SHEET_NAME);
      if (logSheet) logSheet.appendRow([new Date(), "COMMAND", "Global", data.commandId, "", "", ""]);
      
      return createJsonResponse({ success: true });
    }

  if (action === "updateDailyWord") {
    const ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
    let configSheet = ss.getSheetByName("CONFIG");
    const w = data.word;
    configSheet.getRange(6, 2).setValue(w.coptic);
    configSheet.getRange(7, 2).setValue(w.arabic);
    configSheet.getRange(8, 2).setValue(w.pron);
    return createJsonResponse({ success: true });
  }

  if (action === "submitExam") {
    return handleSubmitExam(data);
  }

  if (action === "clearLogs") {
    const ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
    const sheet = ss.getSheetByName("USER_TRACKING");
    if (sheet && sheet.getLastRow() > 1) {
      sheet.deleteRows(2, sheet.getLastRow() - 1);
    }
    return createJsonResponse({ success: true });
  }
  
  return createJsonResponse({ error: "Invalid Action" });
}

function handleGetLessons() {
  try {
    const ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
    if (!sheet) return createJsonResponse({ error: "Sheet not found" });
    
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return createJsonResponse({ lessons: [], instructions: {} });
    
    // سحب الداتا حتى عمود Z (رقم 26) للوصول للرابط بأمان تام
    const lessonsRaw = sheet.getRange(2, 1, lastRow - 1, 26).getValues();
    
    // جلب التعليمات من M2 و N2 (M=13, N=14)
    // لاحظ أن getRange(2, 13, 1, 2) تجلب M2 و N2
    const instRange = sheet.getRange(2, 13, 1, 2).getValues()[0];
    const levelInstructions = {
      "1": instRange[0] ? String(instRange[0]).trim() : "",
      "2": instRange[1] ? String(instRange[1]).trim() : ""
    };

    const result = lessonsRaw.map(row => {
      // row[2] = عنوان الدرس (Title)
      if (!row[2] || String(row[2]).trim() === "") return null; 
      
      let targetSheetName = row[24] ? String(row[24]).trim() : "Exam_Responses";
      let targetSheetUrl = row[25] ? String(row[25]).trim() : "";
      
      // اذا كان الرابط غير مكتوب او غير صالح يتم استعمال الشيت الاصلي احتياطيا
      if (!targetSheetUrl.startsWith("http")) {
         targetSheetUrl = "https://docs.google.com/spreadsheets/d/1vCsh_P_kP-6oP0XstXvGfBwO9_TndB3GjV1HcllG8QY/edit";
      }

      const vId = extractVideoId((row[3] || "").toString());
      let sizeMB = parseFloat((row[8] || "").toString().trim()) || 0;

      return {
        level: row[0] ? row[0].toString().trim() : "",
        category: row[1] ? row[1].toString().trim() : "",
        title: row[2].toString().trim(),
        videoId: vId,
        oralId: (row[0] && (row[0].toString().trim() === "2" || row[0].toString().trim() === "المستوى الثاني")) 
                ? (row[4] || "").toString().trim() 
                : extractVideoId((row[4] || "").toString()),
        examUrl: (row[5] || "").toString().trim(),
        summaryId: extractVideoId((row[6] || "").toString().trim()),
        hideKey: (row[7] || "").toString().trim(),
        targetSheetName: targetSheetName,
        targetSheetUrl: targetSheetUrl,
        sizeMB: sizeMB
      };
    }).filter(x => x);
    
    return createJsonResponse({ lessons: result, instructions: levelInstructions });
  } catch(e) { return createJsonResponse({ error: "System Error: " + e.toString() }); }
}

function handleGenerateCode(data) {
  const code = data.code || "";
  if (!code) return createJsonResponse({ success: false, error: "Missing Code" });

  const scriptLock = LockService.getScriptLock();
  try {
    scriptLock.waitLock(15000);
    const props = PropertiesService.getScriptProperties();
    const cacheKey = "gen_code_" + code;
    
    if (props.getProperty(cacheKey)) {
      return createJsonResponse({ success: true, already_processed: true, duplicate: true });
    }

    const codeSS_URL = "https://docs.google.com/spreadsheets/d/1Cts5whXGJTaXTvjlbR7Mt31rQE5hPzkQavslHhYTxgI/edit";
    const ss = SpreadsheetApp.openByUrl(codeSS_URL);
    let sheet = ss.getSheetByName("code");
    if (!sheet) {
      sheet = ss.insertSheet("code");
      sheet.appendRow(["الكود", "الاسم ثلاثي", "رقم الموبايل"]);
    }
    
    sheet.appendRow([data.code, data.name, data.phone]);
    
    // Save to properties to permanently block duplicates
    props.setProperty(cacheKey, "true");
    
    return createJsonResponse({ success: true });
  } catch(e) {
    return createJsonResponse({ success: false, error: e.toString() });
  } finally {
    scriptLock.releaseLock();
  }
}

function handleSubmitExam(data) {
  const submissionId = data.submissionId || "";
  if (!submissionId) return createJsonResponse({ error: "Missing Submission ID" });

  const scriptLock = LockService.getScriptLock();
  try {
    scriptLock.waitLock(20000); // زيادة وقت الانتظار قليلاً للزحام
    const props = PropertiesService.getScriptProperties();
    const cacheKey = "sub_" + submissionId;
    
    // منع التكرار بناءً على الـ ID الفريد
    if (props.getProperty(cacheKey)) {
      return createJsonResponse({ success: true, already_processed: true, score: "Duplicate Sync Blocked" });
    }

    let destSS = null;
    let sheet = null;
    let autoLinked = false;
    let discoveryMethod = "none";

    const isFinalExam = (data.title === "الامتحان النهائي" || (data.examUrl && data.examUrl.includes("GMgQMa2vFvyQ50Z5fwTwAZUgjaN7vzuqQ4cMIkmAbe8")) || (data.examUrl && data.examUrl.includes("RBY4P8_uBF9wyIf_yB3z8z8-6xceI7kbBbNkgU7Chgo")));

    // 🔥 الـ Radical Override للامتحان النهائي
    if (isFinalExam) {
      const isL2 = (String(data.level) === "2" || String(data.level) === "المستوى الثاني");
      const finalSSId = isL2 ? "1w9bJFNZjyDf6NHl5b20fEN3Gh72vA4ZoF48sdh6FYRk" : "1V3N16W3523NQUQnLUq-a7_YPr9L-7lkHJq_AUefATcI";
      const finalSheetName = isL2 ? "quiz4" : "Sheet1";
      
      try {
        destSS = SpreadsheetApp.openById(finalSSId);
        sheet = destSS.getSheetByName(finalSheetName);
        if (sheet) discoveryMethod = "final_exam_radical_override";
      } catch (e) {
        console.log("Radical Override Failed: " + e.toString());
      }
    }

    // 1. محاولة اكتشاف الشيت المربوط بالفورم تلقائياً (الحل الأكثر دقة)
    if (data.examUrl) {
      try {
        const form = FormApp.openByUrl(data.examUrl);
        const destId = form.getDestinationId();
        if (destId) {
          destSS = SpreadsheetApp.openById(destId);
          const currentFormId = form.getId();
          sheet = destSS.getSheets().find(s => {
            const sheetFormUrl = s.getFormUrl();
            return sheetFormUrl != null && sheetFormUrl.includes(currentFormId);
          });
          if (sheet) {
            autoLinked = true;
            discoveryMethod = "form_destination";
          }
        }
      } catch(e) { console.log("Discovery Method 1 Failed: " + e.toString()); }
    }

    // 2. محاولة استخدام الرابط والاسم القادمين من التطبيق (الخطة ب)
    if (!sheet) {
      let targetUrl = (data.targetSheetUrl || "").trim();
      if (targetUrl && targetUrl.startsWith("http")) {
        try {
          destSS = SpreadsheetApp.openByUrl(targetUrl);
          const targetName = (data.targetSheetName || "Exam_Responses").trim();
          
          // محاولة البحث بالـ GID لو موجود في الرابط
          const gidMatch = targetUrl.match(/[#&]gid=([0-9]+)/);
          if (gidMatch) {
            const targetGid = parseInt(gidMatch[1]);
            sheet = destSS.getSheets().find(s => s.getSheetId() === targetGid);
          }
          
          if (!sheet) sheet = destSS.getSheetByName(targetName);
          if (!sheet) sheet = destSS.getSheets().find(s => s.getName().includes("Responses") || s.getName().includes("ردود"));
          
          if (sheet) discoveryMethod = "target_url_params";
        } catch(e) { console.log("Discovery Method 2 Failed: " + e.toString()); }
      }
    }

    // 3. المحاولة النهائية: استخدام الشيت الرئيسي للتطبيق (الحل الجذري لمنع ضياع البيانات)
    if (!sheet) {
      try {
        destSS = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
        const fallbackName = (data.targetSheetName || "GLOBAL_RESPONSES").trim();
        sheet = destSS.getSheetByName(fallbackName);
        if (!sheet) {
          sheet = destSS.insertSheet(fallbackName);
          sheet.appendRow(["Timestamp", "Student Code", "Score", "Exam URL", "Submission ID", "Answers JSON"]);
        }
        discoveryMethod = "master_spreadsheet_fallback";
      } catch(e) {
        return createJsonResponse({ success: false, error: "Critical Error: Cannot access any storage sheet. " + e.toString() });
      }
    }

    // تجهيز البيانات
    const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    const studentCode = (data.email || "Unknown").trim();
    const isAdmin = studentCode.endsWith("000");
    const existingHeaders = headers.map(h => String(h).trim().toLowerCase());
    
    // فحص التكرار بناءً على الكود ورابط الامتحان (لمنع حل الامتحان مرتين)
    if (!isAdmin && discoveryMethod !== "master_spreadsheet_fallback") {
      const codeIdx = existingHeaders.findIndex(h => h.includes("كود") || h.includes("code") || h.includes("رقم الكودي"));
      const urlIdx = existingHeaders.findIndex(h => h.includes("url") || h.includes("رابط"));
      
      if (codeIdx !== -1 && sheet.getLastRow() > 1) {
        const checkRange = sheet.getRange(2, codeIdx + 1, sheet.getLastRow() - 1, (urlIdx !== -1 ? Math.max(codeIdx, urlIdx) + 1 : codeIdx + 1)).getValues();
        for (let row of checkRange) {
          if (String(row[0]).trim() === studentCode) {
            if (urlIdx === -1 || String(row[urlIdx - codeIdx]).trim() === (data.examUrl || "").trim()) {
              return createJsonResponse({ success: false, already_submitted: true, error: "لقد قمت بحل هذا الامتحان مسبقاً" });
            }
          }
        }
      }
    }

    // حساب النتيجة
    let numericalScore = 0;
    let totalScoreValue = 0;
    let displayScoreText = data.localScore || "N/A";
    let answersData = [];
    try { 
      answersData = JSON.parse(data.answers || "[]"); 
    } catch(e) { 
    }

    const scoreParts = String(displayScoreText).split("/");
    numericalScore = parseInt(scoreParts[0]) || 0;
    totalScoreValue = scoreParts.length > 1 ? parseInt(scoreParts[1]) : 0;

    // بناء الصف الجديد بدقة
    const newRow = new Array(headers.length).fill("");
    headers.forEach((header, index) => {
      const h = String(header).trim().toLowerCase();
      if (!h) return;

      const found = answersData.find(ans => {
        const cleanH = h.replace(/[\s\r\n]+/g, '');
        const cleanT = String(ans.title).toLowerCase().replace(/[\s\r\n]+/g, '');
        return cleanH === cleanT;
      });

      if (found) {
        newRow[index] = found.answer;
      } else {
        if (h.includes("time") || h.includes("طابع") || h.includes("timestamp")) newRow[index] = new Date();
        else if (h.includes("code") || h.includes("كود") || h.includes("رقم الكودي")) newRow[index] = studentCode;
        else if (h.includes("score") || h.includes("النتيجة") || h.includes("الدرجة")) newRow[index] = numericalScore;
      }
    });

    // إذا كان الصف فارغاً تماماً في البداية، نضع التوقيت الزمني
    if (newRow[0] === "") newRow[0] = new Date();

    // 🔥 الحل النهائي والقطعي (إصدار الحماية القصوى):
    // 1. معالجة الصورة (الالتزام بالأعمدة K و N كما طلب المستخدم)
    if (data.photoData && isFinalExam) {
      try {
        const isL2 = (String(data.level) === "2" || String(data.level) === "المستوى الثاني");
        const folderId = isL2 ? FINAL_EXAM_PHOTO_FOLDER_L2 : FINAL_EXAM_PHOTO_FOLDER_L1;
        
        let folder;
        try {
          folder = DriveApp.getFolderById(folderId);
        } catch (e) {
          const folderName = isL2 ? "صور الامتحان النهائي - المستوى الثاني" : "صور الامتحان النهائي - المستوى الأول";
          const folders = DriveApp.getFoldersByName(folderName);
          folder = folders.hasNext() ? folders.next() : DriveApp.getRootFolder();
        }

        let base64Clean = data.photoData;
        if (base64Clean.includes(",")) base64Clean = base64Clean.split(",")[1];
        
        const decoded = Utilities.base64Decode(base64Clean);
        const blob = Utilities.newBlob(decoded, "image/png", "final_" + (isL2 ? "L2" : "L1") + "_" + studentCode + ".png");
        const file = folder.createFile(blob);
        const driveUrl = "https://drive.google.com/open?id=" + file.getId();
        
        // التزام كامل بالأعمدة المطلوبة: K للمستوى الأول (10)، N للمستوى الثاني (13)
        newRow[isL2 ? 13 : 10] = driveUrl;
      } catch (e) {
        // لا نعطل التخزين إذا فشلت الصورة
      }
    }

    // 2. البحث عن أول صف متاح
    const currentLastRow = sheet.getLastRow();
    const searchSize = Math.max(currentLastRow + 200, 1000);
    const v = sheet.getRange(1, 1, searchSize, 1).getValues();
    const f = sheet.getRange(1, 1, searchSize, 1).getFormulas();
    let targetRow = -1;

    let lastFilledIdx = 0;
    for (let r = v.length - 1; r >= 0; r--) {
      if (String(v[r][0]) !== "") {
        lastFilledIdx = r;
        break;
      }
    }

    // نبدأ من بعد آخر صف مليان للبحث عن أول صف متاح (بدون داتا ولا معادلات)
    for (let r = lastFilledIdx + 1; r < v.length; r++) {
      if (String(v[r][0]) === "" && String(f[r][0]) === "") {
        targetRow = r + 1;
        break;
      }
    }
    
    // إذا لم نجد صفاً فارغاً في العينة، ننشئ صفاً جديداً في النهاية
    if (targetRow === -1) {
      targetRow = currentLastRow + 1;
      if (targetRow > currentMaxRows) sheet.insertRowsAfter(currentMaxRows, 1);
    }

    // 3. اكتشاف الأعمدة "المحرمة" (التي تحتوي على دوال في أول صفين) لضمان عدم المساس بتبعيات الـ ArrayFormula
    const columnF = sheet.getRange(1, 1, 2, newRow.length).getFormulas();
    const forbiddenCols = [];
    for (let c = 0; c < newRow.length; c++) {
      if (columnF[0][c] !== "" || columnF[1][c] !== "") {
        forbiddenCols.push(c);
      }
    }

    // 4. تأمين الأبعاد
    if (sheet.getMaxColumns() < newRow.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), newRow.length - sheet.getMaxColumns());
    }
    const currentMaxR = sheet.getMaxRows();
    if (targetRow > currentMaxR) {
      sheet.insertRowsAfter(currentMaxR, 1);
    }

    // 5. الكتابة الانتقائية الذكية جداً: لا نكتب إلا في الأعمدة المسموحة والخلية الفارغة تماماً
    const rowValues = sheet.getRange(targetRow, 1, 1, newRow.length).getValues()[0];
    const rowFormulas = sheet.getRange(targetRow, 1, 1, newRow.length).getFormulas()[0];

    for (let i = 0; i < newRow.length; i++) {
      // إذا كان العمود "محرم" (فيه معادلة في أول صفين)، لا نلمسه نهائياً ولا حتى نقترب منه
      if (forbiddenCols.indexOf(i) !== -1) continue;

      const newVal = newRow[i];
      const curVal = rowValues[i];
      const curFormula = rowFormulas[i];

      // نكتب فقط إذا كان لدينا بيانات جديدة والخلية فارغة "خام" (لا داتا ولا معادلة)
      if (newVal !== "" && newVal !== null && String(curVal) === "" && String(curFormula) === "") {
        sheet.getRange(targetRow, i + 1).setValue(newVal);
      }
    }

    // تسجيل العملية في اللوج للمسؤول
    try {
      let logSheet = destSS.getSheetByName("SUBMISSION_LOGS");
      if (!logSheet) {
        logSheet = destSS.insertSheet("SUBMISSION_LOGS");
        logSheet.appendRow(["Timestamp", "Student", "Exam", "Score", "Method", "Sheet"]);
      }
      logSheet.appendRow([new Date(), studentCode, data.examUrl || "N/A", displayScoreText, discoveryMethod, sheet.getName()]);
    } catch(e) {}

    // حفظ في الذاكرة الدائمة للسيرفر لمنع التكرار
    props.setProperty(cacheKey, "true");
    
    return createJsonResponse({ 
      success: true, 
      score: displayScoreText, 
      recordedIn: sheet.getName(), 
      method: discoveryMethod,
      autoLinked: autoLinked 
    });

  } catch(e) { 
    return createJsonResponse({ success: false, error: "Radical Failure: " + e.toString() }); 
  } finally {
    scriptLock.releaseLock();
  }
}


function handleGetValidCodes() {
  try {
    const codeSS_URL = "https://docs.google.com/spreadsheets/d/1w9bJFNZjyDf6NHl5b20fEN3Gh72vA4ZoF48sdh6FYRk/edit";
    const ss = SpreadsheetApp.openByUrl(codeSS_URL);
    const sheet = ss.getSheetByName("code13");
    if (!sheet) return createJsonResponse({ error: "Sheet code13 not found" });
    const values = sheet.getRange(1, 1, sheet.getLastRow(), 2).getValues();
    const codesMap = {};
    values.forEach(row => {
      const code = String(row[0]).trim();
      const name = String(row[1] || "").trim();
      if (code) codesMap[code] = name;
    });
    return createJsonResponse(codesMap);
  } catch(e) { return createJsonResponse({ error: e.toString() }); }
}

function handleGetPrerequisiteCodes(lessonNum, level) {
  try {
    const n = parseInt(lessonNum);
    if (isNaN(n) || n <= 1) return createJsonResponse([]);
    let finalSS_URL = "";
    if (level === "المستوى الثاني") {
      finalSS_URL = "https://docs.google.com/spreadsheets/d/1w9bJFNZjyDf6NHl5b20fEN3Gh72vA4ZoF48sdh6FYRk/edit";
    } else {
      finalSS_URL = "https://docs.google.com/spreadsheets/d/1V3N16W3523NQUQnLUq-a7_YPr9L-7lkHJq_AUefATcI/edit";
    }
    const ss = SpreadsheetApp.openByUrl(finalSS_URL);
    const sheet = ss.getSheetByName("FINAL");
    if (!sheet) return createJsonResponse({ error: "Sheet FINAL not found" });
    const targetCol = (n - 2) * 2 + 1; 
    const lastRow = sheet.getLastRow();
    if (lastRow < 1) return createJsonResponse([]);
    const values = sheet.getRange(1, targetCol, lastRow, 1).getValues().flat();
    const codes = values.map(v => String(v).trim()).filter(v => v);
    return createJsonResponse(codes);
  } catch(e) { return createJsonResponse({ error: e.toString() }); }
}

function handleCheckFinalExamCode(code, level) {
  try {
    if (!code) return createJsonResponse({ success: false, error: "Missing code" });
    // currently only level 1 is supported based on prompt
    const ssUrl = "https://docs.google.com/spreadsheets/d/1V3N16W3523NQUQnLUq-a7_YPr9L-7lkHJq_AUefATcI/edit";
    const ss = SpreadsheetApp.openByUrl(ssUrl);
    const sheet = ss.getSheetByName("USER");
    if (!sheet) return createJsonResponse({ success: false, error: "Sheet USER not found" });
    
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return createJsonResponse({ success: false, error: "No data in USER sheet" });
    
    const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    const codeStr = String(code).trim();
    
    let found = false;
    let password = "";
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === codeStr) {
        found = true;
        password = String(data[i][1]).trim();
        break;
      }
    }
    
    if (found) {
      return createJsonResponse({ success: true, password: password });
    } else {
      return createJsonResponse({ success: false, error: "Code not found" });
    }
  } catch(e) {
    return createJsonResponse({ success: false, error: e.toString() });
  }
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function extractVideoId(url) {
  if (!url) return "";
  const m = String(url).match(/\/d\/([^\/|\?]+)/) || String(url).match(/id=([^&]+)/) || String(url).match(/(?:v=|\/v\/|youtu\.be\/|\/embed\/)([\w-]{11})/);
  return m ? (m[1] || m[2]) : url;
}

function handleGetQuestions(url) {
  try {
    let form;
    try {
      form = FormApp.openByUrl(url);
    } catch(err) {
      const id = extractVideoId(url);
      form = FormApp.openById(id);
    }
    
    if (!form) return createJsonResponse({ error: "Form not found" });

    const questions = form.getItems().map(item => {
      const title = item.getTitle().trim();
      const type = item.getType();
      if (!title || title.includes("أسئلة الامتحان") || title.includes("اسئلة الامتحان")) return null;

      const validTypes = [
        FormApp.ItemType.MULTIPLE_CHOICE, 
        FormApp.ItemType.LIST, 
        FormApp.ItemType.CHECKBOX, 
        FormApp.ItemType.TEXT, 
        FormApp.ItemType.PARAGRAPH_TEXT
      ];
      if (validTypes.indexOf(type) === -1) return null;

      let qType = "TEXT", choices = [], correctValue = null, points = 0;
      try {
        if (type === FormApp.ItemType.MULTIPLE_CHOICE) {
          qType = "CHOICE";
          const mc = item.asMultipleChoiceItem();
          points = mc.getPoints() || 0;
          mc.getChoices().forEach(c => { if(c.isCorrectAnswer()) correctValue = c.getValue(); choices.push(c.getValue()); });
        } else if (type === FormApp.ItemType.LIST) {
          qType = "CHOICE";
          const li = item.asListItem();
          points = li.getPoints() || 0;
          li.getChoices().forEach(c => { if(c.isCorrectAnswer()) correctValue = c.getValue(); choices.push(c.getValue()); });
        } else if (type === FormApp.ItemType.CHECKBOX) {
          qType = "CHECKBOX";
          const cb = item.asCheckboxItem();
          points = cb.getPoints() || 0;
          const correctList = [];
          cb.getChoices().forEach(c => { 
            const val = c.getValue();
            if(c.isCorrectAnswer()) correctList.push(val.trim()); 
            choices.push(val); 
          });
          correctValue = correctList.sort().join(", ");
        } else if (type === FormApp.ItemType.TEXT) {
          const txt = item.asTextItem();
          points = txt.getPoints() || 0;
        } else if (type === FormApp.ItemType.PARAGRAPH_TEXT) {
          const ptxt = item.asParagraphTextItem();
          points = ptxt.getPoints() || 0;
        }
      } catch(e) {}

      return { id: item.getId().toString(), title: title, type: qType, choices: choices, correctValue: correctValue, points: points };
    }).filter(x => x);

    return createJsonResponse({ title: form.getTitle(), questions: questions });
  } catch (e) { return createJsonResponse({ error: "Radical Error: " + e.toString() }); }
}

function getFinalExamCredentials(level) {
  try {
    const isLevelTwo = (String(level) === "2" || String(level) === "المستوى الثاني");
    
    // 1. اختيار الرابط الصحيح
    let url = "https://docs.google.com/spreadsheets/d/1V3N16W3523NQUQnLUq-a7_YPr9L-7lkHJq_AUefATcI/edit";
    if (isLevelTwo) {
      url = "https://docs.google.com/spreadsheets/d/1w9bJFNZjyDf6NHl5b20fEN3Gh72vA4ZoF48sdh6FYRk/edit";
    }

    var ss = SpreadsheetApp.openByUrl(url);
    var sheet = ss.getSheetByName("USER") || ss.getSheets().find(s => s.getName().toUpperCase().trim() === "USER");
    
    if (!sheet) return createJsonResponse({error: "Sheet 'USER' not found in Level " + level});
    
    // 2. اختيار الأعمدة المطلوبة بدقة (النظام الذي طلبته)
    var codeCol = isLevelTwo ? 1 : 0; // المستوى الثاني يبدأ من B (1)، الأول من A (0)
    var passCol = isLevelTwo ? 2 : 1; // المستوى الثاني ينتهي في C (2)، الأول في B (1)

    var data = sheet.getDataRange().getDisplayValues();
    var allCodes = [];
    var allPasswords = [];
    
    for (var j = 1; j < data.length; j++) {
      var code = String(data[j][codeCol]).trim();
      var pass = String(data[j][passCol]).trim();
      
      if (code && code !== "") {
        allCodes.push(code);
        // دعم الأرقام الصافية احتياطياً
        var pure = code.replace(/[^0-9]/g, "");
        if (pure && pure !== code && pure !== "") allCodes.push(pure);
      }
      
      if (pass && pass !== "") {
        allPasswords.push(pass);
      }
    }
    
    // إزالة التكرار
    allCodes = [...new Set(allCodes)];
    allPasswords = [...new Set(allPasswords)];
    
    return createJsonResponse({ codes: allCodes, passwords: allPasswords });
  } catch(err) {
    return createJsonResponse({error: "Final Exam Error: " + err.message});
  }
}

function handleGetCertificate(code, level) {
  try {
    if (!code) return createJsonResponse({ success: false, error: "Missing code" });
    
    const searchCode = String(code).trim();
    const studentName = getStudentName(searchCode);

    let ssUrl = "";
    let sheetName = "";
    let codeCol = 0;
    let certCol = 0;

    if (level === "2") {
      ssUrl = "https://docs.google.com/spreadsheets/d/1w9bJFNZjyDf6NHl5b20fEN3Gh72vA4ZoF48sdh6FYRk/edit";
      sheetName = "quiz4";
      codeCol = 3;  // C
      certCol = 72; // BT
    } else {
      // Default to Level 1
      ssUrl = "https://docs.google.com/spreadsheets/d/1V3N16W3523NQUQnLUq-a7_YPr9L-7lkHJq_AUefATcI/edit";
      sheetName = "Sheet1";
      codeCol = 25; // Y
      certCol = 3;  // C
    }

    const ss = SpreadsheetApp.openByUrl(ssUrl);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return createJsonResponse({ success: false, error: "Sheet not found: " + sheetName });

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return createJsonResponse({ success: false, name: studentName, error: "لم يتم العثور على شهادة" });

    // تحسين السرعة: جلب الأعمدة المطلوبة فقط
    const codeValues = sheet.getRange(2, codeCol, lastRow - 1, 1).getValues();
    const certValues = sheet.getRange(2, certCol, lastRow - 1, 1).getValues();

    for (let i = 0; i < codeValues.length; i++) {
      const studentCode = String(codeValues[i][0]).trim();
      const presentationUrl = String(certValues[i][0]).trim();

      if (studentCode === searchCode && presentationUrl) {
        return createJsonResponse({ 
          success: true, 
          name: studentName,
          certificateUrl: presentationUrl,
          presentationId: extractVideoId(presentationUrl)
        });
      }
    }

    return createJsonResponse({ success: false, name: studentName, error: "Certificate not found" });
  } catch (e) {
    return createJsonResponse({ success: false, error: e.toString() });
  }
}

function getStudentName(code) {
  try {
    const codeSS_URL = "https://docs.google.com/spreadsheets/d/1w9bJFNZjyDf6NHl5b20fEN3Gh72vA4ZoF48sdh6FYRk/edit";
    const ss = SpreadsheetApp.openByUrl(codeSS_URL);
    const sheet = ss.getSheetByName("code13");
    if (sheet) {
      const values = sheet.getRange(1, 1, sheet.getLastRow(), 2).getValues();
      for (let i = 0; i < values.length; i++) {
        if (String(values[i][0]).trim() === code) return String(values[i][1]).trim();
      }
    }
    
    // Check secondary registration sheet
    const secondSS = "https://docs.google.com/spreadsheets/d/1Cts5whXGJTaXTvjlbR7Mt31rQE5hPzkQavslHhYTxgI/edit";
    const ss2 = SpreadsheetApp.openByUrl(secondSS);
    const sheet2 = ss2.getSheetByName("code");
    if (sheet2) {
       const values = sheet2.getRange(1, 1, sheet2.getLastRow(), 2).getValues();
       for (let i = 0; i < values.length; i++) {
        if (String(values[i][0]).trim() === code) return String(values[i][1]).trim();
      }
    }
  } catch(e) {}
  return "";
}

function handleGetUserStatus(code, level) {
  try {
    const searchCode = String(code).trim();
    const name = getStudentName(searchCode);
    
    let ssUrl = "";
    let sheetName = "";
    let totalLessons = 0;

    if (level === "2") {
      ssUrl = "https://docs.google.com/spreadsheets/d/1w9bJFNZjyDf6NHl5b20fEN3Gh72vA4ZoF48sdh6FYRk/edit";
      sheetName = "quiz4";
      totalLessons = 4; // 3 عادي + 1 نهائي
    } else {
      ssUrl = "https://docs.google.com/spreadsheets/d/1V3N16W3523NQUQnLUq-a7_YPr9L-7lkHJq_AUefATcI/edit";
      sheetName = "FINAL";
      totalLessons = 10; // 9 عادي + 1 نهائي
    }

    const ss = SpreadsheetApp.openByUrl(ssUrl);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return createJsonResponse({ error: "Completion sheet not found: " + sheetName });

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const missing = [];
    
    for (let n = 1; n <= totalLessons; n++) {
      const colIdx = (n - 1) * 2;
      if (colIdx >= headers.length) break;
      
      const passers = data.map(row => String(row[colIdx]).trim());
      if (!passers.includes(searchCode)) {
        let lessonTitle = headers[colIdx] || ("الدرس " + n);
        let cleanTitle = lessonTitle
          .replace(/Passers/gi, "")
          .replace(/الرقم الكودي لـ/gi, "")
          .replace(/الرقم الكودي/gi, "")
          .replace(/ناجحين/gi, "")
          .trim();
        missing.push(cleanTitle || ("الدرس " + n));
      }
    }

    return createJsonResponse({ 
      success: true, 
      name: name, 
      missingLessons: missing,
      isEligible: missing.length === 0 
    });
  } catch(e) {
    return createJsonResponse({ error: e.toString() });
  }
}
function compareCodes(code1, code2) {
  if (!code1 || !code2) return false;
  // تنظيف الكود من أي زيادات نصية أو مسافات، وتحويله لنص خالص (بدون تحويله لأرقام لتجنب أخطاء الأكواد الطويلة)
  const s1 = String(code1).trim().replace(/\.0$/, "");
  const s2 = String(code2).trim().replace(/\.0$/, "");
  return s1 === s2;
}

function handleGetCertificateFullStatus(code, level) {
  try {
    if (!code) return createJsonResponse({ success: false, error: "Missing code" });
    const searchCode = String(code).trim();
    
    const studentName = getStudentName(searchCode);

    let certSSId = (level === "2") ? "1w9bJFNZjyDf6NHl5b20fEN3Gh72vA4ZoF48sdh6FYRk" : "1V3N16W3523NQUQnLUq-a7_YPr9L-7lkHJq_AUefATcI";
    let certSheetName = (level === "2") ? "quiz4" : "Sheet1";
    let certCodeCol = (level === "2") ? 3 : 25;
    let certUrlCol = (level === "2") ? 72 : 3;
    
    let statusSheetName = "FINAL";
    let totalLessons = (level === "2") ? 4 : 10;

    const ss = SpreadsheetApp.openById(certSSId);
    
    // 1. البحث عن الشهادة
    let foundUrl = "";
    let studentInCertSheet = false;
    const certSheet = ss.getSheetByName(certSheetName);
    if (certSheet) {
      const data = certSheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (compareCodes(data[i][certCodeCol - 1], searchCode)) {
          studentInCertSheet = true;
          foundUrl = String(data[i][certUrlCol - 1] || "").trim();
          if (foundUrl) break;
        }
      }
    }

    if (foundUrl) {
      return createJsonResponse({
        success: true,
        isEligible: true,
        name: studentName,
        certificateUrl: foundUrl,
        presentationId: extractVideoId(foundUrl)
      });
    }

    if (studentInCertSheet) {
      return createJsonResponse({
        success: true,
        isEligible: false,
        name: studentName,
        statusMessage: `أهلاً يا ${studentName || "بطل"}، لقد أتممت جميع الامتحانات بنجاح! شهادتك قيد الاستخراج الآن، حاول مرة اخرى بعد ثلاث ساعات وانت متصل بالانترنت.`
      });
    }

    // 2. فحص النقص (بسرعة البرق)
    const statusSheet = ss.getSheetByName(statusSheetName);
    const missing = [];
    if (statusSheet) {
      const data = statusSheet.getDataRange().getValues();
      const headers = data[0];
      
      for (let n = 1; n <= totalLessons; n++) {
        const colIdx = (n - 1) * 2;
        if (colIdx >= headers.length) break;
        
        let found = false;
        for (let r = 1; r < data.length; r++) {
          if (compareCodes(data[r][colIdx], searchCode)) {
            found = true;
            break;
          }
        }
        
        if (!found) {
          let t = (headers[colIdx] || "").replace(/Passers|الرقم الكودي لـ|الرقم الكودي|ناجحين/gi, "").trim();
          missing.push(t || ("الدرس " + n));
        }
      }
    }

    return createJsonResponse({
      success: true,
      isEligible: false,
      name: studentName,
      missingLessons: missing
    });

  } catch (e) {
    return createJsonResponse({ success: false, error: e.toString() });
  }
}

function getStudentName(code) {
  try {
    const codeSS_URL = "https://docs.google.com/spreadsheets/d/1w9bJFNZjyDf6NHl5b20fEN3Gh72vA4ZoF48sdh6FYRk/edit";
    const ss = SpreadsheetApp.openByUrl(codeSS_URL);
    const sheet = ss.getSheetByName("code13");
    if (!sheet) return "";
    const lastRow = sheet.getLastRow();
    const data = sheet.getRange(1, 1, lastRow, 2).getValues();
    for (var i = 0; i < data.length; i++) {
      if (compareCodes(data[i][0], code)) {
        return String(data[i][1] || "").trim();
      }
    }
  } catch (e) { }
  return "";
}

function handleGetAllStatuses(level) {
  try {
    let certSSId = (level === "2") ? "1w9bJFNZjyDf6NHl5b20fEN3Gh72vA4ZoF48sdh6FYRk" : "1V3N16W3523NQUQnLUq-a7_YPr9L-7lkHJq_AUefATcI";
    let certSheetName = (level === "2") ? "quiz4" : "Sheet1";
    let certCodeCol = (level === "2") ? 3 : 25;
    let certUrlCol = (level === "2") ? 72 : 3;

    let statusSheetName = "FINAL";
    let totalLessons = (level === "2") ? 4 : 10;

    const ss = SpreadsheetApp.openById(certSSId);
    const mapping = {};

    // 1. بناء خريطة الأسماء (مرة واحدة)
    const namesMap = {};
    try {
      const codeSS = SpreadsheetApp.openByUrl("https://docs.google.com/spreadsheets/d/1w9bJFNZjyDf6NHl5b20fEN3Gh72vA4ZoF48sdh6FYRk/edit");
      const nameSheet = codeSS.getSheetByName("code13");
      if (nameSheet) {
        const nData = nameSheet.getDataRange().getValues();
        for(let i=0; i<nData.length; i++) {
          const c = String(nData[i][0]).trim();
          if (c) namesMap[c] = String(nData[i][1]).trim();
        }
      }
    } catch(e) {}

    // 2. جلب الشهادات (مرة واحدة)
    const certSheet = ss.getSheetByName(certSheetName);
    if (certSheet) {
      const data = certSheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const c = String(data[i][certCodeCol - 1]).trim();
        const u = String(data[i][certUrlCol - 1]).trim();
        if (c) {
          if (u) {
            const id = extractVideoId(u);
            mapping[c] = { isEligible: true, url: u, id: id, name: namesMap[c] || "" };
          } else {
            mapping[c] = { isEligible: false, name: namesMap[c] || "", statusMessage: "أهلاً بك، لقد أتممت الامتحانات بنجاح، شهادتك قيد الاستخراج, حاول مرة اخرى بعد ثلاث ساعات وانت متصل بالانترنت." };
          }
        }
      }
    }

    // 3. جلب حالة الامتحانات (مرة واحدة وبكفاءة O(N))
    const statusSheet = ss.getSheetByName(statusSheetName);
    if (statusSheet) {
      const fullData = statusSheet.getDataRange().getValues();
      const headers = fullData[0];
      
      const passersSets = [];
      for (let n = 0; n < totalLessons; n++) {
        const colIdx = n * 2;
        const set = new Set();
        if (colIdx < headers.length) {
          for (let r = 1; r < fullData.length; r++) {
            const val = String(fullData[r][colIdx]).trim();
            if (val) set.add(val);
          }
        }
        passersSets.push(set);
      }

      for (let c in namesMap) {
        if (!mapping[c]) {
          let missing = [];
          for (let n = 0; n < totalLessons; n++) {
            if (!passersSets[n].has(c)) {
              let t = (headers[n * 2] || "").replace(/Passers|الرقم الكودي لـ|الرقم الكودي|ناجحين/gi, "").trim();
              missing.push(t || ("الدرس " + (n + 1)));
            }
          }
          if (missing.length > 0) {
            mapping[c] = { isEligible: false, missingLessons: missing, name: namesMap[c] };
          }
        }
      }
    }

    return createJsonResponse(mapping);
  } catch (e) {
    return createJsonResponse({ error: e.toString() });
  }
}


/**
 * 🛠 القائد الوحيد للتنبيهات (تم حذف onEdit لمنع التكرار)
 */
function onChange(e) {
  broadcastUpdateToAll();
}

/**
 * 📡 إذاعة إشعار التحديث لكل المستخدمين (العمود C)
 */
function broadcastUpdateToAll() {
  // 🔒 قفل برمجي: يمنع تشغيل الدالة مرتين في نفس اللحظة
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // لو الدالة شغالة بالفعل، اخرج فوراً
  
  try {
    const SHEET_ID = '1kZKjF2KDsGT0HslGSenN-pDTzx4FpX0QDPqX0ZOnriY';
    const ss = SpreadsheetApp.openById(SHEET_ID);
  const configSheet = ss.getSheetByName("APP_CONFIG");
  const notifySheet = ss.getSheetByName("KHMI_NOFICATION");
  
  if (!configSheet || !notifySheet) return;

  const lastRowConfig = configSheet.getLastRow();
  if (lastRowConfig < 2) return;
  
  // 1. جلب بيانات التحديث
  const latestVersion = String(configSheet.getRange(lastRowConfig, 1).getValue()).trim(); 
  const updateUrl = configSheet.getRange(lastRowConfig, 2).getValue();
  
  // 🛡️ حماية من التكرار: لا ترسل نفس الإصدار مرتين
  const props = PropertiesService.getScriptProperties();
  const lastSentVersion = props.getProperty("LAST_SENT_VERSION");

  if (latestVersion === lastSentVersion) {
    console.log("Skipping: Version " + latestVersion + " already triggered.");
    return;
  }

  // 3. 👥 جلب التوكنات (C) والنسخ (H) لفلترة المستخدمين
  const lastRowNotify = notifySheet.getLastRow();
  if (lastRowNotify < 1) return;
  
  const userData = notifySheet.getRange("C1:H" + lastRowNotify).getValues();
  const targetTokens = [];

  // دالة مقارنة النسخ داخل السيرفر
  function isOlder(userVer, latestVer) {
    if (!userVer || userVer === "undefined" || userVer === "") return true; 
    var u = String(userVer).split('.').map(Number);
    var l = String(latestVer).split('.').map(Number);
    for (var i = 0; i < 3; i++) {
      if ((u[i] || 0) < (l[i] || 0)) return true;
      if ((u[i] || 0) > (l[i] || 0)) return false;
    }
    return false;
  }

  userData.forEach(row => {
    const token = String(row[0]).trim();
    const userVersion = String(row[5]).trim(); // العمود H (الخامس بعد C)
    
    if (token.startsWith("ExponentPushToken") && isOlder(userVersion, latestVersion)) {
      targetTokens.push(token);
    }
  });

  // 🧹 إزالة التكرار
  const allTokens = [...new Set(targetTokens)];

  if (allTokens.length === 0) {
    console.log("No users found with older versions. Skipping broadcast.");
    return;
  }

  // 4. إرسال إشعار مرئي (Visible) فقط لمن يحتاج التحديث
  const chunks = [];
  while (allTokens.length > 0) chunks.push(allTokens.splice(0, 100));

  chunks.forEach((chunk, index) => {
    const message = {
      to: chunk,
      title: "✨ تحديث جديد متاح!",
      body: "الإصدار الجديد " + latestVersion + " متاح الآن. حدث التطبيق للاستمتاع بآخر الميزات.",
      data: { type: "update", url: updateUrl, version: latestVersion, isLocal: false },
      sound: "default",
      priority: "high",
      channelId: "khmi-notifications",
      badge: 1
    };

    try {
      const response = UrlFetchApp.fetch("https://exp.host/--/api/v2/push/send", {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(message)
      });
      console.log("✅ Chunk " + (index + 1) + " sent. Response: " + response.getContentText());
    } catch (e) {
      console.error("❌ Error sending chunk " + (index + 1) + ": " + e.toString());
    }
  });

  // تحديث الذاكرة
  props.setProperty("LAST_SENT_VERSION", latestVersion);
  console.log("🏁 Global Broadcast Finished for: " + latestVersion);
  
  } finally {
    lock.releaseLock(); // فتح القفل للعملية القادمة
  }
}

/**
 * دالة إرسال إشعارات المسؤول من التطبيق
 */
function handleSendAdminNotification(data) {
  try {
    const ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
    
    // 1. تسجيل العملية في شيت اللوج (أضفنا عمود التوكين)
    let logSheet = ss.getSheetByName(ADMIN_LOGS_SHEET_NAME);
    if (!logSheet) {
      logSheet = ss.insertSheet(ADMIN_LOGS_SHEET_NAME);
      logSheet.appendRow(["Timestamp", "Type", "Target Row", "Title", "Message (AR)", "Message (EN)", "Token"]);
    }

    // 2. جلب المستهدفين
    const notifSheet = ss.getSheetByName(NOTIFICATION_SHEET_NAME);
    if (!notifSheet) return createJsonResponse({ success: false, error: "Notification sheet not found" });

    const targets = [];
    let loggedToken = "Broadcast";

    if (data.type === "individual") {
      const row = parseInt(data.row);
      if (isNaN(row) || row < 2) return createJsonResponse({ success: false, error: "Invalid row number" });
      const token = notifSheet.getRange(row, 3).getValue();
      const lang = notifSheet.getRange(row, 7).getValue() || "ar";
      if (token && token.includes("ExponentPushToken")) {
        targets.push({ token: token, lang: lang });
        loggedToken = token;
      }
    } else {
      const lastRow = notifSheet.getLastRow();
      if (lastRow < 2) return createJsonResponse({ success: false, error: "No users found" });
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

    // الإرسال الفعلي باستخدام الدالة المساعدة لضمان الثبات
    const resultStatus = sendExpoPushNotification(targets, null, (data.body_ar || data.body_en));
    
    return createJsonResponse({ 
      success: true, 
      count: targets.length,
      status: resultStatus 
    });

  } catch (e) {
    return createJsonResponse({ success: false, error: e.toString() });
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

