import React, { createContext, useContext, useState, useEffect } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface AppConfig {
  marquee: string;
  maintenance: boolean;
  forceUpdate: boolean;
  drawerMsg: string;
  storeLink: string;
  waLink: string;
}

interface AppConfigContextProps {
  config: AppConfig;
  refreshConfig: () => Promise<void>;
  isLoading: boolean;
}

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxyJEYdRlUu2AvuPpJxDQVqx4aN3lDIaox17Fwx6j5mIveWXPvY94GeenPt1kyeMUye/exec";

const AppConfigContext = createContext<AppConfigContextProps | undefined>(undefined);

export const AppConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<AppConfig>({
    marquee: "",
    maintenance: false,
    forceUpdate: false,
    drawerMsg: "",
    storeLink: "",
    waLink: ""
  });
  const [isLoading, setIsLoading] = useState(true);

  const refreshConfig = async () => {
    try {
      const res = await fetch(`${APPS_SCRIPT_URL}?action=getAppConfig`, { cache: "no-store" });
      const text = await res.text();
      
      // فحص سريع للتأكد أن الرد هو JSON وليس صفحة خطأ HTML
      if (text.trim().startsWith("<")) {
        console.warn("Server returned HTML instead of JSON. Check script deployment.");
        return;
      }

      const data = JSON.parse(text);
      if (data.success) {
        setConfig(data.config);

        // فحص وتنفيذ الأوامر التقنية المباشرة من مركز الأوامر
        if (data.config.system_command) {
          try {
            const cmd = JSON.parse(data.config.system_command);
            const lastExecuted = await AsyncStorage.getItem("@coptic/last_command_time");

            // ننفذ الأمر فقط إذا كان جديداً (وقته أكبر من آخر أمر نفذناه)
            if (cmd.time && (!lastExecuted || Number(cmd.time) > Number(lastExecuted))) {
              await AsyncStorage.setItem("@coptic/last_command_time", String(cmd.time));

              if (cmd.id === "REFRESH_ALL") {
                // إعادة تحميل البيانات فوراً
                refreshConfig();
              } else if (cmd.id === "CLEAR_CACHE") {
                // مسح الكاش والصور
                await AsyncStorage.clear(); // تحذير: هذا سيمسح كل شيء، يمكن تخصيصه لمسح الكاش فقط
                Alert.alert("تنبيه النظام", "تم تحديث ذاكرة التطبيق بنجاح.");
              }
            }
          } catch (e) { }
        }
      }
    } catch (e) {
      // نستخدم warn بدل error لتجنب الشاشة الحمراء المزعجة في وضع التطوير عند انقطاع النت
      console.warn("Failed to fetch app config - Network Issue");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshConfig();

    // فحص دوري كل 30 ثانية لتحديث الإعدادات (وضع الصيانة، الإعلانات، إلخ)
    const interval = setInterval(() => {
      refreshConfig();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <AppConfigContext.Provider value={{ config, refreshConfig, isLoading }}>
      {children}
    </AppConfigContext.Provider>
  );
};

export const useAppConfig = () => {
  const context = useContext(AppConfigContext);
  if (context === undefined) {
    throw new Error("useAppConfig must be used within an AppConfigProvider");
  }
  return context;
};
