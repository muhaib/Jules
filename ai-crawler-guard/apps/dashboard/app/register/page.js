import { AuthForm } from '../../components/AuthForm';

export default function RegisterPage() {
  return (
    <div className="shell">
      <div className="auth">
        <h1>Create an account</h1>
        <p className="sub">One account can hold several sites.</p>
        <AuthForm mode="register" />
      </div>
    </div>
  );
}
