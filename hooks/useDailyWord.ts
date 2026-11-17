import { useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { logActivity } from '@/hooks/useUserTracking';
import { useLang, translateTerm } from '@/contexts/LanguageContext';
import { useSplash } from '@/contexts/SplashContext';
import type { DictionaryEntry } from './useDictionary';
import { loadEntries } from './useOfflineStorage';

const NOTIF_HOUR = 12;
const NOTIF_MINUTE = 57;
const DAYS_TO_SCHEDULE = 30;
const RESCHEDULE_THRESHOLD = 7;
const CHANNEL_ID = 'daily-word-channel';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function useDailyWord(onSelectEntry?: (entry: DictionaryEntry) => void) {
  const { lang, t } = useLang();
  const { splashDone } = useSplash();
  const lastLangRef = useRef<string | null>(null);
  const isSchedulingRef = useRef(false);

  // ─── معالجة الضغط على الإشعار ───────────────────────────────────────────────
  const handleResponse = useCallback(async (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data;
    const entryId = data?.entryId;
    if (entryId && onSelectEntry) {
      try {
        const entries = await loadEntries();
        if (entries) {
          const entry = entries.find(e => e.id === entryId);
          if (entry) onSelectEntry(entry);
          else console.warn("Entry not found:", entryId);
        }
      } catch (e) {
        console.warn("Failed to open entry from notification", e);
      }
    }
  }, [onSelectEntry]);

  // ─── الاستماع للضغط على الإشعار ─────────────────────────────────────────────
  useEffect(() => {
    if (!splashDone) return;

    const checkInitial = async () => {
      try {
        const response = await Notifications.getLastNotificationResponseAsync();
        if (response) {
          const data = response.notification.request.content.data;
          logActivity("notif_click_daily", undefined, `Opened Daily Word: ${data?.entryId || "unknown"}`);
          setTimeout(() => handleResponse(response), 500);
        }
      } catch (e) {
        console.warn("getLastNotificationResponseAsync is not available:", e);
      }
    };
    checkInitial();

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'daily_word') {
        logActivity("notif_click_daily", undefined, `Clicked Daily Word: ${data?.entryId || "unknown"}`);
      }
      handleResponse(response);
    });

    return () => subscription.remove();
  }, [handleResponse, splashDone]);

  // ─── بناء نص الإشعار ─────────────────────────────────────────────────────────
  const buildNotificationBody = useCallback((entry: DictionaryEntry): string => {
    let meaning = entry.arabic || "";
    if (lang === 'en') meaning = entry.english || entry.arabic || "";
    else if (lang === 'fr') meaning = entry.french || entry.arabic || "";
    else if (lang === 'de') meaning = entry.german || entry.arabic || "";

    const firstMeaning = meaning.split(/[،,;\/\n]/)[0].trim();
    const origin = translateTerm(entry.origin, lang);
    const typeValue = entry.wordType || entry.gender;
    const translatedType = translateTerm(typeValue, lang);

    let body = `${t.notification.labels.word}: ${entry.coptic}\n`;
    body += `${t.notification.labels.meaning}: ${firstMeaning}`;
    if (translatedType) body += `\n${t.notification.labels.type}: ${translatedType}`;
    if (origin) body += `\n${t.notification.labels.origin}: ${origin}`;

    return body;
  }, [lang, t]);

  // ─── حساب الثواني حتى الساعة 12:49 ظهراً ليوم معين ───────────────────────
  const getSecondsUntil = (daysFromNow: number): number => {
    const now = new Date();
    const target = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + daysFromNow,
      NOTIF_HOUR,
      NOTIF_MINUTE,
      0,
      0
    );
    const diff = Math.floor((target.getTime() - now.getTime()) / 1000);
    return Math.max(diff, 1); // لا تكن صفراً أو سالباً
  };

  // ─── الجدولة الرئيسية ────────────────────────────────────────────────────────
  const scheduleDailyWords = useCallback(async (forceReschedule = false) => {
    if (isSchedulingRef.current) return;
    isSchedulingRef.current = true;

    try {
      // 1. طلب الصلاحيات
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.warn("Notification permission not granted");
        return;
      }

      // 2. إنشاء القناة على Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: t.notification.dailyWord,
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
          sound: 'notification.wav',
          enableLights: true,
          enableVibrate: true,
          showBadge: true,
        });
      }

      // 3. تحقق من عدد الإشعارات المتبقية إذا لم يكن إعادة جدولة إجبارية
      if (!forceReschedule) {
        const pending = await Notifications.getAllScheduledNotificationsAsync();
        const dailyPending = pending.filter(n => n.content.data?.type === 'daily_word');
        if (dailyPending.length >= RESCHEDULE_THRESHOLD) {
          console.log(`✅ ${dailyPending.length} notifications already scheduled. Skipping.`);
          return;
        }
        console.log(`⚠️ Only ${dailyPending.length} left — rescheduling...`);
      }

      // 4. تأكد من وجود القاموس قبل إلغاء أي إشعارات مجدولة
      const entries = await loadEntries();
      if (!entries?.length) { console.warn("No local dictionary entries available for daily notification"); return; }

      // 5. إلغاء الإشعارات القديمة فقط (من نوع daily_word)
      const allPending = await Notifications.getAllScheduledNotificationsAsync();
      const oldIds = allPending
        .filter(n => n.content.data?.type === 'daily_word')
        .map(n => n.identifier);
      await Promise.all(oldIds.map(id => Notifications.cancelScheduledNotificationAsync(id)));

      // 6. حساب نقطة البداية
      // لو الوقت الحالي قبل 12:49 → ابدأ من اليوم (offset=0)
      // لو الوقت الحالي بعد 12:49 → ابدأ من الغد (offset=1)
      const now = new Date();
      const todayTarget = new Date(
        now.getFullYear(), now.getMonth(), now.getDate(),
        NOTIF_HOUR, NOTIF_MINUTE, 0, 0
      );
      const startOffset = now < todayTarget ? 0 : 1;

      // 7. خلط الكلمات وجدولتها
      const shuffled = [...entries].sort(() => 0.5 - Math.random());

      for (let i = 0; i < DAYS_TO_SCHEDULE; i++) {
        const entry = shuffled[i % shuffled.length];
        const dayOffset = startOffset + i;
        const secondsUntil = getSecondsUntil(dayOffset);

        await Notifications.scheduleNotificationAsync({
          identifier: `daily-word-day-${i}`,
          content: {
            title: t.notification.dailyWord,
            body: buildNotificationBody(entry),
            data: {
              entryId: entry.id,
              isLocal: true,
              type: 'daily_word',
            },
            sound: 'notification.wav',
            priority: Notifications.AndroidNotificationPriority.MAX,
            channelId: CHANNEL_ID,
          } as any,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: secondsUntil,
            repeats: false,
          },
        });
      }

      lastLangRef.current = lang;
      console.log(
        `✅ Scheduled ${DAYS_TO_SCHEDULE} notifications. ` +
        `First fires ${startOffset === 0 ? 'TODAY' : 'TOMORROW'} at ${NOTIF_HOUR}:${String(NOTIF_MINUTE).padStart(2, '0')} PM`
      );

    } catch (e: any) {
      console.error("Scheduling failed:", e);
    } finally {
      isSchedulingRef.current = false;
    }
  }, [lang, t, buildNotificationBody]);

  // ─── تشغيل الجدولة ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!splashDone) return;

    const firstRun = lastLangRef.current === null;
    const langChanged = !firstRun && lastLangRef.current !== lang;

    if (firstRun || langChanged) {
      const timer = setTimeout(() => scheduleDailyWords(true), 1500);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => scheduleDailyWords(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [lang, splashDone, scheduleDailyWords]);
}
