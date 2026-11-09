import { setupStatus } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Visas tills allt är inställt. Visar bara VAD som saknas, aldrig några värden. */
export default function SetupPage() {
  const items = setupStatus();
  return (
    <div className="setup">
      <img src="/icons/icon-192.png" alt="" width={64} height={64} className="login-icon" />
      <h1>Nästan klart!</h1>
      <p>Canvas Hub behöver några inställningar till innan den kan starta:</p>
      <ul className="setup-list">
        {items.map((s) => (
          <li key={s.key} className={s.ok ? "setup-ok" : "setup-missing"}>
            <span className="setup-icon">{s.ok ? "✅" : "⬜"}</span>
            <div>
              <strong>{s.title}</strong>
              {!s.ok && <p className="muted">{s.help}</p>}
            </div>
          </li>
        ))}
      </ul>
      <div className="card">
        <h2>Så lägger du in en inställning</h2>
        <ol>
          <li>Gå till <strong>vercel.com</strong> och öppna ditt projekt <strong>canvas-hub</strong>.</li>
          <li><strong>Settings → Environment Variables</strong>.</li>
          <li>Skriv namnet (t.ex. <code>CANVAS_TOKEN</code>) under <em>Key</em> och värdet under <em>Value</em> → <strong>Save</strong>.</li>
          <li>Gå till <strong>Deployments</strong> → de tre prickarna på den översta → <strong>Redeploy</strong>.</li>
          <li>Ladda om den här sidan efter en minut.</li>
        </ol>
      </div>
    </div>
  );
}
