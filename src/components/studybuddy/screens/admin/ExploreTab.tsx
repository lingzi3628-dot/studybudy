"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Loader2, AlertCircle, Trash2, Star, UploadCloud, FileArchive,
  CheckCircle2, Compass, Eye, EyeOff, Power, RefreshCw, GraduationCap,
} from "lucide-react";

type Project = {
  id: string;
  title: string;
  description: string | null;
  track: string;
  gradeLevel: string | null;
  course: string | null;
  subject: string;
  category: string;
  tags: string[];
  projectUrl: string;
  thumbnailUrl: string | null;
  fileSize: number;
  viewCount: number;
  forkCount: number;
  starCount: number;
  isPublished: boolean;
  isFeatured: boolean;
  createdAt: string;
};

// Track options (must match Onboarding.tsx tracks)
const TRACKS = [
  { id: "k12",        label: "K-12 (CBC)",        grades: ["Kindergarten","Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"] },
  { id: "secondary",  label: "Secondary (8-4-4)", grades: ["Form 1","Form 2","Form 3","Form 4"] },
  { id: "university", label: "University",        grades: ["Year 1","Year 2","Year 3","Year 4","Year 5","Postgrad"] },
  { id: "college",    label: "College",            grades: ["Certificate","Diploma","Higher Diploma"] },
  { id: "tvet",       label: "TVET (CDACC)",      grades: ["CDACC Level 1","CDACC Level 2","CDACC Level 3","CDACC Level 4","CDACC Level 5","CDACC Level 6"] },
  { id: "dev",        label: "Developer",          grades: ["Beginner","Intermediate","Advanced"] },
];

// Subjects per track
const SUBJECTS: Record<string, string[]> = {
  k12:        ["Mathematics","English","Kiswahili","Science","Social Studies","Coding","Chinese","Life Skills","Business","CRE","Islamic","Music","Art"],
  secondary:  ["Mathematics","Physics","Chemistry","Biology","English","Kiswahili","History","Geography","CRE","Computer Studies","Business Studies","Agriculture"],
  university: ["Computer Science","Software Engineering","Data Science","Business","Economics","Law","Medicine","Engineering","Education","Psychology"],
  college:    ["ICT","Business Management","Accounting","Hospitality","Engineering","Journalism","Nursing","Pharmacy"],
  tvet:       ["Electrical Installation","Plumbing","Welding","Automotive Mechanics","ICT Technician","Hospitality","Fashion & Design","Building & Construction","Business Studies"],
  dev:        ["Web Development","Python","JavaScript","Databases","Mobile Development","DevOps","API Design","Machine Learning"],
};

const CATEGORIES = [
  { id: "interactive", label: "Interactive Demo" },
  { id: "tutorial",    label: "Tutorial" },
  { id: "game",        label: "Educational Game" },
  { id: "quiz",        label: "Quiz" },
  { id: "reference",   label: "Reference" },
  { id: "project",     label: "Starter Project" },
  { id: "demo",        label: "Demo" },
];

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

export function ExploreTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Upload form state
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [track, setTrack] = useState("k12");
  const [gradeLevel, setGradeLevel] = useState("all");
  const [course, setCourse] = useState("all");
  const [subject, setSubject] = useState("Mathematics");
  const [category, setCategory] = useState("interactive");
  const [tags, setTags] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);
  const [entryFile, setEntryFile] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Admin preview filter (separate from upload form)
  const [filterTrack, setFilterTrack] = useState<string>("");
  const [filterGrade, setFilterGrade] = useState<string>("");
  const [filterSubject, setFilterSubject] = useState<string>("");

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterTrack) params.set("track", filterTrack);
      const r = await fetch(`/api/admin/explore?${params.toString()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      let list = d.projects || [];
      if (filterGrade) list = list.filter((p: Project) => p.gradeLevel === filterGrade);
      if (filterSubject) list = list.filter((p: Project) => p.subject === filterSubject);
      setProjects(list);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [filterTrack, filterGrade, filterSubject]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  useEffect(() => {
    if (file && !title) {
      const name = file.name.replace(/\.zip$/i, "").replace(/[-_]/g, " ");
      setTitle(name.replace(/\b\w/g, (c) => c.toUpperCase()));
    }
  }, [file, title]);

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(t);
    }
  }, [success]);

  // Reset subject when track changes
  useEffect(() => {
    const subs = SUBJECTS[track] || [];
    if (subs.length && !subs.includes(subject)) {
      setSubject(subs[0]);
    }
  }, [track, subject]);

  const handleFileSelect = (f: File | null) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".zip")) {
      setError("Please select a .zip file");
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      setError("File too large (max 50 MB)");
      return;
    }
    setError(null);
    setFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelect(f);
  };

  const onUpload = async () => {
    if (!file) { setError("Pick a zip file first"); return; }
    if (!title.trim()) { setError("Title is required"); return; }
    setUploading(true);
    setUploadProgress(0);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title.trim());
      if (description) fd.append("description", description.trim());
      fd.append("track", track);
      fd.append("gradeLevel", gradeLevel);
      fd.append("course", course);
      fd.append("subject", subject);
      fd.append("category", category);
      if (tags.trim()) fd.append("tags", tags.trim());
      fd.append("isFeatured", String(isFeatured));
      if (entryFile.trim()) fd.append("entryFile", entryFile.trim());

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/admin/explore/upload");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };
      const responseText: string = await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
          else reject(new Error(`Upload failed: HTTP ${xhr.status} — ${xhr.responseText.slice(0, 300)}`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(fd);
      });

      const data = JSON.parse(responseText);
      setSuccess(`✓ "${data.project.title}" published! Users on ${track}${gradeLevel !== "all" ? " / " + gradeLevel : ""} / ${subject} will see it.`);
      // Reset form
      setFile(null);
      setTitle("");
      setDescription("");
      setCategory("interactive");
      setTags("");
      setIsFeatured(false);
      setEntryFile("");
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadProjects();
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const toggleFeatured = async (p: Project) => {
    try {
      await fetch("/api/admin/explore", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id, action: p.isFeatured ? "unfeature" : "feature" }),
      });
      await loadProjects();
    } catch { setError("Failed to toggle featured"); }
  };

  const togglePublished = async (p: Project) => {
    try {
      await fetch("/api/admin/explore", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id, action: p.isPublished ? "unpublish" : "publish" }),
      });
      await loadProjects();
    } catch { setError("Failed to toggle published"); }
  };

  const removeProject = async (p: Project) => {
    if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    try {
      const r = await fetch(`/api/admin/explore/${p.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSuccess(`"${p.title}" deleted.`);
      await loadProjects();
    } catch (e: any) { setError(e?.message ?? "Delete failed"); }
  };

  const currentTrack = TRACKS.find(t => t.id === track) || TRACKS[0];
  const currentSubjects = SUBJECTS[track] || [];
  // Course options for university/college/tvet tracks
  const [availableCourses, setAvailableCourses] = useState<string[]>([]);
  useEffect(() => {
    if (track === "university" || track === "college" || track === "tvet") {
      import("@/lib/education/catalog").then(({ getCoursesForTrack }) => {
        setAvailableCourses(getCoursesForTrack(track).map(c => c.name));
      }).catch(() => setAvailableCourses([]));
      setCourse("all");
    }
  }, [track]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Compass className="w-5 h-5 text-indigo-600" /> Explore Projects
        </h2>
        <button onClick={loadProjects} className="px-3 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-medium text-gray-700 flex items-center gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> {success}
        </div>
      )}

      {/* Upload card */}
      <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <UploadCloud className="w-4 h-4 text-indigo-600" /> Upload New Project (ZIP)
        </h3>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition ${
            dragOver ? "border-indigo-500 bg-indigo-50" : "border-gray-300 hover:border-indigo-400 hover:bg-gray-50"
          }`}
        >
          <input ref={fileInputRef} type="file" accept=".zip,application/zip" onChange={(e) => handleFileSelect(e.target.files?.[0] || null)} className="hidden" />
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <FileArchive className="w-10 h-10 text-indigo-500" />
              <p className="text-sm font-semibold text-gray-900">{file.name}</p>
              <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <UploadCloud className="w-10 h-10 text-gray-300" />
              <p className="text-sm font-semibold text-gray-700">Drop your project ZIP here</p>
              <p className="text-xs text-gray-500">or click to browse — max 50 MB</p>
            </div>
          )}
        </div>

        {uploading && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Uploading & extracting…</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-600 transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My Awesome Math Demo"
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Track</label>
            <select value={track} onChange={(e) => setTrack(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-indigo-400">
              {TRACKS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Grade / Level</label>
            <select value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} disabled={availableCourses.length > 0}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-indigo-400 disabled:bg-gray-100 disabled:opacity-50">
              <option value="all">{availableCourses.length > 0 ? "N/A — pick a course instead" : "All levels (general)"}</option>
              {currentTrack.grades.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          {availableCourses.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 block">Course</label>
              <select value={course} onChange={(e) => setCourse(e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-indigo-400">
                <option value="all">All courses (general for this track)</option>
                {availableCourses.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Subject</label>
            <select value={subject} onChange={(e) => setSubject(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-indigo-400">
              {currentSubjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-indigo-400">
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Tags (comma-separated)</label>
            <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="algebra, fractions, interactive"
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="What will students learn from this project?"
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-gray-700 mb-1 block">
              Entry file (optional) — relative path inside ZIP, e.g. <code>index.html</code>
            </label>
            <input type="text" value={entryFile} onChange={(e) => setEntryFile(e.target.value)}
              placeholder="Auto-detected if left blank"
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-indigo-400 font-mono" />
          </div>
          <label className="sm:col-span-2 flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} className="w-4 h-4 rounded accent-indigo-600" />
            <span className="text-sm text-gray-700">Show as Featured project in the hub</span>
          </label>
        </div>

        <button onClick={onUpload} disabled={!file || uploading || !title.trim()}
          className="mt-4 w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center gap-2">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
          {uploading ? "Uploading…" : "Upload & Publish Project"}
        </button>
      </div>

      {/* Filter + list */}
      <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Existing Projects ({projects.length})</h3>
        </div>

        {/* Filter row */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <select value={filterTrack} onChange={(e) => setFilterTrack(e.target.value)} className="h-9 rounded-lg border border-gray-200 px-2 text-xs">
            <option value="">All tracks</option>
            {TRACKS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <select value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)} className="h-9 rounded-lg border border-gray-200 px-2 text-xs">
            <option value="">All grades</option>
            {TRACKS.find(t => t.id === filterTrack)?.grades.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)} className="h-9 rounded-lg border border-gray-200 px-2 text-xs">
            <option value="">All subjects</option>
            {(filterTrack && SUBJECTS[filterTrack] || []).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {loading && (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div>
        )}

        {!loading && projects.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <Compass className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No projects yet. Upload your first one above.</p>
          </div>
        )}

        {!loading && projects.length > 0 && (
          <div className="space-y-2">
            {projects.map((p) => (
              <div key={p.id} className={`rounded-xl border p-3 flex items-center gap-3 ${p.isPublished ? "bg-white border-gray-200" : "bg-gray-50 border-gray-200 opacity-60"}`}>
                <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {p.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnailUrl} alt={p.title} className="w-full h-full object-cover" />
                  ) : (
                    <GraduationCap className="w-6 h-6 text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900 truncate">{p.title}</p>
                    {p.isFeatured && (
                      <span className="flex items-center gap-0.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">
                        <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" /> FEATURED
                      </span>
                    )}
                    {!p.isPublished && (
                      <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full font-bold">HIDDEN</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{p.description || "—"}</p>
                  <div className="flex items-center gap-3 text-[10px] text-gray-400 mt-0.5 flex-wrap">
                    <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium">{p.track}</span>
                    {p.gradeLevel && <span>{p.gradeLevel}</span>}
                    {p.course && <span className="bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded font-medium">🎓 {p.course}</span>}
                    <span>{p.subject}</span>
                    <span className="bg-gray-100 px-1.5 py-0.5 rounded">{p.category}</span>
                    <span>{p.viewCount} views</span>
                    <span>{formatBytes(p.fileSize)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleFeatured(p)} title={p.isFeatured ? "Unfeature" : "Feature"}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${p.isFeatured ? "text-amber-600 hover:bg-amber-50" : "text-gray-400 hover:bg-gray-100"}`}>
                    <Star className={`w-4 h-4 ${p.isFeatured ? "fill-amber-500" : ""}`} />
                  </button>
                  <button onClick={() => togglePublished(p)} title={p.isPublished ? "Hide from users" : "Show to users"}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${p.isPublished ? "text-emerald-600 hover:bg-emerald-50" : "text-gray-400 hover:bg-gray-100"}`}>
                    {p.isPublished ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <a href={p.projectUrl} target="_blank" rel="noopener noreferrer" title="Preview project"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100">
                    <Power className="w-4 h-4" />
                  </a>
                  <button onClick={() => removeProject(p)} title="Delete project"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-rose-600 hover:bg-rose-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Help */}
      <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3 text-xs text-indigo-700">
        <p className="font-semibold mb-1">How Explore projects work</p>
        <ol className="list-decimal list-inside space-y-0.5 text-indigo-600">
          <li>Build an HTML/CSS/JS demo (e.g. interactive fractions lesson for Grade 5 Math).</li>
          <li>ZIP the files (must contain at least one <code>.html</code> entry).</li>
          <li>Choose the audience: track (K-12, Secondary, University, etc.) + grade + subject.</li>
          <li>Upload — files are stored in the database (Vercel's filesystem is read-only).</li>
          <li>Users on that track+grade see the project in their Explore screen.</li>
          <li>Users can open (loads in iframe via <code>/api/explore/serve/&lt;id&gt;/...</code>) or fork it.</li>
        </ol>
      </div>
    </div>
  );
}
