import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileText, Film, ImageIcon, LinkIcon, Loader2, Pencil, Trash2, Upload, X } from "lucide-react";
import {
  ApiError,
  createResource,
  deleteResource,
  fetchAdminResources,
  fetchResourceCategories,
  fetchTrainingTypes,
  updateResource,
  uploadResourceFile,
  type Resource,
  type ResourceCategory,
  type ResourcePatch,
  type ResourceSkillLevel,
  type ResourceType,
  type ResourceVisibility,
  type TrainingType
} from "@/lib/api";

const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
  { value: "video", label: "Video" },
  { value: "pdf", label: "PDF" },
  { value: "image", label: "Image" },
  { value: "link", label: "Link" },
  { value: "text", label: "Text / note" }
];

const SKILL_LEVELS: { value: ResourceSkillLevel; label: string }[] = [
  { value: "all", label: "All levels" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" }
];

const VISIBILITIES: { value: ResourceVisibility; label: string; hint: string }[] = [
  { value: "all_clients", label: "All clients", hint: "Any signed-in client can see it." },
  { value: "booked_clients", label: "Booked clients", hint: "Only clients with a matching booking." },
  { value: "admin_only", label: "Admin only", hint: "Hidden from clients." }
];

const FILE_TYPES: ResourceType[] = ["video", "pdf", "image"];

function formatError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

function typeIcon(type: ResourceType) {
  switch (type) {
    case "video":
      return Film;
    case "image":
      return ImageIcon;
    case "pdf":
      return FileText;
    case "link":
      return LinkIcon;
    default:
      return FileText;
  }
}

function visibilityBadge(v: ResourceVisibility): string {
  switch (v) {
    case "all_clients":
      return "bg-field/15 text-field";
    case "booked_clients":
      return "bg-ink text-white";
    case "admin_only":
    default:
      return "bg-clay/15 text-clay";
  }
}

export function AdminResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [res, cats, types] = await Promise.all([
        fetchAdminResources(),
        fetchResourceCategories(),
        fetchTrainingTypes()
      ]);
      setResources(res);
      setCategories(cats);
      setTrainingTypes(types);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <header className="flex flex-col gap-1">
        <Link
          to="/admin"
          className="focus-ring inline-flex w-fit items-center gap-1.5 text-sm font-bold text-ink/55 hover:text-ink"
        >
          <ArrowLeft size={14} />
          Back to dashboard
        </Link>
        <p className="mt-3 text-sm font-bold uppercase tracking-[0.18em] text-clay">Phase 4 · Admin</p>
        <h1 className="mt-1 text-4xl font-black">Resources.</h1>
        <p className="mt-3 max-w-2xl leading-7 text-ink/68">
          Upload drills, videos, and PDFs, or share links and quick notes. Control who sees each one with
          the visibility setting — booked-client resources can be scoped to a specific session type.
        </p>
      </header>

      {error ? (
        <p className="mt-6 rounded border border-clay/20 bg-clay/5 px-4 py-2 text-sm font-semibold text-clay">
          {error}
        </p>
      ) : null}

      <ResourceForm
        categories={categories}
        trainingTypes={trainingTypes}
        onCreated={(r) => setResources((prev) => [r, ...prev])}
      />

      <section className="mt-12">
        <h2 className="text-2xl font-black">Library</h2>
        <div className="mt-5 overflow-hidden rounded bg-white shadow-soft">
          {isLoading ? (
            <p className="px-4 py-5 text-sm font-semibold text-ink/60">Loading resources…</p>
          ) : resources.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm font-semibold text-ink/60">
              No resources yet. Add your first one above.
            </p>
          ) : (
            <ul className="divide-y divide-ink/10">
              {resources.map((r) => (
                <ResourceRow
                  key={r.id}
                  resource={r}
                  categories={categories}
                  trainingTypes={trainingTypes}
                  onUpdated={(updated) =>
                    setResources((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
                  }
                  onDeleted={() => setResources((prev) => prev.filter((x) => x.id !== r.id))}
                />
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}

const SELECT_CLASS =
  "focus-ring w-full rounded border border-ink/15 bg-white px-3 py-2 text-sm font-semibold text-ink";
const INPUT_CLASS = SELECT_CLASS;
const LABEL_CLASS = "block text-xs font-bold uppercase tracking-wide text-ink/55";

function ResourceForm({
  categories,
  trainingTypes,
  onCreated
}: {
  categories: ResourceCategory[];
  trainingTypes: TrainingType[];
  onCreated: (r: Resource) => void;
}) {
  const [resourceType, setResourceType] = useState<ResourceType>("video");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [skillLevel, setSkillLevel] = useState<ResourceSkillLevel>("all");
  const [sessionType, setSessionType] = useState("");
  const [visibility, setVisibility] = useState<ResourceVisibility>("all_clients");
  const [file, setFile] = useState<File | null>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [body, setBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isFileType = FILE_TYPES.includes(resourceType);

  const fileAccept = useMemo(() => {
    switch (resourceType) {
      case "video":
        return "video/*";
      case "image":
        return "image/*";
      case "pdf":
        return "application/pdf";
      default:
        return undefined;
    }
  }, [resourceType]);

  function resetForm() {
    setTitle("");
    setDescription("");
    setCategoryId("");
    setSkillLevel("all");
    setSessionType("");
    setVisibility("all_clients");
    setFile(null);
    setExternalUrl("");
    setBody("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError("Give the resource a title.");
      return;
    }
    if (isFileType && !file) {
      setFormError("Choose a file to upload.");
      return;
    }
    if (resourceType === "link" && !externalUrl.trim()) {
      setFormError("Add a URL for the link.");
      return;
    }
    if (resourceType === "text" && !body.trim()) {
      setFormError("Add the note text.");
      return;
    }

    setIsSaving(true);
    try {
      let storagePath: string | null = null;
      if (isFileType && file) {
        storagePath = await uploadResourceFile(file);
      }

      const created = await createResource({
        title: title.trim(),
        description: description.trim() || null,
        category_id: categoryId || null,
        skill_level: skillLevel,
        session_type: sessionType || null,
        visibility,
        resource_type: resourceType,
        storage_path: storagePath,
        external_url: resourceType === "link" ? externalUrl.trim() : null,
        body: resourceType === "text" ? body.trim() : null
      });

      onCreated(created);
      resetForm();
    } catch (err) {
      setFormError(formatError(err));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded bg-white p-6 shadow-soft">
      <h2 className="text-2xl font-black">Add a resource</h2>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
        <div>
          <label className={LABEL_CLASS} htmlFor="resource-type">
            Type
          </label>
          <select
            id="resource-type"
            className={SELECT_CLASS + " mt-1"}
            value={resourceType}
            onChange={(e) => setResourceType(e.target.value as ResourceType)}
          >
            {RESOURCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="resource-title">
            Title
          </label>
          <input
            id="resource-title"
            className={INPUT_CLASS + " mt-1"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Tee work — load & stride"
          />
        </div>

        {/* Type-specific payload. Distinct keys force React to remount when the
            type changes, so the file <input> never reconciles into the URL
            <input> (which would flip it uncontrolled → controlled). */}
        {isFileType ? (
          <div className="sm:col-span-2" key="payload-file">
            <label className={LABEL_CLASS} htmlFor="resource-file">
              File
            </label>
            <input
              id="resource-file"
              type="file"
              accept={fileAccept}
              className="focus-ring mt-1 w-full rounded border border-dashed border-ink/25 bg-chalk/50 px-3 py-2 text-sm font-semibold text-ink/70 file:mr-3 file:rounded file:border-0 file:bg-ink file:px-3 file:py-1.5 file:font-bold file:text-white"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        ) : resourceType === "link" ? (
          <div className="sm:col-span-2" key="payload-link">
            <label className={LABEL_CLASS} htmlFor="resource-url">
              URL
            </label>
            <input
              id="resource-url"
              type="url"
              className={INPUT_CLASS + " mt-1"}
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
        ) : (
          <div className="sm:col-span-2" key="payload-text">
            <label className={LABEL_CLASS} htmlFor="resource-body">
              Note text
            </label>
            <textarea
              id="resource-body"
              className={INPUT_CLASS + " mt-1 min-h-[100px] resize-y leading-6"}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the drill steps, cues, or reminders…"
            />
          </div>
        )}

        <div className="sm:col-span-2">
          <label className={LABEL_CLASS} htmlFor="resource-description">
            Description <span className="font-semibold normal-case text-ink/40">(optional)</span>
          </label>
          <textarea
            id="resource-description"
            className={INPUT_CLASS + " mt-1 min-h-[60px] resize-y leading-6"}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A sentence to help clients understand what this is."
          />
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="resource-category">
            Category
          </label>
          <select
            id="resource-category"
            className={SELECT_CLASS + " mt-1"}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="resource-skill">
            Skill level
          </label>
          <select
            id="resource-skill"
            className={SELECT_CLASS + " mt-1"}
            value={skillLevel}
            onChange={(e) => setSkillLevel(e.target.value as ResourceSkillLevel)}
          >
            {SKILL_LEVELS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="resource-session">
            Session type <span className="font-semibold normal-case text-ink/40">(optional)</span>
          </label>
          <select
            id="resource-session"
            className={SELECT_CLASS + " mt-1"}
            value={sessionType}
            onChange={(e) => setSessionType(e.target.value)}
          >
            <option value="">Any session type</option>
            {trainingTypes.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="resource-visibility">
            Visibility
          </label>
          <select
            id="resource-visibility"
            className={SELECT_CLASS + " mt-1"}
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as ResourceVisibility)}
          >
            {VISIBILITIES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink/50">
            {VISIBILITIES.find((v) => v.value === visibility)?.hint}
          </p>
        </div>

        {formError ? (
          <p className="sm:col-span-2 rounded border border-clay/20 bg-clay/5 px-4 py-2 text-sm font-semibold text-clay">
            {formError}
          </p>
        ) : null}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={isSaving}
            className="focus-ring inline-flex items-center gap-2 rounded bg-ink px-5 py-3 font-bold text-white transition hover:bg-clay disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
            {isSaving ? "Saving…" : "Add resource"}
          </button>
        </div>
      </form>
    </section>
  );
}

function ResourceRow({
  resource,
  categories,
  trainingTypes,
  onUpdated,
  onDeleted
}: {
  resource: Resource;
  categories: ResourceCategory[];
  trainingTypes: TrainingType[];
  onUpdated: (r: Resource) => void;
  onDeleted: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const Icon = typeIcon(resource.resource_type);
  const href = resource.file_url ?? resource.external_url ?? null;

  async function handleDelete() {
    if (!window.confirm(`Delete "${resource.title}"? This can't be undone.`)) return;
    setIsDeleting(true);
    try {
      await deleteResource(resource.id);
      onDeleted();
    } catch (err) {
      setIsDeleting(false);
      window.alert(formatError(err));
    }
  }

  if (isEditing) {
    return (
      <li className="px-4 py-4">
        <ResourceEditForm
          resource={resource}
          categories={categories}
          trainingTypes={trainingTypes}
          onCancel={() => setIsEditing(false)}
          onSaved={(updated) => {
            onUpdated(updated);
            setIsEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-chalk text-ink/60">
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <p className="truncate font-bold">{resource.title}</p>
          <p className="truncate text-sm text-ink/55">
            {resource.category?.name ?? "Uncategorized"} · {resource.skill_level}
            {resource.session_type ? ` · ${resource.session_type}` : ""}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={[
            "rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wide",
            visibilityBadge(resource.visibility)
          ].join(" ")}
        >
          {resource.visibility.replace("_", " ")}
        </span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="focus-ring rounded border border-ink/12 px-3 py-1.5 text-sm font-bold text-ink transition hover:bg-chalk"
          >
            Open
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          aria-label={`Edit ${resource.title}`}
          className="focus-ring rounded border border-ink/12 px-2.5 py-1.5 text-ink/70 transition hover:bg-chalk"
        >
          <Pencil size={16} />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          aria-label={`Delete ${resource.title}`}
          className="focus-ring rounded border border-clay/20 px-2.5 py-1.5 text-clay transition hover:bg-clay/10 disabled:opacity-50"
        >
          {isDeleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
        </button>
      </div>
    </li>
  );
}

/**
 * Inline metadata editor. The file/URL/note payload type can't change here
 * (replacing a file means delete + re-create), but link URL and note text are
 * editable alongside the shared metadata fields.
 */
function ResourceEditForm({
  resource,
  categories,
  trainingTypes,
  onCancel,
  onSaved
}: {
  resource: Resource;
  categories: ResourceCategory[];
  trainingTypes: TrainingType[];
  onCancel: () => void;
  onSaved: (r: Resource) => void;
}) {
  const [title, setTitle] = useState(resource.title);
  const [description, setDescription] = useState(resource.description ?? "");
  const [categoryId, setCategoryId] = useState(resource.category_id ?? "");
  const [skillLevel, setSkillLevel] = useState<ResourceSkillLevel>(resource.skill_level);
  const [sessionType, setSessionType] = useState(resource.session_type ?? "");
  const [visibility, setVisibility] = useState<ResourceVisibility>(resource.visibility);
  const [externalUrl, setExternalUrl] = useState(resource.external_url ?? "");
  const [body, setBody] = useState(resource.body ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError("Give the resource a title.");
      return;
    }
    if (resource.resource_type === "link" && !externalUrl.trim()) {
      setFormError("Add a URL for the link.");
      return;
    }
    if (resource.resource_type === "text" && !body.trim()) {
      setFormError("Add the note text.");
      return;
    }

    const patch: ResourcePatch = {
      title: title.trim(),
      description: description.trim() || null,
      category_id: categoryId || null,
      skill_level: skillLevel,
      session_type: sessionType || null,
      visibility
    };
    if (resource.resource_type === "link") patch.external_url = externalUrl.trim();
    if (resource.resource_type === "text") patch.body = body.trim();

    setIsSaving(true);
    try {
      onSaved(await updateResource(resource.id, patch));
    } catch (err) {
      setFormError(formatError(err));
      setIsSaving(false);
    }
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSave}>
      <div className="sm:col-span-2">
        <label className={LABEL_CLASS} htmlFor={`edit-title-${resource.id}`}>
          Title
        </label>
        <input
          id={`edit-title-${resource.id}`}
          className={INPUT_CLASS + " mt-1"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {resource.resource_type === "link" ? (
        <div className="sm:col-span-2">
          <label className={LABEL_CLASS} htmlFor={`edit-url-${resource.id}`}>
            URL
          </label>
          <input
            id={`edit-url-${resource.id}`}
            type="url"
            className={INPUT_CLASS + " mt-1"}
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
          />
        </div>
      ) : resource.resource_type === "text" ? (
        <div className="sm:col-span-2">
          <label className={LABEL_CLASS} htmlFor={`edit-body-${resource.id}`}>
            Note text
          </label>
          <textarea
            id={`edit-body-${resource.id}`}
            className={INPUT_CLASS + " mt-1 min-h-[100px] resize-y leading-6"}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
      ) : null}

      <div className="sm:col-span-2">
        <label className={LABEL_CLASS} htmlFor={`edit-description-${resource.id}`}>
          Description <span className="font-semibold normal-case text-ink/40">(optional)</span>
        </label>
        <textarea
          id={`edit-description-${resource.id}`}
          className={INPUT_CLASS + " mt-1 min-h-[60px] resize-y leading-6"}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div>
        <label className={LABEL_CLASS} htmlFor={`edit-category-${resource.id}`}>
          Category
        </label>
        <select
          id={`edit-category-${resource.id}`}
          className={SELECT_CLASS + " mt-1"}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={LABEL_CLASS} htmlFor={`edit-skill-${resource.id}`}>
          Skill level
        </label>
        <select
          id={`edit-skill-${resource.id}`}
          className={SELECT_CLASS + " mt-1"}
          value={skillLevel}
          onChange={(e) => setSkillLevel(e.target.value as ResourceSkillLevel)}
        >
          {SKILL_LEVELS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={LABEL_CLASS} htmlFor={`edit-session-${resource.id}`}>
          Session type <span className="font-semibold normal-case text-ink/40">(optional)</span>
        </label>
        <select
          id={`edit-session-${resource.id}`}
          className={SELECT_CLASS + " mt-1"}
          value={sessionType}
          onChange={(e) => setSessionType(e.target.value)}
        >
          <option value="">Any session type</option>
          {trainingTypes.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={LABEL_CLASS} htmlFor={`edit-visibility-${resource.id}`}>
          Visibility
        </label>
        <select
          id={`edit-visibility-${resource.id}`}
          className={SELECT_CLASS + " mt-1"}
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as ResourceVisibility)}
        >
          {VISIBILITIES.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {formError ? (
        <p className="sm:col-span-2 rounded border border-clay/20 bg-clay/5 px-4 py-2 text-sm font-semibold text-clay">
          {formError}
        </p>
      ) : null}

      <div className="flex items-center gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={isSaving}
          className="focus-ring inline-flex items-center gap-2 rounded bg-ink px-4 py-2.5 font-bold text-white transition hover:bg-clay disabled:opacity-60"
        >
          {isSaving ? <Loader2 className="animate-spin" size={16} /> : null}
          {isSaving ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="focus-ring inline-flex items-center gap-2 rounded border border-ink/12 px-4 py-2.5 font-bold text-ink transition hover:bg-chalk"
        >
          <X size={16} />
          Cancel
        </button>
      </div>
    </form>
  );
}
