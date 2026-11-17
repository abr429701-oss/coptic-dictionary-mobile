import { useState, useEffect } from 'react';
import { Platform, AppState } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { useLang } from '@/contexts/LanguageContext';
import { translations } from '@/contexts/LanguageContext'; // For background localization

const SHEET_ID = '1kZKjF2KDsGT0HslGSenN-pDTzx4FpX0QDPqX0ZOnriY';
const APP_CONFIG_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=APP_CONFIG&range=A2:G&headers=0`;
const SKIP_DATA_KEY = '@khmi/skipped_update_info';
export const BACKGROUND_UPDATE_TASK = 'BACKGROUND_UPDATE_CHECK';

export interface UpdateInfo {
  needsUpdate: boolean;
  isMandatory: boolean;
  updateUrl: string;
  latestVersion: string;
  message?: string;
  whatsNew?: {
    ar?: string;
    en?: string;
    fr?: string;
    de?: string;
  };
}

export function useAppUpdate() {
  const { t } = useLang();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [currentAppLink, setCurrentAppLink] = useState<string>("https://play.google.com/store/apps/details?id=com.khmi.coptic");
  const [canShow, setCanShow] = useState(false);
  const currentVersion = Constants.expoConfig?.version || '1.0.0';

  useEffect(() => {
    // تحميل الرابط المخزن فوراً عند البداية
    const loadCachedLink = async () => {
      const cached = await AsyncStorage.getItem('@khmi/app_link');
      if (cached) setCurrentAppLink(cached);
    };
    loadCachedLink();

    const timer = setTimeout(() => {
      setCanShow(true);
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  const checkVersion = async () => {
    try {
      // إضافة رقم عشوائي للرابط لمنع الـ Caching وضمان دقة البيانات
      const cacheBuster = `&cb=${Date.now()}`;
      const response = await fetch(APP_CONFIG_URL + cacheBuster);
      const text = await response.text();
      const jsonString = text.replace(/^[^{]+/, '').replace(/\);?$/, '');
      const json = JSON.parse(jsonString);
      const rows = json.table.rows || [];

      // لو الشيت فاضي تماماً، امسح أي تنبيه تحديث ظاهر
      if (rows.length === 0 || !rows[rows.length - 1].c || !rows[rows.length - 1].c[0]?.v) {
        setUpdateInfo(null);
        return;
      }

      // قراءة آخر صف (Latest Row) يحتوي على بيانات في العمود الثاني (الرابط)
      let lastRowIndex = rows.length - 1;
      while (lastRowIndex >= 0) {
        const rowData = rows[lastRowIndex].c;
        if (rowData && (rowData[1]?.v || rowData[1]?.f)) {
          break;
        }
        lastRowIndex--;
      }

      if (lastRowIndex < 0) {
        setUpdateInfo(null);
        return;
      }

      const data = rows[lastRowIndex].c;
      console.log(`📡 Fetched Config from Row ${lastRowIndex + 2}:`, data.map((d: any) => d?.v || d?.f));

      const latestVersion = (data[0]?.v || data[0]?.f) ? String(data[0]?.v || data[0]?.f).trim() : '0.0.0';
      const updateUrl = (data[1]?.v || data[1]?.f) ? String(data[1]?.v || data[1]?.f).trim() : '';
      const forcedStatus = (data[2]?.v || data[2]?.f) ? String(data[2]?.v || data[2]?.f).trim() : 'اجباري';

      const whatsNewData = {
        ar: (data[3]?.v || data[3]?.f) ? String(data[3]?.v || data[3]?.f).trim() : '',
        en: (data[4]?.v || data[4]?.f) ? String(data[4]?.v || data[4]?.f).trim() : '',
        fr: (data[5]?.v || data[5]?.f) ? String(data[5]?.v || data[5]?.f).trim() : '',
        de: (data[6]?.v || data[6]?.f) ? String(data[6]?.v || data[6]?.f).trim() : '',
      };


      const compare = compareVersions(currentVersion, latestVersion);
      const isMandatory = !forcedStatus.includes('اختياري');

      console.log(`🌐 Check: Current[${currentVersion}] | Sheet[${latestVersion}] | Mandatory[${isMandatory}]`);

      if (updateUrl) {
        setCurrentAppLink(updateUrl);
        await AsyncStorage.setItem('@khmi/app_link', updateUrl);
      }

      if (compare < 0) {
        // لو التحديث متاح، نشوف موضوع الـ Skip
        const skipDataStr = await AsyncStorage.getItem(SKIP_DATA_KEY);
        if (skipDataStr) {
          const { version, timestamp } = JSON.parse(skipDataStr);

          // لو رقم النسخة في الشيت اختلف عن اللي متخزن في الـ Skip، امسح الـ Skip فوراً
          if (version !== latestVersion) {
            console.log(`✨ New version [${latestVersion}] detected! Clearing old skip [${version}]`);
            await AsyncStorage.removeItem(SKIP_DATA_KEY);
          } else if (!isMandatory) {
            // لو نفس النسخة وهي اختيارية، نطبق شرط الـ 48 ساعة
            const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            if ((now - timestamp) < TWO_DAYS_MS) {
              const hoursLeft = Math.round((TWO_DAYS_MS - (now - timestamp)) / (60 * 60 * 1000));
              console.log(`⏹️ Still skipping version [${version}] for ~${hoursLeft}h`);
              setUpdateInfo(null);
              return;
            }
          }
        }

        if (isMandatory) {
          console.log('🛡️ Mandatory Update! Ignoring all skips.');
        }

        console.log('🚀 Triggering Modal Display...');
        setUpdateInfo({
          needsUpdate: true,
          isMandatory: isMandatory,
          updateUrl: updateUrl || 'https://play.google.com/store',
          latestVersion: latestVersion,
          whatsNew: whatsNewData,
        });

        // 🔥 حفظ رقم النسخة المكتشفة محلياً لدعم الأوفلاين التام
        await AsyncStorage.setItem('@khmi/cached_latest_version', latestVersion);
      } else {
        setUpdateInfo(null);
      }
    } catch (error) {
      console.warn('Update check failed:', error);
    }
  };

  useEffect(() => {
    checkVersion();
    const interval = setInterval(checkVersion, 30000); // 30 ثانية كافية للتحديث التلقائي

    // تسجيل مهمة الخلفية للتحقق من التحديثات
    const registerBackgroundTask = async () => {
      try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_UPDATE_TASK);
        if (!isRegistered) {
          await BackgroundFetch.registerTaskAsync(BACKGROUND_UPDATE_TASK, {
            minimumInterval: 60, // وضع الأدمن: دقيقة واحدة
            stopOnTerminate: false,
            startOnBoot: true,
          });
        }
      } catch (err) { console.log("Background Update Task Error", err); }
    };
    registerBackgroundTask();

    return () => clearInterval(interval);
  }, []);

  const skipUpdate = async () => {
    if (updateInfo) {
      // تخزين التوقيت والإصدار الحالي الذي تم تخطيه
      const skipData = {
        version: updateInfo.latestVersion,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(SKIP_DATA_KEY, JSON.stringify(skipData));
      setUpdateInfo(null);
    }
  };

  return { updateInfo: canShow ? updateInfo : null, currentAppLink, checkVersion, skipUpdate };
}


function compareVersions(v1: string, v2: string) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

// -------------------------------------------------------------------
// 🔥 تعريف مهمة الخلفية للتحقق من التحديثات خارج التطبيق
// -------------------------------------------------------------------
// المهمة تم تعريفها بشكل عالمي في _layout.tsx لضمان الاستقرار
