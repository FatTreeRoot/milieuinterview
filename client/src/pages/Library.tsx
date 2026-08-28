import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatScore } from "@milieu/shared";
import { api, ApiError } from "../lib/api";
import { useSession } from "../lib/session";
import type { ImportedTypeDraft, InterviewType } from "../lib/types";
import { Alert, ConfirmButton, Empty, PageHead } from "../components/ui";

export function Library() {
  const [types, setTypes] = useState<InterviewType[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { capabilities } = useSession();
  const navigate = useNavigate();

  async function load() {
    try {
      const result = await api.get<{ types: InterviewType[] }>(
        `/api/types?archived=${showArchived}`,
      );
      setTypes(result.types);
    } catch {
      setError("The library could not be loaded.");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  async function act(fn: () => Promise<unknown>, message: string) {
    try {
      await fn();
      setNotice(message);
      setError(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "That did not work.",
      );
    }
  }

  async function importFile(file: File) {
    setImporting(true);
    setError(null);
    try {
      const result = await api.upload<{ draft: ImportedTypeDraft }>(
        "/api/types/import",
        file,
      );
      // Handed to the editor for review rather than saved straight away.
      navigate("/library/new", { state: { draft: result.draft } });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "That document could not be imported.",
      );
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="page-width">
      <PageHead
        title="Interview Library"
        lede="The question sets available when starting an interview. Editing one never changes an interview that has already been run."
        actions={
          <>
            {capabilities.ai ? (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".docx"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importFile(file);
                  }}
                />
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => fileInput.current?.click()}
                  disabled={importing}
                >
                  {importing ? "Reading" : "Import from Word"}
                </button>
              </>
            ) : null}
            <Link className="btn btn--primary btn--sm" to="/library/new">
              New Interview Type
            </Link>
          </>
        }
      />

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <div className="note" style={{ marginBottom: 14 }}>{notice}</div> : null}

      <div className="row" style={{ marginBottom: 14 }}>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setShowArchived((s) => !s)}
        >
          {showArchived ? "Hide Archived" : "Show Archived"}
        </button>
      </div>

      {types.length === 0 ? (
        <div className="card">
          <Empty>No interview types yet.</Empty>
        </div>
      ) : (
        <div className="stack">
          {types.map((type) => (
            <div key={type.id} className="card">
              <div className="row-between">
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <Link
                      to={`/library/${type.id}`}
                      style={{ fontWeight: 600, fontSize: 16 }}
                    >
                      {type.name}
                    </Link>
                    {type.archived ? (
                      <span className="badge badge--neutral">Archived</span>
                    ) : null}
                  </div>
                  {type.description ? (
                    <div className="subtle" style={{ marginTop: 4 }}>
                      {type.description}
                    </div>
                  ) : null}
                  <div className="subtle" style={{ marginTop: 4 }}>
                    {type.questions.length} question
                    {type.questions.length === 1 ? "" : "s"} ·{" "}
                    {type.questions.filter((q) => q.answerKey).length} with an
                    answer key · pass at {formatScore(type.passThreshold)}
                  </div>
                </div>

                <div className="row">
                  <Link
                    className="btn btn--secondary btn--sm"
                    to={`/library/${type.id}`}
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() =>
                      void act(
                        () => api.post(`/api/types/${type.id}/duplicate`),
                        `Copied "${type.name}".`,
                      )
                    }
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() =>
                      void act(
                        () =>
                          api.post(`/api/types/${type.id}/archive`, {
                            archived: !type.archived,
                          }),
                        type.archived
                          ? `"${type.name}" is available again.`
                          : `"${type.name}" was archived.`,
                      )
                    }
                  >
                    {type.archived ? "Restore" : "Archive"}
                  </button>
                  <ConfirmButton
                    label="Delete"
                    title={`Delete "${type.name}"?`}
                    confirmLabel="Delete it"
                    open={confirming === type.id}
                    setOpen={(open) => setConfirming(open ? type.id : null)}
                    body={
                      <p className="muted">
                        This removes the interview type for good. Interviews
                        already run with it keep their own copy of the
                        questions and are not affected. If you only want it out
                        of the way, archive it instead.
                      </p>
                    }
                    onConfirm={() =>
                      void act(
                        () => api.delete(`/api/types/${type.id}`),
                        `"${type.name}" was deleted.`,
                      )
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
