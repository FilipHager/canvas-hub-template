/** Skapar tabellerna i databasen (görs annars automatiskt). Kör: npm run db:migrate */
import { db } from "../src/lib/db";
import { statements } from "../src/lib/db/schema";

async function main() {
  const all = statements();
  for (const s of all) await db().query(s);
  console.log(`✅ Databasen är uppdaterad (${all.length} satser).`);
}

main().catch((err) => {
  console.error("❌", err instanceof Error ? err.message.replace(/postgres\S+/g, "[dold]") : err);
  process.exit(1);
});
