/** Kör en synk från terminalen. Kör: npm run sync */
import { runSync } from "../src/lib/sync";

runSync(console.log)
  .then((s) => {
    console.log(
      `\n✅ Klart: ${s.courses} kurser, ${s.announcements} meddelanden ` +
        `+ ${s.assignments} uppgifter (${s.analyzed} analyserade nu, ${s.cached} från cache, ${s.failed} misslyckades).`
    );
  })
  .catch((err) => {
    console.error("\n❌", err instanceof Error ? err.message : err);
    process.exit(1);
  });
