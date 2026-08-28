import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useSession } from "../lib/session";
import { useTheme } from "../lib/theme";
import { Alert, BrandRule, Field } from "../components/ui";
import type { CurrentUser } from "../lib/types";

type Mode = "signIn" | "register";

export function SignIn() {
  const [mode, setMode] = useState<Mode>("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const { setUser } = useSession();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const registering = mode === "register";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const body = registering
        ? { name, email, password, accessCode }
        : { email, password };
      const result = await api.post<{ user: CurrentUser }>(
        registering ? "/api/auth/register" : "/api/auth/login",
        body,
      );
      setUser(result.user);
      navigate("/", { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFields(caught.fields ?? {});
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card stack">
        <div
          className="lockup"
          role="img"
          aria-label="Milieu Family Services"
          style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}
        >
          <img src="/milieu-rings.png" alt="" width={52} height={48} />
          <span className="wordmark" style={{ fontSize: 24 }}>
            Milieu
          </span>
        </div>

        <div>
          <h1>{registering ? "Create your account" : "Interview Assistant"}</h1>
          <BrandRule />
          <p className="muted" style={{ marginTop: 10 }}>
            {registering
              ? "Registration needs an access code from an administrator."
              : "Sign in to run interviews and review past ones."}
          </p>
        </div>

        {error ? <Alert>{error}</Alert> : null}

        <form className="card stack" onSubmit={submit}>
          {registering ? (
            <Field label="Your name" error={fields["name"]}>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
                aria-invalid={Boolean(fields["name"])}
              />
            </Field>
          ) : null}

          <Field label="Email" error={fields["email"]}>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              aria-invalid={Boolean(fields["email"])}
            />
          </Field>

          <Field
            label="Password"
            hint={registering ? "At least 10 characters." : undefined}
            error={fields["password"]}
          >
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={registering ? "new-password" : "current-password"}
              required
              aria-invalid={Boolean(fields["password"])}
            />
          </Field>

          {registering ? (
            <Field label="Access code" error={fields["accessCode"]}>
              <input
                className="input"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                required
                aria-invalid={Boolean(fields["accessCode"])}
              />
            </Field>
          ) : null}

          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy
              ? "Please wait"
              : registering
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <div className="row-between">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              setMode(registering ? "signIn" : "register");
              setError(null);
              setFields({});
            }}
          >
            {registering ? "I already have an account" : "Create an account"}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={toggle}
          >
            {theme === "dark" ? "Light theme" : "Dark theme"}
          </button>
        </div>

        <span className="powered-by">Powered by SNRGY</span>
      </div>
    </div>
  );
}
