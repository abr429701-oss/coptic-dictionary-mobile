# Coptic Dictionary Ⲭⲏⲙⲓ — Mobile App

The speaking Coptic dictionary — القاموس القبطي الناطق.
Search 16,764 Coptic words with pronunciation, learn the language with 27 lessons, take exams and earn certificates.

## Download

Latest release: **v1.3.1** (Android APK)

- https://github.com/abr429701-oss/coptic-dictionary-mobile/releases/download/v1.3.1/Coptic.Dictionary.1.3.1.apk
- Short link: https://is.gd/copticdictionary

iPhone: there is no App Store build. Use the web app (PWA) instead — https://abr429701-oss.github.io/coptic-khmi-web/ — or run this project in Expo Go.

## Features

- **Spoken dictionary** — every word with audio pronunciation.
- **Learn Coptic** — 27 lessons (Level 1 + Level 2) with videos, photos and in-app exams.
- **Exams & certificates** — exam codes, graded exams, and downloadable certificates.
- **Bible section** — Coptic, Syriac, Greek, Hebrew and English texts.
- **Word of the day** — scheduled local notifications.
- **Offline audio** — word audio downloads once and plays without internet.
- **Export** — share words as Word, Excel, PDF or PowerPoint files.

## Build & run

```bash
npm install
npx expo start
```

Android release build (local):

```bash
npx expo prebuild
cd android && ./gradlew assembleRelease
```

Or with EAS:

```bash
npm run build:apk
```

## Tech

Expo SDK 54, React Native 0.81, TypeScript, expo-router, SQLite, expo-notifications.

## Links

- Telegram bot: https://t.me/Coptic_Dictionary_bot
- Messenger: https://m.me/Copticdictionary
- Website: https://copticdictionry.neocities.org/
- iPhone web app (PWA): https://github.com/abr429701-oss/coptic-khmi-web
