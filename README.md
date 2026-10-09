# 🚀 NASTA Coin ($NASTA) - Telegram Mini App & Bot Setup Guide

এই প্রজেক্টটিতে **NASTA Coin ($NASTA)** এর জন্য সম্পূর্ণ **Telegram Mini App (TMA)** এবং **Telegram Bot** তৈরি করা হয়েছে।

---

## 📁 প্রজেক্ট স্ট্রাকচার (Project Structure)
```
telegram-mini-app/
├── public/                 # Telegram Web App (Frontend)
│   ├── index.html          # মূল গেম ও মিনি অ্যাপ ইন্টারফেস
│   ├── style.css           # আধুনিক ডার্ক গ্লাস মরফিজম ডিজাইন
│   ├── app.js              # গেম ইঞ্জিন, ট্যাপ ফিজিক্স ও টেলিগ্রাম ইন্টিগ্রেশন
│   └── assets/             # কয়েন ও বটের ইমেজ (SVG/PNG)
├── bot.js                  # Express Web Server + Telegram Bot স্ক্রিপ্ট
├── package.json            # প্রজেক্ট ডিপেন্ডেন্সিস
├── vercel.json             # Vercel-এ ১-ক্লিকে ফ্রি হোস্টিং কনফিগারেশন
└── .env.example            # এনভায়রনমেন্ট ভ্যারিয়েবল এক্সাম্পল
```

---

## 🌟 পার্ট ১: টেলিগ্রাম মিনি অ্যাপ লাইভ করা (Free Deployment)

টেলিগ্রামের ভেতরে আপনার অ্যাপটি চালাতে হলে এটিকে একটি ফ্রি লাইভ লিঙ্কে (HTTPS) হোস্ট করতে হবে।

### অপশন A: Vercel-এ ফ্রি ডেপ্লয় (সবচেয়ে সহজ ও সেরা)
1. [vercel.com](https://vercel.com)-এ ফ্রি একাউন্ট তৈরি করুন।
2. আপনার এই প্রজেক্টটি GitHub-এ আপলোড করুন।
3. Vercel ড্যাশবোর্ডে গিয়ে **Add New Project** ক্লিক করে এই রিপোজিটরিটি সিলেক্ট করুন।
4. Root Directory হিসেবে `telegram-mini-app` সিলেক্ট করে **Deploy** বাটনে ক্লিক করুন।
5. ১ মিনিটের মধ্যে আপনি একটি লাইভ লিঙ্ক পাবেন, যেমন: `https://nasta-coin.vercel.app`

---

## 🤖 পার্ট ২: Telegram BotFather-এ মিনি অ্যাপ যুক্ত করা

1. টেলিগ্রাম ওপেন করে সার্চ করুন **@BotFather**
2. `/newbot` লিখে সেন্ড করুন:
   - বটের একটি নাম দিন (যেমন: `NASTA Coin`)
   - বটের একটি ইউজারনেম দিন যা শেষে bot থাকে (যেমন: `NASTACoin_bot`)
   - BotFather আপনাকে একটি **API Token** দিবে (এটি কপি করে রাখুন)।
3. এবার BotFather-এ লিখুন: `/newapp`
   - আপনার বটটি সিলেক্ট করুন।
   - অ্যাপের টাইটেল দিন: `NASTA Coin`
   - অ্যাপের শর্ট ডেসক্রিপশন দিন: `Tap, mine and earn $NASTA on TON blockchain.`
   - একটি ৬৪০x৩৬০ সাইজের ব্যানার ফটো দিন (ঐচ্ছিক)।
   - **Web App URL** চাইলে: আপনার Vercel-এর লাইভ লিংকটি দিন (যেমন: `https://nasta-coin.vercel.app`)।
   - অ্যাপের একটি শর্ট নেম দিন (যেমন: `app` বা `play`)।
4. আপনার টেলিগ্রাম মিনি অ্যাপ রেডি! এখন যে কেউ বটে ঢুকলে বা লিঙ্কে ক্লিক করলে সরাসরি টেলিগ্রামের ভেতরে গেমটি ওপেন হয়ে যাবে!

---

## 💻 পার্ট ৩: আপনার কম্পিউটারে লোকাল টেস্ট করা

১. `telegram-mini-app` ফোল্ডারে টার্মিনাল ওপেন করুন।
২. ডিপেন্ডেন্সি ইন্সটল করুন (অলরেডি করা আছে):
   ```bash
   npm install
   ```
৩. লোকাল সার্ভার রান করুন:
   ```bash
   node bot.js
   ```
৪. ব্রাউজারে ওপেন করুন: `http://localhost:3000`

---

## 📱 পার্ট ৪: Android APK তৈরি করার নিয়ম (Android Studio)

আপনি যদি Android APK তৈরি করে টেলিগ্রাম চ্যানেলে শেয়ার করতে চান:
1. **Android Studio** ওপেন করুন।
2. **File > Open** এ গিয়ে এই মূল ফোল্ডারটি (`e:\NASTA COIN`) সিলেক্ট করুন।
3. Gradle Sync শেষ হতে দিন।
4. মেনু বার থেকে ক্লিক করুন:
   `Build > Build Bundle(s) / APK(s) > Build APK(s)`
5. বিল্ড শেষ হলে নিচে একটি পপআপ আসবে **"locate"**।
6. সেখানে ক্লিক করলেই আপনি `app-debug.apk` পেয়ে যাবেন।
7. সেই APK ফাইলটি সরাসরি আপনার টেলিগ্রাম চ্যানেল বা গ্রুপে আপলোড করে দিতে পারেন!
