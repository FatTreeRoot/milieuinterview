import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useSession } from "../lib/session";
import type {
  AccessCode,
  AdminUser,
  AuditEntry,
} from "../lib/types";
import {
  Alert,
  ConfirmButton,
  Empty,
  Field,
  PageHead,
  formatDate,
} from "../components/ui";

type Tab = "account" | "codes" | "users" | "ai" | "audit";

export function Settings() {
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<Tab>("account");

  const tabs = ([
    { key: "account", label: "Your Account", adminOnly: false },
    { key: "codes", label: "Access Codes", adminOnly: true },
    { key: "users", label: "People", adminOnly: true },
    { key: "ai", label: "AI and Retention", adminOnly: true },
    { key: "audit", label: "Activity Log", adminOnly: true },
  ] satisfies { key: Tab; label: string; adminOnly: boolean }[]).filter(
    (t) => !t.adminOnly || isAdmin,
  );

  return (
    <div className="page-width">
      <PageHead
        title="Settings"
        lede={
          isAdmin
            ? "Your account, plus the agency settings only administrators can change."
            : "Your account."
        }
      />

      <div className="row" style={{ marginBottom: 18 }}>
        {tabs.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={
              tab === entry.key
                ? "btn btn--primary btn--sm"
                : "btn btn--secondary btn--sm"
            }
            onClick={() => setTab(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "account" ? <AccountPanel /> : null}
      {tab === "codes" && isAdmin ? <AccessCodesPanel /> : null}
      {tab === "users" && isAdmin ? <UsersPanel /> : null}
      {tab === "ai" && isAdmin ? <AiPanel /> : null}
      {tab === "audit" && isAdmin ? <AuditPanel /> : null}
    </div>
  );
}

function AccountPanel() {
  const { user } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function change() {
    setError(null);
    setNotice(null);
    setFields({});
    try {
      await api.post("/api/auth/password", { currentPassword, newPassword });
      setNotice("Your password was changed.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFields(caught.fields ?? {});
      }
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <h2 style={{ marginBottom: 10 }}>Signed In As</h2>
        <div>{user?.name}</div>
        <div className="subtle">{user?.email}</div>
        <div className="subtle">
          {user?.role === "admin" ? "Administrator" : "Staff"}
        </div>
      </div>

      <div className="card stack">
        <h2>Change Your Password</h2>
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <div className="note">{notice}</div> : null}
        <Field label="Current Password" error={fields["currentPassword"]}>
          <input
            className="input"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <Field
          label="New Password"
          hint="At least 10 characters."
          error={fields["newPassword"]}
        >
          <input
            className="input"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <div>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => void change()}
            disabled={!currentPassword || !newPassword}
          >
            Change Password
          </button>
        </div>
      </div>
    </div>
  );
}

function AccessCodesPanel() {
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function load() {
    try {
      const result = await api.get<{ codes: AccessCode[] }>(
        "/api/admin/access-codes",
      );
      setCodes(result.codes);
    } catch {
      setError("Access codes could not be loaded.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="stack">
      <div className="note">
        Anyone registering needs one of these codes. Turn a code off once the
        people it was meant for have signed up.
      </div>
      {error ? <Alert>{error}</Alert> : null}

      <div className="card row" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Field label="New Code Label" hint="What this code is for.">
            <input
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Autumn intake"
            />
          </Field>
        </div>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={!label.trim()}
          onClick={() =>
            void api
              .post("/api/admin/access-codes", { label })
              .then(() => {
                setLabel("");
                return load();
              })
              .catch(() => setError("That code could not be created."))
          }
        >
          Create Code
        </button>
      </div>

      <div className="card card--flush">
        {codes.length === 0 ? (
          <Empty>No access codes yet.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Label</th>
                  <th className="num">Used</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {codes.map((code) => (
                  <tr key={code.id}>
                    <td>
                      <code>{code.code}</code>
                    </td>
                    <td className="muted">{code.label}</td>
                    <td className="num">{code.uses}</td>
                    <td>
                      <span
                        className={`badge ${code.active ? "badge--pass" : "badge--neutral"}`}
                      >
                        {code.active ? "Active" : "Off"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="row" style={{ justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() =>
                            void api
                              .post(`/api/admin/access-codes/${code.id}/active`, {
                                active: !code.active,
                              })
                              .then(load)
                              .catch(() => setError("That did not work."))
                          }
                        >
                          {code.active ? "Turn off" : "Turn on"}
                        </button>
                        <ConfirmButton
                          label="Delete"
                          className="btn btn--ghost btn--sm"
                          title="Delete this access code?"
                          confirmLabel="Delete it"
                          open={confirming === code.id}
                          setOpen={(open) =>
                            setConfirming(open ? code.id : null)
                          }
                          body={
                            <p className="muted">
                              Anyone who has not registered with it yet will no
                              longer be able to.
                            </p>
                          }
                          onConfirm={() =>
                            void api
                              .delete(`/api/admin/access-codes/${code.id}`)
                              .then(load)
                              .catch(() => setError("That did not work."))
                          }
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function UsersPanel() {
  const { user } = useSession();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function load() {
    try {
      const result = await api.get<{ users: AdminUser[] }>("/api/admin/users");
      setUsers(result.users);
    } catch {
      setError("People could not be loaded.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="stack">
      {error ? <Alert>{error}</Alert> : null}
      <div className="card card--flush">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ fontWeight: 600 }}>{entry.name}</td>
                  <td className="muted">{entry.email}</td>
                  <td>
                    <select
                      className="select"
                      style={{ minHeight: 34, maxWidth: 150 }}
                      value={entry.role}
                      onChange={(e) =>
                        void api
                          .put(`/api/admin/users/${entry.id}/role`, {
                            role: e.target.value,
                          })
                          .then(load)
                          .catch((caught) =>
                            setError(
                              caught instanceof ApiError
                                ? caught.message
                                : "That did not work.",
                            ),
                          )
                      }
                    >
                      <option value="staff">Staff</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </td>
                  <td className="muted num">{formatDate(entry.createdAt)}</td>
                  <td style={{ textAlign: "right" }}>
                    {entry.id === user?.id ? (
                      <span className="subtle">You</span>
                    ) : (
                      <ConfirmButton
                        label="Remove"
                        className="btn btn--ghost btn--sm"
                        title={`Remove ${entry.name}?`}
                        confirmLabel="Remove them"
                        open={confirming === entry.id}
                        setOpen={(open) => setConfirming(open ? entry.id : null)}
                        body={
                          <p className="muted">
                            They will lose access immediately. Interviews they
                            ran are kept.
                          </p>
                        }
                        onConfirm={() =>
                          void api
                            .delete(`/api/admin/users/${entry.id}`)
                            .then(load)
                            .catch((caught) =>
                              setError(
                                caught instanceof ApiError
                                  ? caught.message
                                  : "That did not work.",
                              ),
                            )
                        }
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AiPanel() {
  const { capabilities } = useSession();
  const [orgContext, setOrgContext] = useState("");
  const [retention, setRetention] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ orgContext: string; retentionMonths: number | null }>(
        "/api/admin/settings",
      )
      .then((r) => {
        setOrgContext(r.orgContext);
        setRetention(r.retentionMonths === null ? "" : String(r.retentionMonths));
      })
      .catch(() => setError("Settings could not be loaded."));
  }, []);

  async function save(body: Record<string, unknown>, message: string) {
    try {
      await api.put("/api/admin/settings", body);
      setNotice(message);
      setError(null);
    } catch {
      setError("That could not be saved.");
    }
  }

  return (
    <div className="stack">
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <div className="note">{notice}</div> : null}

      {!capabilities.ai ? (
        <div className="banner">
          No API key is configured, so the AI features are switched off.
        </div>
      ) : null}

      <div className="card stack">
        <h2>Agency Context</h2>
        <p className="muted">
          A short summary of Milieu sent with every AI request so the model
          understands the work and the language used. Keeping it brief keeps the
          cost down.
        </p>
        <textarea
          className="textarea"
          style={{ minHeight: 260, fontSize: 14 }}
          value={orgContext}
          onChange={(e) => setOrgContext(e.target.value)}
        />
        <div>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => void save({ orgContext }, "Agency context saved.")}
          >
            Save Context
          </button>
        </div>
      </div>

      <div className="card stack">
        <h2>Keeping Candidate Data</h2>
        <Field
          label="Delete completed interviews after"
          hint="Months. Leave empty to keep everything indefinitely. Interviews still in progress are never removed automatically."
        >
          <div className="row">
            <input
              className="input"
              style={{ maxWidth: 120 }}
              type="number"
              min={1}
              max={120}
              value={retention}
              onChange={(e) => setRetention(e.target.value)}
            />
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() =>
                void save(
                  {
                    retentionMonths:
                      retention.trim() === "" ? null : Number(retention),
                  },
                  retention.trim() === ""
                    ? "Interviews will be kept indefinitely."
                    : `Completed interviews will be removed after ${retention} months.`,
                )
              }
            >
              Save
            </button>
          </div>
        </Field>
      </div>

    </div>
  );
}

function AuditPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    void api
      .get<{ entries: AuditEntry[] }>("/api/admin/audit")
      .then((r) => setEntries(r.entries))
      .catch(() => undefined);
  }, []);

  return (
    <div className="card card--flush">
      {entries.length === 0 ? (
        <Empty>Nothing recorded yet.</Empty>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Did What</th>
                <th>To</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="muted num">
                    {new Date(entry.createdAt).toLocaleString("en-CA")}
                  </td>
                  <td>{entry.userName}</td>
                  <td>{entry.action.replace(/_/g, " ")}</td>
                  <td className="muted">{entry.entity.replace(/_/g, " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
