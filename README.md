# Canvas Hub 📚

Din egen app som samlar allt från KTH:s Canvas på ett ställe – med AI.

- **Påminnelser:** labbar, seminarier, tentor och inlämningar med *din* grupps datum och lokal, nedräkning och vad du ska förbereda.
- **Inkorg:** alla kursmeddelanden sammanfattade på 1–2 meningar, med "måste agera" / "gäller inte dig".
- **Fråga:** chatta med dina kurser – "Vad har jag denna vecka?"
- Hittar själv dina labb- och seminariegrupper i Canvas.
- Funkar som en app på mobilen.

Det är **din egen kopia**: bara du kommer åt den, och ingen annan (inte heller den som delade länken) ser din data eller dina nycklar.

---

<a id="guide"></a>
## Installera (ca 15 minuter, ingen kod)

### Steg 1 – Canvas-token (2 min)
1. Gå till **[canvas.kth.se/profile/settings](https://canvas.kth.se/profile/settings)**.
2. Scrolla längst ner till **Godkända integrationer** → **+ Ny åtkomsttoken**.
3. Ändamål: `Canvas Hub`. Utgångsdatum: t.ex. slutet av läsåret.
4. Klicka **Generera token** och **kopiera** den (den visas bara en gång). Klistra in den i Anteckningar så länge.

### Steg 2 – OpenAI-nyckel (5 min)
AI:n kostar lite pengar. Du betalar själv, men det är väldigt billigt: **$5 räcker i flera månader.** Inget abonnemang.

1. Gå till **[platform.openai.com](https://platform.openai.com)** och skapa ett konto.
2. **Settings → Billing → Add payment details** och lägg in **$5** i kredit.
   Stäng gärna av *Auto recharge* och sätt en månadsgräns under **Limits**.
3. **API keys → Create new secret key** → namn `canvas-hub` → **Create**.
4. **Kopiera** nyckeln (börjar med `sk-`) och spara den i Anteckningar.

### Steg 3 – Hitta på ett lösenord
Minst 8 tecken. Det är det du loggar in i appen med. Använd inte samma som till något annat.

### Steg 4 – Klicka på knappen (5 min)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FFilipHager%2Fcanvas-hub-template&env=CANVAS_TOKEN,OPENAI_API_KEY,APP_PASSWORD&envDescription=CANVAS_TOKEN%3A%20fr%C3%A5n%20Canvas%20(steg%201).%20OPENAI_API_KEY%3A%20fr%C3%A5n%20OpenAI%20(steg%202).%20APP_PASSWORD%3A%20ditt%20l%C3%B6senord%20(steg%203).&envLink=https%3A%2F%2Fgithub.com%2FFilipHager%2Fcanvas-hub-template%23guide&project-name=canvas-hub&repository-name=canvas-hub&products=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%5D)

1. Klicka på knappen ovan.
2. **Logga in med GitHub.** Har du inget GitHub-konto: skapa ett (gratis) på [github.com/signup](https://github.com/signup) och klicka på knappen igen. Väljer Vercel plan: **Hobby** (gratis).
3. **Create Git Repository:** låt namnet vara `canvas-hub`, bocka gärna i **Create private repository** → **Create**.
4. **Neon (databasen):** klicka **Add / Create** → välj region **Frankfurt** om du får välja → godkänn. (Gratis.)
5. **Environment Variables:** klistra in
   - `CANVAS_TOKEN` → din Canvas-token
   - `OPENAI_API_KEY` → din OpenAI-nyckel
   - `APP_PASSWORD` → ditt lösenord
6. Klicka **Deploy** och vänta ett par minuter tills det står **Congratulations!**

### Steg 5 – Öppna appen
1. Klicka på bilden/länken på Vercels "Congratulations"-sida (adressen ser ut som `canvas-hub-xxxx.vercel.app`). **Spara adressen!**
2. Skriv ditt lösenord.
3. Första gången hämtar appen allt från Canvas och låter AI:n läsa det – **vänta 1–2 minuter** och ladda om sidan.
4. Gå till **Profil** och kolla att program, årskurs och **Mina grupper** stämmer. Rätta det som är fel och tryck Spara.

### Steg 6 – Lägg den på hemskärmen
- **iPhone:** öppna adressen i **Safari** → Dela-knappen → **Lägg till på hemskärmen**.
- **Android:** öppna i **Chrome** → menyn ⋮ → **Installera app**.

Klart! 🎉 Appen synkar själv varje morgon och när du öppnar den. Knappen ↻ synkar direkt.

---

## Vanliga frågor

**Vad kostar det?**
Vercel (där appen körs) och Neon (databasen) är gratis för personligt bruk. Bara OpenAI kostar – några kronor i månaden. Tar krediten slut fungerar appen ändå (utan AI-sammanfattningar) och visar en gul ruta om hur du fyller på.

**Det står "Nästan klart!" när jag öppnar appen.**
Någon inställning saknas – sidan säger vilken. Lägg till den i Vercel: ditt projekt → **Settings → Environment Variables** → **Save**, sedan **Deployments** → ⋯ på översta → **Redeploy**.

**Det står att min Canvas-token eller OpenAI-nyckel inte fungerar.**
Skapa en ny (steg 1 eller 2), byt värdet under **Settings → Environment Variables** i Vercel och gör **Redeploy**. Tips: fyll i utgångsdatumen under **Profil**, så varnar appen 14 dagar innan.

**Jag har glömt lösenordet.**
Byt `APP_PASSWORD` i Vercel och gör **Redeploy**.

**AI:n har fel om min grupp.**
**Profil → Mina grupper** – det du skriver där gäller alltid före AI:ns gissning. Påminnelser kan också fråga dig direkt ("Vilken labbgrupp är du i?").

**Är min data säker?**
Allt ligger i *ditt* Vercel- och Neon-konto, bakom ditt lösenord. AI-analysen skickar texten från meddelanden och uppgifter till OpenAI (som inte tränar på API-data). Appen kan bara **läsa** från Canvas – aldrig skriva, posta eller lämna in något. Dela inte din adress + lösenord med andra.

**Hur tar jag bort allt?**
Vercel → projektet → **Settings → Delete Project** (och databasen under Storage). Radera token i Canvas och nyckeln hos OpenAI.

---

<details>
<summary>För den tekniskt intresserade</summary>

Next.js 16 + TypeScript på Vercel, Postgres på Neon, OpenAI (`gpt-5.4-mini`, utbytbar via `AI_MODEL`).
Tabellerna skapas automatiskt vid första användningen (`src/lib/db/schema.ts`).
AI-resultat cachas per meddelande/uppgift + innehållshash + kursprofil, så inget analyseras två gånger.

Köra lokalt:
```bash
cp .env.example .env.local   # fyll i värdena
npm install
npm run dev
```
</details>
