import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { DEFAULT_PASS_THRESHOLD, INPUT_KINDS, type InputKind } from "@milieu/shared";
import { api, ApiError } from "../lib/api";
import type { ImportedTypeDraft, InterviewType } from "../lib/types";
import { Alert, Field, PageHead } from "../components/ui";

type EditableQuestion = {
  id?: string;
  text: string;
  answerKey: string | null;
  inputKind: InputKind;
  inputConfig: Record<string, unknown>;
};

const KIND_LABELS: Record<InputKind, string> = {
  text: "Notes only",
  yes_no: "Yes or no",
  scale: "Rating scale",
  checkbox_list: "Checklist",
  number: "Number",
};

export function TypeEditor() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [threshold, setThreshold] = useState(String(DEFAULT_PASS_THRESHOLD));
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // An imported draft arrives from the library for review before saving.
  const imported = (location.state as { draft?: ImportedTypeDraft } | null)?.draft;

  useEffect(() => {
    if (id) {
      void api
        .get<{ type: InterviewType }>(`/api/types/${id}`)
        .then((r) => {
          setName(r.type.name);
          setDescription(r.type.description ?? "");
          setThreshold(String(r.type.passThreshold));
          setQuestions(
            r.type.questions.map((q) => ({
              id: q.id,
              text: q.text,
              answerKey: q.answerKey,
              inputKind: q.inputKind,
              inputConfig: q.inputConfig ?? {},
            })),
          );
          setLoaded(true);
        })
        .catch(() => setError("That interview type could not be loaded."));
      return;
    }

    if (imported) {
      setName(imported.name);
      setDescription(imported.description ?? "");
      setThreshold(String(imported.passThreshold));
      setQuestions(
        imported.questions.map((q) => ({
          text: q.text,
          answerKey: q.answerKey,
          inputKind: q.inputKind,
          inputConfig: {},
        })),
      );
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function patch(index: number, changes: Partial<EditableQuestion>) {
    setQuestions((current) =>
      current.map((q, i) => (i === index ? { ...q, ...changes } : q)),
    );
  }

  function move(index: number, delta: number) {
    setQuestions((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item as EditableQuestion);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = {
        name,
        description: description.trim() || null,
        passThreshold: Number(threshold),
        questions: questions.map((q) => ({
          ...(q.id ? { id: q.id } : {}),
          text: q.text,
          answerKey: q.answerKey?.trim() ? q.answerKey : null,
          inputKind: q.inputKind,
          inputConfig: q.inputConfig,
        })),
      };
      if (id) {
        await api.put(`/api/types/${id}`, body);
      } else {
        await api.post("/api/types", body);
      }
      navigate("/library");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "The interview type could not be saved.",
      );
      setBusy(false);
    }
  }

  if (!loaded) return <p className="muted">Loading</p>;

  return (
    <div className="page-width">
      <PageHead
        title={id ? "Edit interview type" : "New interview type"}
        lede={
          imported
            ? "Imported from a Word document. Check the questions and answer keys before saving."
            : "Questions are asked in this order. Every question gets a notes box; the input type adds a control above it."
        }
        actions={
          <>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => navigate("/library")}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => void save()}
              disabled={busy || !name || questions.length === 0}
            >
              {busy ? "Saving" : "Save"}
            </button>
          </>
        }
      />

      {error ? <Alert>{error}</Alert> : null}

      <div className="card stack" style={{ marginBottom: 18 }}>
        <Field label="Name">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Description" hint="Optional. Shown when choosing a type.">
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field
          label="Pass threshold"
          hint="Out of 10. Scores within 0.5 of it are flagged as borderline."
        >
          <input
            className="input"
            style={{ maxWidth: 120 }}
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
        </Field>
      </div>

      <div className="row-between" style={{ marginBottom: 12 }}>
        <h2>
          Questions{" "}
          <span className="subtle" style={{ fontWeight: 400 }}>
            ({questions.length})
          </span>
        </h2>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() =>
            setQuestions((current) => [
              ...current,
              { text: "", answerKey: null, inputKind: "text", inputConfig: {} },
            ])
          }
        >
          Add question
        </button>
      </div>

      <div className="stack">
        {questions.map((question, index) => (
          <div key={index} className="card stack">
            <div className="row-between">
              <span className="question-number">Question {index + 1}</span>
              <div className="row">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Move up"
                >
                  Up
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => move(index, 1)}
                  disabled={index === questions.length - 1}
                  aria-label="Move down"
                >
                  Down
                </button>
                <button
                  type="button"
                  className="btn btn--destructive btn--sm"
                  onClick={() =>
                    setQuestions((current) =>
                      current.filter((_, i) => i !== index),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            </div>

            <textarea
              className="textarea"
              style={{ minHeight: 70 }}
              value={question.text}
              placeholder="The question as you would ask it"
              onChange={(e) => patch(index, { text: e.target.value })}
            />

            <div className="grid-2">
              <Field label="Input type">
                <select
                  className="select"
                  value={question.inputKind}
                  onChange={(e) =>
                    patch(index, { inputKind: e.target.value as InputKind })
                  }
                >
                  {INPUT_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </Field>

              {question.inputKind === "checkbox_list" ? (
                <Field label="Options" hint="One per line.">
                  <textarea
                    className="textarea"
                    style={{ minHeight: 60 }}
                    value={
                      ((question.inputConfig["options"] as string[]) ?? []).join(
                        "\n",
                      )
                    }
                    onChange={(e) =>
                      patch(index, {
                        inputConfig: {
                          ...question.inputConfig,
                          options: e.target.value
                            .split("\n")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        },
                      })
                    }
                  />
                </Field>
              ) : null}

              {question.inputKind === "scale" ? (
                <div className="grid-2">
                  <Field label="Lowest">
                    <input
                      className="input"
                      type="number"
                      value={String(question.inputConfig["min"] ?? 1)}
                      onChange={(e) =>
                        patch(index, {
                          inputConfig: {
                            ...question.inputConfig,
                            min: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </Field>
                  <Field label="Highest">
                    <input
                      className="input"
                      type="number"
                      value={String(question.inputConfig["max"] ?? 5)}
                      onChange={(e) =>
                        patch(index, {
                          inputConfig: {
                            ...question.inputConfig,
                            max: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </Field>
                </div>
              ) : null}
            </div>

            <Field
              label="Answer key"
              hint="Optional. Points a strong answer covers. Used for scoring and can be shown during the interview."
            >
              <textarea
                className="textarea"
                style={{ minHeight: 80 }}
                value={question.answerKey ?? ""}
                onChange={(e) =>
                  patch(index, { answerKey: e.target.value || null })
                }
              />
            </Field>
          </div>
        ))}
      </div>

      {questions.length > 6 ? (
        <div className="row" style={{ marginTop: 18, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void save()}
            disabled={busy || !name}
          >
            {busy ? "Saving" : "Save"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
