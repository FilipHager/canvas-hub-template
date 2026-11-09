import { LoginForm } from "./form";

export default function LoginPage() {
  return (
    <div className="login">
      <img src="/icons/icon-192.png" alt="" width={72} height={72} className="login-icon" />
      <h1>Canvas Hub</h1>
      <p className="muted">Skriv lösenordet du valde när du installerade appen.</p>
      <LoginForm />
    </div>
  );
}
