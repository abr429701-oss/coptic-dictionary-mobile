import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  Text,
  Dimensions,
  Platform,
  Image,
} from "react-native";
import { Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width, height } = Dimensions.get("window");

const GOLD = "#C8A951";
const GOLD_L = "#F0D878";
const GOLD_DIM = "rgba(200,169,81,0.35)";
const BG = "#070202";

/* ─── صوت الويب — ناقوس كنسي احترافي ────────────────────── */
function playWebChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    function bell(freq: number, gain: number, startTime: number, decay: number) {
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const env = ctx.createGain();
      const reverb = ctx.createGain();
      osc.connect(env);
      osc2.connect(env);
      env.connect(reverb);
      reverb.connect(ctx.destination);
      osc.type = "sine";
      osc2.type = "sine";
      osc.frequency.value = freq;
      osc2.frequency.value = freq * 2.756;
      reverb.gain.value = 0.85;
      env.gain.setValueAtTime(0, startTime);
      env.gain.linearRampToValueAtTime(gain, startTime + 0.012);
      env.gain.exponentialRampToValueAtTime(gain * 0.3, startTime + 0.3);
      env.gain.exponentialRampToValueAtTime(0.0001, startTime + decay);
      osc.start(startTime); osc.stop(startTime + decay);
      osc2.start(startTime); osc2.stop(startTime + decay);
    }

    const t = ctx.currentTime;
    bell(220.00, 0.35, t, 4.5);
    bell(329.63, 0.22, t, 3.8);
    bell(440.00, 0.16, t, 3.2);
    bell(659.25, 0.09, t, 2.5);
    bell(220.00, 0.18, t + 0.5, 3.5);
    bell(329.63, 0.11, t + 0.5, 3.0);
    bell(523.25, 0.14, t + 1.0, 3.0);
    bell(659.25, 0.09, t + 1.2, 2.5);
    bell(880.00, 0.06, t + 1.4, 2.0);
  } catch (_) { }
}

/* ─── حرف ملفوف حول دائرة ────────────────────────────────── */
interface ArcLetterProps {
  char: string;
  angle: number;
  radius: number;
  fontSize: number;
  color: string;
  opacity: Animated.Value;
}
function ArcLetter({ char, angle, radius, fontSize, color, opacity }: ArcLetterProps) {
  const rad = (angle * Math.PI) / 180;
  const x = Math.cos(rad) * radius;
  const y = Math.sin(rad) * radius;
  // الدوران يجعل كل حرف يواجه الخارج (باتجاه من المركز)
  const rotateDeg = `${angle + 90}deg`;
  return (
    <Animated.Text
      style={{
        position: "absolute",
        fontSize,
        fontFamily: "Inter_600SemiBold",
        color,
        opacity,
        letterSpacing: 0,
        transform: [
          { translateX: x - fontSize * 0.3 },
          { translateY: y - fontSize * 0.55 },
          { rotate: rotateDeg },
        ],
      }}
    >
      {char}
    </Animated.Text>
  );
}

interface Props { onFinish: () => void }

// علم عالمي لضمان تشغيل الصوت مرة واحدة فقط في الجلسة الواحدة (يمنع الازدواج في وضع التطوير)
let introSoundStarted = false;

export function SplashAnimation({ onFinish }: Props) {
  const [splashMode, setSplashMode] = useState<'original' | 'tut' | 'logo'>('original');
  const [audioFinished, setAudioFinished] = useState(false);
  const [minimumDisplayElapsed, setMinimumDisplayElapsed] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  /* ── تشغيل الصوت ─────────────────────────────────────── */
  useEffect(() => {
    let mounted = true;
    let audioSafetyTimer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        if (Platform.OS === "web") {
          if (!introSoundStarted) {
            introSoundStarted = true;
            playWebChime();
          }
          audioSafetyTimer = setTimeout(() => {
            if (mounted) setAudioFinished(true);
          }, 4800);
          return;
        }

        if (introSoundStarted) {
          if (mounted) setAudioFinished(true);
          return;
        }
        audioSafetyTimer = setTimeout(() => {
          if (mounted) setAudioFinished(true);
        }, 15000);

        // إعداد جلسة الصوت — iOS + Android
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });

        // تأخير قصير على الأندرويد لضمان جاهزية نظام الصوت
        if (Platform.OS === "android") {
          await new Promise((r) => setTimeout(r, 300));
        }

        if (!mounted) return;

        const { sound } = await Audio.Sound.createAsync(
          require("@/assets/sounds/startup_bell.wav"),
          { shouldPlay: true, volume: 1.0, isMuted: false }
        );
        if (!mounted) {
          await sound.unloadAsync();
          return;
        }
        introSoundStarted = true;
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish && mounted) {
            setAudioFinished(true);
          }
        });
      } catch (_) {
        if (mounted) setAudioFinished(true);
      }
    })();
    return () => {
      mounted = false;
      if (audioSafetyTimer) clearTimeout(audioSafetyTimer);
      soundRef.current?.unloadAsync().catch(() => { });
    };
  }, []);

  /* ─── ثوابت الشعار ──────────────────────────────────── */
  const CIRCLE_R = Math.min(width * 0.22, 90);   // أكبر
  const ARC_R = CIRCLE_R + 26;
  const ARC_FONT = Math.min(width * 0.030, 12);

  /* النص الملفوف — LTR من اليسار لليمين */
  const topText = "COPTIC DICTIONARY";
  const topChars = [...topText];
  const topSpan = 172;
  const topStart = -90 - topSpan / 2; // نقطة البداية (يسار)

  /* ─── قيم الأنيميشن ─────────────────────────────────── */
  const screenOp = useRef(new Animated.Value(1)).current;
  const exitOp = useRef(new Animated.Value(1)).current;
  const circleSc = useRef(new Animated.Value(1)).current;
  const circleOp = useRef(new Animated.Value(1)).current;
  const letterSc = useRef(new Animated.Value(1)).current;
  const letterOp = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const lineW = useRef(new Animated.Value(1)).current;
  const lineOp = useRef(new Animated.Value(1)).current;
  const sigOp = useRef(new Animated.Value(1)).current;
  const sigY = useRef(new Animated.Value(0)).current;
  const nameOp = useRef(new Animated.Value(1)).current;
  const nameY = useRef(new Animated.Value(0)).current;

  const topOpacities = useRef(topChars.map(() => new Animated.Value(1))).current;

  useEffect(() => {
    let mounted = true;
    (async () => {
      // التناوب بين الحرف القبطي وتوت عنخ آمون وشعار القاموس
      try {
        const lastMode = await AsyncStorage.getItem("@splash_config_mode");
        const nextMode = lastMode === "original" ? "tut" : lastMode === "tut" ? "logo" : "original";
        await AsyncStorage.setItem("@splash_config_mode", nextMode);
        if (mounted) setSplashMode(nextMode);
      } catch {
        if (mounted) setSplashMode("original");
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const minimumTimer = setTimeout(() => setMinimumDisplayElapsed(true), 4800);
    return () => clearTimeout(minimumTimer);
  }, []);

  useEffect(() => {
    if (!audioFinished || !minimumDisplayElapsed) return;
    const animation = Animated.timing(exitOp, {
      toValue: 0,
      duration: Platform.OS === "web" ? 300 : 380,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start(({ finished }) => {
      if (finished) onFinishRef.current();
    });
    return () => animation.stop();
  }, [audioFinished, minimumDisplayElapsed, exitOp]);

  /* ─── زاوية كل حرف — LTR ────────────────────────────── */
  function topAngle(i: number) {
    const pct = topChars.length > 1 ? i / (topChars.length - 1) : 0;
    return topStart + pct * topSpan; // من اليسار إلى اليمين
  }

  const logoSize = CIRCLE_R * 2;

  return (
    <Animated.View style={[styles.root, { opacity: screenOp }]}>
      <Animated.View style={[styles.root, { opacity: exitOp }]}>
        
        {/* خلفية الرموز الفرعونية لمود توت */}
        {splashMode === "tut" && (
          <Animated.Image
            source={require("@/assets/images/pharaonic_bg_transparent.png")}
            style={[StyleSheet.absoluteFill, { width, height, opacity: Animated.multiply(circleOp, 0.15) as any }]}
            resizeMode="cover"
          />
        )}

        {/* ── المنتصف: العنصر المتناوب ── */}
        <View style={styles.center}>
          {/* منطقة العنصر المركزي والنص الملفوف، وتظهر في الأوضاع الثلاثة */}
          <Animated.View style={{
            width: ARC_R * 2 + ARC_FONT * 2 + 12,
            height: ARC_R * 2 + ARC_FONT * 2 + 12,
            alignItems: "center",
            justifyContent: "center",
            opacity: circleOp,
            transform: [{ scale: Animated.multiply(circleSc, pulse) as any }],
          }}>

            {splashMode === "logo" ? (
              /* شعار القاموس يظهر وحده كمرحلة مستقلة في التناوب */
              <Image
                source={require("@/assets/images/logo22.png")}
                style={{ width: width * 0.34, height: width * 0.34, resizeMode: "contain", zIndex: 2 }}
              />
            ) : splashMode === "tut" ? (
              /* مود توت: القناع الذهبي في المنتصف */
              <Image
                source={require("@/assets/images/tut_mask_transparent.png")}
                style={{ width: width * 0.32, height: width * 0.32, resizeMode: "contain", zIndex: 2 }}
              />
            ) : (
              /* المود الأصلي: الحرف القبطي */
              <View style={[styles.circle, {
                width: logoSize,
                height: logoSize,
                borderRadius: CIRCLE_R,
              }]}>
                <Animated.Text style={[
                  styles.innerLetter,
                  {
                    fontSize: CIRCLE_R * 1.05,
                    opacity: letterOp,
                    transform: [{ scale: letterSc }],
                  },
                ]}>
                  Ⲁ
                </Animated.Text>
              </View>
            )}

            {/* الحروف الملفوفة تظهر حول كل وضع من أوضاع الافتتاح */}
            {topChars.map((char, i) => (
              <ArcLetter
                key={`t${i}`}
                char={char}
                angle={topAngle(i)}
                radius={ARC_R}
                fontSize={ARC_FONT}
                color={GOLD}
                opacity={topOpacities[i]}
              />
            ))}
          </Animated.View>

          {/* اسم القاموس بالحروف القبطية */}
          <Animated.View style={{ opacity: nameOp, transform: [{ translateY: nameY }], marginTop: 22 }}>
            <Text style={styles.copticName}>ⲭⲏⲙⲓ</Text>
          </Animated.View>

          {/* خط فاصل */}
          <Animated.View style={[styles.divider, { width: 120, transform: [{ scaleX: lineW }], opacity: lineOp, marginTop: 16 }]} />
        </View>

        {/* ── التوقيع — أسفل الشاشة ── */}
        <Animated.View style={[
          styles.sigBlock,
          { opacity: sigOp, transform: [{ translateY: sigY }] },
        ]}>
          <Text style={styles.sigLabel}>CRAFTED BY</Text>
          <Text style={styles.sigName}>Ebram Merzik</Text>
        </Animated.View>

      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    zIndex: 9999,
    elevation: 9999,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  glow: {
    position: "absolute",
    backgroundColor: "rgba(139,0,0,0.14)",
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 60,
  },

  circle: {
    borderWidth: 0,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },

  innerLetter: {
    fontFamily: "CSAvaVeni-Regular",
    color: GOLD_L,
    lineHeight: undefined,
    includeFontPadding: false,
  },

  copticName: {
    fontSize: 45,
    fontFamily: "CSAvaVeni-Regular",
    color: GOLD,
  },
  divider: {
    height: 1,
    backgroundColor: GOLD,
    opacity: 0.4,
    borderRadius: 1,
  },

  /* التوقيع في أسفل الشاشة */
  sigBlock: {
    position: "absolute",
    bottom: 44,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  sigLabel: {
    fontSize: 8,
    fontFamily: "Inter_400Regular",
    color: "rgba(200,169,81,0.4)",
    letterSpacing: 4,
    marginBottom: 4,
  },
  sigName: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(200,169,81,0.6)",
    letterSpacing: 2,
  },
});
