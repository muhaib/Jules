import { AuthForm } from '../../components/AuthForm';

export default function LoginPage() {
  return (
    <div className="shell">
      <div className="auth">
        <h1>Sign in</h1>
        <p className="sub">See which AI crawlers are hitting your site.</p>
        <AuthForm mode="login" />
      </div>
    </div>
  );
}
