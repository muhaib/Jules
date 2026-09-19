import { NewSiteForm } from '../../../components/NewSiteForm';

export default function NewSitePage() {
  return (
    <div className="shell">
      <div className="auth" style={{ maxWidth: 480 }}>
        <h1>Add a site</h1>
        <p className="sub">
          You will get a site key once, on the next screen. Store it with your other
          deployment secrets.
        </p>
        <NewSiteForm />
      </div>
    </div>
  );
}
