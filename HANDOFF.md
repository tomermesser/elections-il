# הוראות לסשן במחשב: העלאת "הימורי בחירות 2026" לאוויר

העתק את כל הקובץ הזה לסשן חדש של Claude שמקושר למחשב שלך.

---

## ההקשר
הפרויקט `election-wager` הוא אתר שבו חברים מנחשים תוצאות בחירות. הוא כבר כתוב ונבדק. מה שנשאר זה להעלות אותו לאוויר.

- **מבנה:** קובץ סטטי `public/index.html`, פונקציות serverless בתיקייה `api/` עבור Vercel (Node 20, ES modules), ומסד נתונים Postgres ב-Neon דרך `@neondatabase/serverless`.
- **התחברות:** Google OAuth שמימשתי ידנית עם `jose`. אין NextAuth. הסשן נשמר בעוגייה חתומה ל-120 יום.
- **טבלאות:** נוצרות אוטומטית בבקשה הראשונה (`settings`, `picks`).
- **הגנות בשרת:** אף אחד לא מקבל ניחושים של אחרים לפני הנעילה. אחרי הנעילה, ידנית או במועד שנקבע, כל שינוי נדחה. השרת בודק כל ניחוש. רק מי שמופיע ב-ADMIN_EMAILS יכול לנהל. פרטים נוספים ב-README.md.
- **בדיקות:** השרת נבדק מול Postgres מקומי (PGlite) ועבר 22 בדיקות. לא לשנות את הלוגיקה בלי סיבה.

## המשימה
1. **קוד:** הקוד נמצא בתיקייה `election-wager`, מה-zip שצורף או מהריפו `tomermesser/election-wager` אם הוא קיים. מריצים `npm install`.
2. **GitHub:** אם עדיין אין ריפו, ליצור ריפו פרטי `election-wager` עם `gh repo create`, ולדחוף את הענף `main`.
3. **Vercel:** לוודא ש-Vercel CLI מותקן ומחובר (`vercel whoami`). אם הוא לא מחובר, לבקש ממני להתחבר עם `vercel login`. אחר כך ליצור או לקשר פרויקט (`vercel link`), עדיף מחובר לריפו ב-GitHub כדי שכל push יעלה אוטומטית. Framework preset: Other. אין build command. תיקיית הפלט היא `public`, והיא כבר מוגדרת ב-vercel.json.
4. **Neon:** להוסיף מסד נתונים של Neon לפרויקט דרך Vercel Marketplace (Storage → Neon), כך ש-`DATABASE_URL` יתווסף אוטומטית לכל הסביבות. אם זה לא עובד מה-CLI, להדריך אותי בדשבורד.
5. **Google OAuth:** את זה אני עושה בעצמי ב-Google Cloud Console, ואתה מדריך אותי שלב אחרי שלב:
   - פרויקט חדש → APIs & Services → OAuth consent screen: External, שם האפליקציה, ה-scopes הבסיסיים בלבד, ואז Publish app ("In production"), כדי שכל חשבון Google יוכל להתחבר.
   - Credentials → Create OAuth client ID → Web application.
   - Authorized redirect URI: `https://<הדומיין-של-vercel>/api/auth/callback`. קודם צריך לדעת מה הדומיין הקבוע של הפרויקט.
   - אחר כך אני מדביק לך את ה-Client ID וה-Client Secret.
6. **משתני סביבה ב-Vercel (Production):**
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `SESSION_SECRET`: ליצור עם `openssl rand -hex 32`
   - `ADMIN_EMAILS=tomeaces@gmail.com`
   - `BASE_URL=https://<הדומיין-של-vercel>`
7. **העלאה:** `vercel --prod`.
8. **בדיקה:** לפתוח את האתר, לוודא שההתחברות עם Google עובדת, ששליחת ניחוש עובדת ושהניחוש נשאר אחרי ריענון. לוודא שלשונית "ניהול" מופיעה רק ל-tomeaces@gmail.com. לבדוק ש-`/api/state` לא מחזיר ניחושים של אחרים (`picks: null`) לפני הנעילה.
9. **בסוף:** לתת לי את הלינק לשליחה לחברים. **לא ללחוץ על נעילה.** הנעילה סופית, ואני עושה אותה בעצמי.
