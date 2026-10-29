import { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowDownRight, ArrowUpRight, Award, BriefcaseBusiness, Check, CircleHelp,
  Clock3, FileText, GraduationCap, LayoutDashboard, Lightbulb, LoaderCircle, LockKeyhole,
  LogOut, Menu, Plus, Search, Settings, ShieldCheck, Sparkles, Target, Trash2, Upload, UserRound, X,
} from "lucide-react";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "analyze", label: "Analyze resume", icon: FileText },
  { id: "matches", label: "Job matches", icon: Target },
  { id: "gaps", label: "Skill gap analysis", icon: Search },
  { id: "learning", label: "Learning plan", icon: Lightbulb },
  { id: "history", label: "History", icon: Clock3 },
  { id: "profile", label: "Profile & settings", icon: Settings },
];
const SkillsChart = lazy(() => import("./SkillsChart.jsx"));
const API = "/api";

async function request(path, options) {
  let response;
  try {
    response = await fetch(`${API}${path}`, { credentials: "same-origin", ...options });
  } catch (cause) {
    if (cause.name === "AbortError") throw new Error("The request timed out. Check your connection and try again.");
    throw new Error("Cannot connect to the ResumeIQ server. Start the Flask backend on port 5001, then retry.");
  }
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 && !path.includes("/auth/login")) {
    window.dispatchEvent(new Event("resumeiq:auth-required"));
  }
  if (!response.ok) throw new Error(payload.error || "Something went wrong. Please try again.");
  return payload;
}

function App() {
  const [page, setPage] = useState("dashboard");
  const [authStatus, setAuthStatus] = useState("checking");
  const [authPage, setAuthPage] = useState("welcome");
  const [user, setUser] = useState(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [splashVisible, setSplashVisible] = useState(() => !sessionStorage.getItem("resumeiq-splash-seen"));
  const [authError, setAuthError] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [roles, setRoles] = useState([]);
  const [history, setHistory] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [resumeText, setResumeText] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [studyLevel, setStudyLevel] = useState("Undergraduate");
  const [domain, setDomain] = useState("Software development");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [selectedFilename, setSelectedFilename] = useState("");
  const [analysisStages, setAnalysisStages] = useState([]);
  const [profileSaving, setProfileSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searchText, setSearchText] = useState("");

  const reloadHistory = async () => {
    const data = await request("/history");
    setHistory(data.history);
  };

  useEffect(() => {
    const expireSession = () => {
      setUser(null);
      setAnalysis(null);
      setHistory([]);
      setAuthStatus("signed-out");
      setAuthPage("login");
      setAuthError("Your session expired. Please sign in again.");
    };
    window.addEventListener("resumeiq:auth-required", expireSession);
    return () => window.removeEventListener("resumeiq:auth-required", expireSession);
  }, []);

  useEffect(() => {
    const splashTimer = window.setTimeout(() => {
      sessionStorage.setItem("resumeiq-splash-seen", "true");
      setSplashVisible(false);
    }, splashVisible ? 1700 : 0);
    request("/auth/me")
      .then(({ user: current }) => {
        if (current) {
          setUser(current);
          setAuthStatus("signed-in");
        } else {
          setAuthStatus("signed-out");
        }
      })
      .catch((cause) => {
        if (cause.message.startsWith("Cannot connect")) setAuthError(cause.message);
        setAuthStatus("signed-out");
      });
    request("/health")
      .then((health) => setAiAvailable(health.mode === "AI available"))
      .catch(() => setAiAvailable(false));
    return () => window.clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    if (authStatus !== "signed-in") return undefined;
    Promise.all([request("/roles"), request("/history")])
      .then(async ([roleData, historyData]) => {
        setRoles(roleData.roles);
        setHistory(historyData.history);
        if (historyData.history.length > 0) {
          const latest = await request(`/history/${historyData.history[0].id}`);
          setAnalysis(latest);
          setSelectedRole(latest.selected_role);
        }
      })
      .catch((cause) => setError(cause.message));
    return undefined;
  }, [authStatus]);

  const authenticate = async (event, mode) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setAuthError("");
    setAuthLoading(true);
    try {
      const { user: signedIn } = await request(`/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          confirm_password: form.get("confirm_password"),
        }),
      });
      setUser(signedIn);
      setAuthStatus("signed-in");
      setAuthPage("welcome");
      setError("");
    } catch (cause) {
      setAuthError(cause.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await request("/auth/logout", { method: "POST" });
      setUser(null);
      setAnalysis(null);
      setHistory([]);
      setAuthStatus("signed-out");
      setAuthPage("welcome");
      setPage("dashboard");
    } catch (cause) {
      setError(cause.message);
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileSaving(true);
    setError("");
    try {
      const { user: updated } = await request("/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: new FormData(event.currentTarget).get("name") }),
      });
      setUser(updated);
      setNotice("Your profile has been updated.");
    } catch (cause) {
      setError(cause.message);
    } finally {
      setProfileSaving(false);
    }
  };

  const analyzeResume = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!resumeText.trim()) {
      setError("Add your resume text or upload a PDF/DOCX before analyzing.");
      return;
    }
    setLoading(true);
    setAnalysisStages([
      { label: "Uploading resume", status: "done" },
      { label: "Extracting resume text", status: "done" },
      { label: "Analyzing skills and experience", status: "active" },
      { label: "Generating career recommendations", status: "pending" },
      { label: "Preparing your report", status: "pending" },
    ]);
    try {
      const result = await request("/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_text: resumeText,
          selected_role: selectedRole,
          study_level: studyLevel,
          preferred_domain: domain,
          external_ai_consent: consent,
        }),
      });
      setAnalysisStages((stages) => stages.map((stage) => ({ ...stage, status: "done" })));
      setAnalysis(result);
      setSelectedRole(result.selected_role);
      setPage("dashboard");
      setNotice(result.mode === "Demo mode"
        ? "Demo analysis complete. These rule-based recommendations are not AI-generated."
        : "Your AI-assisted analysis is ready.");
      await reloadHistory();
    } catch (cause) {
      setError(cause.message);
      setAnalysisStages([]);
    } finally {
      setLoading(false);
      window.setTimeout(() => setAnalysisStages([]), 1200);
    }
  };

  const previewUpload = async (file) => {
    if (!file) return;
    setError("");
    setNotice("");
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      setError("Choose a PDF or DOCX file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("The file is larger than the 5 MB limit.");
      return;
    }
    setSelectedFilename(file.name);
    setAnalysisStages([
      { label: "Uploading resume", status: "active" },
      { label: "Extracting resume text", status: "pending" },
      { label: "Analyzing skills and experience", status: "pending" },
      { label: "Generating career recommendations", status: "pending" },
      { label: "Preparing your report", status: "pending" },
    ]);
    setExtracting(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await request("/extract", { method: "POST", body });
      setAnalysisStages((stages) => stages.map((stage, index) => ({
        ...stage,
        status: index < 2 ? "done" : "pending",
      })));
      setResumeText(result.text);
      setNotice(`${file.name} text extracted. Review it below before analysis.`);
    } catch (cause) {
      setError(cause.message);
      setAnalysisStages([]);
    } finally {
      setExtracting(false);
    }
  };

  const openHistory = async (id) => {
    setError("");
    try {
      setAnalysis(await request(`/history/${id}`));
      setPage("dashboard");
    } catch (cause) {
      setError(cause.message);
    }
  };

  const deleteHistory = async (id) => {
    setError("");
    try {
      await request(`/history/${id}`, { method: "DELETE" });
      await reloadHistory();
      if (analysis?.id === id) setAnalysis(null);
    } catch (cause) {
      setError(cause.message);
    }
  };

  const filteredHistory = history.filter((item) =>
    `${item.selected_role} ${item.mode}`.toLowerCase().includes(searchText.toLowerCase()),
  );
  const latestScore = analysis?.resume_score ?? history[0]?.resume_score ?? 0;
  const pageTitle = NAV_ITEMS.find((item) => item.id === page)?.label || "Dashboard";
  const pageDescription = {
    dashboard: "A clearer view of your skills, opportunities, and next steps.",
    analyze: "Get practical feedback grounded in the experience you have documented.",
    matches: "Explore entry-level roles that align with your documented skills.",
    gaps: "Understand which role requirements are demonstrated, mentioned, or not yet documented.",
    learning: "Turn your chosen role's skill gaps into manageable steps.",
    history: "Review and manage previous resume analyses on this device.",
    profile: "Manage your account and personal preferences.",
  }[page];

  if (splashVisible || authStatus === "checking") return <SplashScreen />;
  if (authStatus === "signed-out") {
    return <WelcomeScreen
      mode={authPage}
      setMode={(mode) => { setAuthPage(mode); setAuthError(""); }}
      onSubmit={authenticate}
      loading={authLoading}
      error={authError}
      clearError={() => setAuthError("")}
    />;
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Sparkles size={19} /></div>
          <div><strong>Resume<span>IQ</span></strong><small>STUDENT CAREER STUDIO</small></div>
          <button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${page === id ? "active" : ""}`} onClick={() => { setPage(id); setMobileNav(false); }}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
              {id === "history" && history.length > 0 && <span className="nav-count">{history.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <div className="privacy-icon"><ShieldCheck size={17} /></div>
            <div><strong>Your data, your choice</strong><p>Full resume text is not saved to history.</p></div>
          </div>
          <div className="profile-mini">
            <div className="avatar">{user?.name?.slice(0, 1).toUpperCase() || "S"}</div>
            <div><strong>{user?.name || "Student"}</strong><span>{user?.email}</span></div>
            <button className="profile-signout" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut size={15} /></button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <div className="breadcrumbs"><span>ResumeIQ</span><span className="crumb-slash">/</span><strong>{pageTitle}</strong></div>
          <div className="topbar-right">
            <span className={`mode-badge ${analysis?.mode === "AI-assisted" ? "mode-ai" : ""}`}><span />{analysis?.mode || "Demo mode"}</span>
            <button className="help-button" title="Analysis is an estimate, not hiring advice"><CircleHelp size={18} /></button>
          </div>
        </header>
        {error && <div className="alert alert-error" role="alert"><X size={17} />{error}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button></div>}
        {notice && !error && <div className="alert alert-success" role="status"><Check size={17} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={16} /></button></div>}
        <section className="page-content">
          <div className="page-heading">
            <div><div className="eyebrow">YOUR CAREER JOURNEY</div><h1>{pageTitle}</h1><p>{pageDescription}</p></div>
            <button className="button button-primary heading-action" onClick={() => { setPage("analyze"); setError(""); setNotice(""); }}><Plus size={17} /> New analysis</button>
          </div>
          {page === "analyze" && <AnalyzePage {...{ roles, resumeText, setResumeText, selectedRole, setSelectedRole, studyLevel, setStudyLevel, domain, setDomain, consent, setConsent, aiAvailable, loading, extracting, selectedFilename, analysisStages, analyzeResume, previewUpload, clearUpload: () => { setSelectedFilename(""); setResumeText(""); setAnalysisStages([]); } }} />}
          {page === "dashboard" && <Dashboard analysis={analysis} history={history} latestScore={latestScore} onAnalyze={() => setPage("analyze")} onNavigate={setPage} />}
          {page === "matches" && <MatchesPage analysis={analysis} onAnalyze={() => setPage("analyze")} />}
          {page === "gaps" && <SkillGapPage analysis={analysis} onAnalyze={() => setPage("analyze")} />}
          {page === "learning" && <LearningPage analysis={analysis} onAnalyze={() => setPage("analyze")} />}
          {page === "history" && <HistoryPage history={filteredHistory} searchText={searchText} setSearchText={setSearchText} openHistory={openHistory} deleteHistory={deleteHistory} />}
          {page === "profile" && <ProfilePage user={user} onSave={saveProfile} saving={profileSaving} onSignOut={signOut} />}
          <footer className="footer-note"><LockKeyhole size={13} /> Resume-improvement indicator only · Not a hiring score or employment guarantee</footer>
        </section>
      </main>
    </div>
  );
}

function SplashScreen() {
  return (
    <main className="splash-screen" aria-label="Loading ResumeIQ">
      <div className="splash-orbit"><div className="splash-logo"><FileText size={28} /><Sparkles size={16} /></div></div>
      <div className="splash-wordmark">Resume<span>IQ</span></div>
      <p>Understand your resume. Discover your next opportunity.</p>
      <div className="splash-loader"><i /></div>
    </main>
  );
}

function WelcomeScreen({ mode, setMode, onSubmit, loading, error, clearError }) {
  if (mode === "welcome") {
    return (
      <main className="welcome-screen">
        <div className="welcome-topbar"><div className="brand-mark"><Sparkles size={19} /></div><strong>Resume<span>IQ</span></strong><span className="welcome-student-tag">STUDENT CAREER STUDIO</span></div>
        <div className="welcome-layout">
          <section className="welcome-copy">
            <div className="welcome-pill"><span /> YOUR NEXT CHAPTER STARTS HERE</div>
            <h1>Understand your resume.<br /><span>Discover your next opportunity.</span></h1>
            <p>A thoughtful, practical look at the skills you demonstrate, roles you could explore, and steps to tell your story with confidence.</p>
            <div className="welcome-actions"><button className="button button-primary" onClick={() => { clearError(); setMode("register"); }}>Get started <ArrowUpRight size={16} /></button><button className="button button-secondary" onClick={() => { clearError(); setMode("login"); }}>Sign in</button></div>
            {error && <div className="welcome-error" role="alert">{error}</div>}
            <div className="welcome-promises"><span><ShieldCheck size={15} /> Private by design</span><span><Sparkles size={15} /> Demo mode included</span></div>
          </section>
          <div className="welcome-preview" aria-hidden="true">
            <div className="preview-glow" />
            <div className="preview-score-card"><div className="preview-card-heading"><span className="preview-mini-logo"><FileText size={14} /></span><span>YOUR RESUME SNAPSHOT</span><MoreDots /></div><div className="preview-score-row"><div className="preview-score-ring"><strong>78</strong><small>score</small></div><div><strong>A strong starting point</strong><p>Room to grow, potential to discover.</p></div></div><div className="preview-divider" /><div className="preview-bar-label"><span>Skills relevance</span><b>21 / 25</b></div><div className="preview-bar"><i style={{ width: "84%" }} /></div><div className="preview-bar-label"><span>Projects &amp; practical evidence</span><b>18 / 25</b></div><div className="preview-bar"><i style={{ width: "72%" }} /></div><div className="preview-role-card"><div><Target size={16} /><span><b>Backend Developer</b><small>One direction to explore</small></span></div><span className="preview-match">82%</span></div></div>
            <div className="preview-floating"><div><Check size={14} /></div><span><b>Your skills, clearly</b><small>Evidence-informed feedback</small></span></div>
          </div>
        </div>
        <footer className="welcome-footer"><span>© ResumeIQ · Student Career Studio</span><span>Not a hiring prediction. Always your next step.</span></footer>
      </main>
    );
  }
  const registering = mode === "register";
  return (
    <main className="auth-screen">
      <button className="auth-back" onClick={() => { clearError(); setMode("welcome"); }}><ArrowDownRight size={15} /> Back to welcome</button>
      <section className="auth-card">
        <div className="auth-brand"><div className="brand-mark"><Sparkles size={19} /></div><strong>Resume<span>IQ</span></strong></div>
        <div className="eyebrow">{registering ? "CREATE YOUR ACCOUNT" : "WELCOME BACK"}</div>
        <h1>{registering ? "Your next step starts here." : "Good to see you again."}</h1>
        <p className="auth-intro">{registering ? "Create your private student workspace to explore your resume and career direction." : "Sign in to pick up where you left off."}</p>
        {error && <div className="auth-error" role="alert"><CircleHelp size={15} />{error}</div>}
        <form className="auth-form" onSubmit={(event) => onSubmit(event, registering ? "register" : "login")}>
          {registering && <div className="field-group"><label className="field-label" htmlFor="auth-name">Full name</label><input id="auth-name" name="name" autoComplete="name" maxLength="100" placeholder="How should we address you?" required /></div>}
          <div className="field-group"><label className="field-label" htmlFor="auth-email">Email address</label><input id="auth-email" name="email" type="email" autoComplete="email" maxLength="254" placeholder="you@example.edu" required /></div>
          <div className="field-group"><label className="field-label" htmlFor="auth-password">Password</label><input id="auth-password" name="password" type="password" autoComplete={registering ? "new-password" : "current-password"} minLength={registering ? 10 : 1} maxLength="128" placeholder={registering ? "At least 10 characters" : "Enter your password"} required /></div>
          {registering && <div className="field-group"><label className="field-label" htmlFor="auth-confirm">Confirm password</label><input id="auth-confirm" name="confirm_password" type="password" autoComplete="new-password" minLength="10" maxLength="128" placeholder="Enter your password again" required /></div>}
          <button type="submit" className="button button-primary auth-submit" disabled={loading}>{loading ? <><LoaderCircle className="spin" size={16} /> {registering ? "Creating account…" : "Signing in…"}</> : registering ? "Create account" : "Sign in"} {!loading && <ArrowUpRight size={16} />}</button>
        </form>
        <div className="auth-switch">{registering ? "Already have an account?" : "New to ResumeIQ?"}<button onClick={() => { clearError(); setMode(registering ? "login" : "register"); }}>{registering ? "Sign in" : "Get started"}</button></div>
        <div className="auth-security"><LockKeyhole size={13} /> Passwords are securely hashed. Your account data stays local to this app.</div>
      </section>
    </main>
  );
}

function MoreDots() {
  return <span className="preview-dots"><i /><i /><i /></span>;
}

function AnalyzePage(props) {
  const {
    roles, resumeText, setResumeText, selectedRole, setSelectedRole, studyLevel, setStudyLevel, domain,
    setDomain, consent, setConsent, aiAvailable, loading, extracting, selectedFilename, analysisStages,
    analyzeResume, previewUpload, clearUpload,
  } = props;
  const domains = [...new Set(roles.map((role) => role.domain))];
  const onDrop = (event) => {
    event.preventDefault();
    previewUpload(event.dataTransfer.files?.[0]);
  };
  return (
    <div className="analyze-grid">
      <form className="panel resume-form" onSubmit={analyzeResume}>
        <div className="panel-heading"><div><div className="eyebrow">STEP 01 · YOUR EXPERIENCE</div><h2>Start with your resume</h2><p>Paste the text or upload a document. You can edit the extracted text before analysis.</p></div><div className="step-number">01</div></div>
        <div className={`upload-zone ${extracting ? "upload-busy" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
          <input id="resume-upload" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { previewUpload(event.target.files?.[0]); event.target.value = ""; }} />
          <div className="upload-icon">{extracting ? <LoaderCircle className="spin" size={21} /> : <Upload size={20} />}</div>
          <div className="upload-copy"><strong>{extracting ? "Uploading & extracting…" : selectedFilename || "Drop your resume here"}</strong><span>{selectedFilename && !extracting ? "Text extracted. Review it in the preview below." : "PDF or DOCX · 5 MB max · Full resume text is not saved"}</span></div>
          <label className="button button-secondary browse-button" htmlFor="resume-upload">{extracting ? "Please wait" : selectedFilename ? "Choose another" : "Browse files"}</label>
          {selectedFilename && !extracting && <button className="clear-upload" type="button" onClick={clearUpload} aria-label="Clear selected resume"><X size={15} /></button>}
        </div>
        <div className="or-divider"><span>OR PASTE YOUR RESUME</span></div>
        <label className="field-label" htmlFor="resume-text">Resume text <span className="required">*</span></label>
        <textarea id="resume-text" className="resume-textarea" value={resumeText} onChange={(event) => setResumeText(event.target.value)} maxLength={50000} placeholder={"Paste your resume content here…\n\nInclude education, skills, projects, experience, and certifications where applicable."} required />
        <div className="textarea-meta"><span>Keep personal contact details out of your sample if you prefer.</span><span>{resumeText.length.toLocaleString()} / 50,000</span></div>
        {analysisStages.length > 0 && <div className="stage-panel" aria-live="polite"><div className="stage-heading">Analysis progress <span>{analysisStages.filter((stage) => stage.status === "done").length} / {analysisStages.length}</span></div>{analysisStages.map((stage, index) => <div className={`stage-item stage-${stage.status}`} key={stage.label}><span className="stage-marker">{stage.status === "done" ? <Check size={12} /> : stage.status === "active" ? <LoaderCircle className="spin" size={12} /> : String(index + 1).padStart(2, "0")}</span><span>{stage.label}</span><small>{stage.status === "done" ? "Complete" : stage.status === "active" ? "In progress" : "Waiting"}</small></div>)}</div>}
        <div className="form-grid">
          <div className="field-group"><label className="field-label" htmlFor="role">Target role</label><select id="role" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}><option value="">Recommend roles automatically</option>{roles.map((role) => <option key={role.title} value={role.title}>{role.title}</option>)}</select></div>
          <div className="field-group"><label className="field-label" htmlFor="study-level">Study level</label><select id="study-level" value={studyLevel} onChange={(event) => setStudyLevel(event.target.value)}>{["Undergraduate", "Postgraduate", "Recent graduate"].map((item) => <option key={item}>{item}</option>)}</select></div>
          <div className="field-group"><label className="field-label" htmlFor="domain">Preferred domain</label><select id="domain" value={domain} onChange={(event) => setDomain(event.target.value)}>{domains.map((item) => <option key={item}>{item}</option>)}</select></div>
        </div>
        <label className="consent-box"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><strong>Allow external AI processing (optional)</strong><small>{aiAvailable ? "With consent, resume text is sent to OpenAI for qualitative feedback. Leave unchecked to use clearly labelled demo mode." : "No OpenAI API key is configured. Demo mode works without one; add OPENAI_API_KEY to the Flask environment to enable AI-assisted feedback."} Do not include sensitive personal information.</small></span></label>
        <div className="form-actions"><span><LockKeyhole size={14} /> Full resume text is not saved; results may contain short snippets</span><button type="submit" className="button button-primary" disabled={loading || extracting}>{loading ? <><LoaderCircle className="spin" size={17} /> Analyzing…</> : <><Sparkles size={17} /> Analyze my resume</>}</button></div>
      </form>
      <aside className="analyze-aside">
        <div className="panel guide-panel"><div className="guide-icon"><Sparkles size={19} /></div><div className="eyebrow">A BETTER FIRST IMPRESSION</div><h3>Make your experience easy to see.</h3><p>Get a structured view of the skills you mention, roles that may fit, and practical ways to strengthen your story.</p><div className="guide-list"><span><Check size={15} /> Skill evidence, not just keywords</span><span><Check size={15} /> Actionable suggestions</span><span><Check size={15} /> Role-alignment estimates</span></div></div>
        <div className="notice-card"><ShieldCheck size={17} /><div><strong>Your resume stays yours</strong><p>History stores analysis results and may include short evidence snippets, but not the full resume. External AI is optional and requires your consent.</p></div></div>
        <div className="rubric-card"><div className="rubric-title"><Award size={17} /> How the score works</div><div className="rubric-row"><span>Skills relevance</span><b>25 pts</b></div><div className="rubric-row"><span>Projects &amp; practice</span><b>25 pts</b></div><div className="rubric-row"><span>Education &amp; experience</span><b>15 pts</b></div><div className="rubric-row"><span>Clarity &amp; structure</span><b>15 pts</b></div><div className="rubric-row"><span>Role alignment</span><b>20 pts</b></div><small>Transparent improvement indicator — not a hiring prediction.</small></div>
      </aside>
    </div>
  );
}

function SkillGapPage({ analysis, onAnalyze }) {
  if (!analysis) return <EmptyState onAnalyze={onAnalyze} title="Make skill gaps a practical next step." body="Analyze a resume first to compare documented strengths with one of your target roles." />;
  const role = analysis.recommended_roles.find((item) => item.title === analysis.selected_role) || analysis.recommended_roles[0];
  const demonstrated = new Set(analysis.skills.filter((skill) => skill.demonstrated).map((skill) => skill.name.toLowerCase()));
  const mentioned = new Set(analysis.skills.map((skill) => skill.name.toLowerCase()));
  const coreSkills = [...new Set([...role.matching_skills, ...role.missing_skills])];
  return <div className="gap-layout"><div className="match-intro panel"><div className="match-intro-icon"><Target size={19} /></div><div><div className="eyebrow">SELECTED ROLE · {role.title.toUpperCase()}</div><h2>Not documented doesn't mean you don't have it.</h2><p>This comparison reflects only what your resume currently says. Add evidence where accurate, or choose one skill to explore.</p></div></div><div className="gap-summary-grid"><MetricCard title="Demonstrated" value={role.demonstrated_matching_skills.length} icon={Check} accent="mint" trend="Core skills with nearby practical evidence" /><MetricCard title="Mentioned" value={role.matching_skills.length} icon={Sparkles} accent="blue" trend="Present in your resume text" /><MetricCard title="Not documented" value={role.missing_skills.length} icon={Target} accent="amber" trend="Not found; may exist but be undocumented" /></div><section className="panel gap-details"><div className="eyebrow">CORE ROLE SKILLS</div><h2>Evidence at a glance</h2><div className="gap-list">{coreSkills.map((skill) => { const key = skill.toLowerCase(); const status = demonstrated.has(key) ? "demonstrated" : mentioned.has(key) ? "mentioned" : "undocumented"; return <div className={`gap-row gap-${status}`} key={skill}><span className="gap-state">{status === "demonstrated" ? <Check size={14} /> : status === "mentioned" ? <Sparkles size={14} /> : <Target size={14} />}</span><strong>{skill}</strong><span className="gap-status-label">{status === "undocumented" ? "Not found in resume" : status === "mentioned" ? "Mentioned · add evidence if accurate" : "Demonstrated in context"}</span></div>; })}</div></section><div className="gap-priority"><Lightbulb size={17} /><span><strong>Start where it matters to you.</strong> Prioritize a gap that fits your interests and current goals; role skill lists are guides, not checklists.</span></div></div>;
}

function ProfilePage({ user, onSave, saving, onSignOut }) {
  return <div className="profile-layout"><section className="panel profile-card"><div className="profile-card-top"><div className="profile-avatar-large">{user?.name?.slice(0, 1).toUpperCase() || <UserRound size={25} />}</div><div><div className="eyebrow">YOUR ACCOUNT</div><h2>Profile &amp; settings</h2><p>Your private student workspace.</p></div></div><form className="profile-form" onSubmit={onSave}><div className="field-group"><label className="field-label" htmlFor="profile-name">Name</label><input id="profile-name" name="name" defaultValue={user?.name || ""} maxLength="100" required /></div><div className="field-group"><label className="field-label" htmlFor="profile-email">Email</label><input id="profile-email" name="email" value={user?.email || ""} readOnly /><small>Email address identifies your account and cannot currently be changed.</small></div><button className="button button-primary" disabled={saving}>{saving ? <><LoaderCircle className="spin" size={15} /> Saving…</> : "Save profile"}</button></form></section><section className="panel account-security"><div className="privacy-icon"><ShieldCheck size={19} /></div><div className="eyebrow">ACCOUNT SECURITY</div><h2>Your password is protected.</h2><p>Passwords are hashed before they are stored. Your signed-in session is kept in an HTTP-only browser cookie and expires after seven days.</p><div className="security-note"><LockKeyhole size={15} /> Resume analysis results are visible only to the account that created them.</div><button className="button button-secondary" onClick={onSignOut}><LogOut size={15} /> Sign out</button></section></div>;
}

function Dashboard({ analysis, history, latestScore, onAnalyze, onNavigate }) {
  if (!analysis) return (
    <div className="empty-dashboard">
      <div className="empty-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-card"><FileText size={31} /><span><i /><i /><i /></span><Sparkles className="art-sparkle" size={19} /></div></div>
      <div className="eyebrow">A GOOD PLACE TO BEGIN</div><h2>Your next opportunity starts with a clearer story.</h2><p>Understand the skills you already demonstrate, see where you could grow, and get practical next steps to prepare.</p>
      <button className="button button-primary" onClick={onAnalyze}><Sparkles size={17} /> Analyze your resume</button>
      <div className="empty-assurances"><span><ShieldCheck size={15} /> Private by design</span><span><Target size={15} /> Actionable feedback</span><span><GraduationCap size={15} /> Built for students</span></div>
    </div>
  );
  const skillCounts = analysis.skills.reduce((counts, skill) => {
    counts[skill.category] = (counts[skill.category] || 0) + 1;
    return counts;
  }, {});
  const skillData = Object.entries(skillCounts).map(([name, value]) => ({ name, value }));
  const comparablePrevious = history.find((item) =>
    item.id < analysis.id && item.selected_role === analysis.selected_role,
  );
  const scoreChange = comparablePrevious
    ? analysis.resume_score - comparablePrevious.resume_score
    : null;
  return (
    <div className="dashboard-stack">
      <div className="welcome-strip"><div className="welcome-symbol"><Sparkles size={19} /></div><div><strong>{analysis.mode === "AI-assisted" ? "AI-assisted analysis complete" : "Your resume snapshot is ready"}</strong><p>{analysis.selected_role} is your current focus. Treat every score as a starting point, not a verdict.</p></div><span className="welcome-mode">{analysis.mode}</span></div>
      <div className="metric-grid">
        <MetricCard title="Resume score" value={`${latestScore}`} suffix="/100" icon={Award} accent="blue" trend={analysis.score_breakdown?.[0]?.evidence || "Transparent improvement indicator"} />
        <MetricCard title="Skills identified" value={analysis.skills.length} icon={Sparkles} accent="mint" trend={`${analysis.demonstrated_skills.length} with practical evidence`} />
        <MetricCard title="Role matches" value={analysis.recommended_roles.length} icon={BriefcaseBusiness} accent="violet" trend="Estimated skills alignment" />
        <MetricCard title="Priority gaps" value={analysis.missing_skills.length} icon={Target} accent="amber" trend={analysis.selected_role || "Select a target role"} />
      </div>
      <div className="content-grid">
        <section className="panel score-panel"><div className="panel-title-row"><div><div className="eyebrow">YOUR ASSESSMENT</div><h2>Resume score breakdown</h2></div><button className="text-button" onClick={() => onNavigate("analyze")}>Improve score <ArrowUpRight size={15} /></button></div>
          <div className="score-main"><div className="score-ring" style={{ "--score": `${analysis.resume_score}%` }}><div><strong>{analysis.resume_score}</strong><small>out of 100</small></div></div><div className="score-caption"><strong>{scoreChange === null ? "A useful starting point" : `${scoreChange >= 0 ? "+" : ""}${scoreChange} points vs prior analysis`}</strong><span>{scoreChange === null ? "Scores reflect documented evidence, not your potential." : `Compared with your earlier ${analysis.selected_role} analysis.`}</span></div></div>
          <div className="breakdown-list">{analysis.score_breakdown.map((item) => <div key={item.category} className="breakdown-row"><div className="breakdown-label"><span>{item.category}</span><b>{item.score}<small>/{item.max_points}</small></b></div><div className="progress-track"><div style={{ width: `${item.score / item.max_points * 100}%` }} /></div><small className="breakdown-evidence">{item.evidence}</small></div>)}</div>
        </section>
        <section className="panel skills-panel"><div className="panel-title-row"><div><div className="eyebrow">SKILLS LANDSCAPE</div><h2>What you bring</h2></div><button className="circle-action" onClick={() => onNavigate("matches")} aria-label="View job matches"><ArrowUpRight size={17} /></button></div>
          {skillData.length ? <Suspense fallback={<div className="chart-loading"><LoaderCircle className="spin" size={20} /> Loading chart…</div>}><SkillsChart data={skillData} total={analysis.skills.length} /></Suspense> : <EmptyInline message="Add skills to your resume to see your profile." />}
        </section>
      </div>
      <div className="content-grid lower-grid">
        <section className="panel roles-panel"><div className="panel-title-row"><div><div className="eyebrow">POTENTIAL DIRECTIONS</div><h2>Recommended roles</h2></div><button className="text-button" onClick={() => onNavigate("matches")}>Explore all <ArrowUpRight size={15} /></button></div>
          {analysis.recommended_roles.slice(0, 3).map((role, index) => <div className="role-row" key={role.title}><div className="role-rank">0{index + 1}</div><div className="role-info"><strong>{role.title}</strong><span>{role.domain} · {role.matching_skills.length} matching skills</span></div><div className="role-match"><strong>{role.match_score}%</strong><span>match</span></div><div className="mini-track"><i style={{ width: `${role.match_score}%` }} /></div></div>)}
          <p className="fine-print"><CircleHelp size={13} /> Alignment estimate based on documented core skills; not a hiring probability.</p>
        </section>
        <section className="panel next-panel"><div className="eyebrow">SUGGESTED NEXT STEP</div><h2>{analysis.learning_plan?.[0] ? `Explore ${analysis.learning_plan[0].skill}` : "Strengthen your project story"}</h2><p>{analysis.learning_plan?.[0]?.why || "Add a project section with your contributions and outcomes to make your experience easier to assess."}</p><button className="button button-secondary" onClick={() => onNavigate("learning")}>View learning plan <ArrowUpRight size={15} /></button><div className="next-decoration"><Lightbulb size={26} /></div></section>
      </div>
      <div className="bottom-grid"><section className="panel summary-panel"><div className="panel-title-row"><div><div className="eyebrow">YOUR STORY SO FAR</div><h2>Resume summary</h2></div><span className="tag tag-soft">{analysis.mode}</span></div><p>{analysis.resume_summary}</p>{analysis.resume_strengths.slice(0, 2).map((strength) => <div className="strength-line" key={strength}><Check size={15} />{strength}</div>)}</section>
        <section className="panel history-widget"><div className="panel-title-row"><div><div className="eyebrow">ON THIS DEVICE</div><h2>Recent analyses</h2></div><button className="text-button" onClick={() => onNavigate("history")}>View history <ArrowUpRight size={15} /></button></div>{history.slice(0, 3).map((item) => <button className="recent-item" key={item.id} onClick={() => onNavigate("history")}><div className="recent-icon"><FileText size={16} /></div><span><strong>{item.selected_role}</strong><small>{new Date(item.created_at).toLocaleDateString()}</small></span><b>{item.resume_score}</b></button>)}{history.length === 0 && <EmptyInline message="Your saved analyses will appear here." />}</section></div>
      <section className="panel skill-evidence-panel"><div className="panel-title-row"><div><div className="eyebrow">EVIDENCE, NOT JUST KEYWORDS</div><h2>Skills found in your resume</h2></div><span className="tag tag-soft">{analysis.skills.length} identified</span></div>
        {analysis.skills.length ? <div className="skill-evidence-list">{analysis.skills.map((skill) => <div className="skill-evidence-row" key={`${skill.name}-${skill.category}`}><div className="skill-name"><strong>{skill.name}</strong><span>{skill.category}</span></div><p>{skill.evidence || "Mentioned in the resume."}</p><span className={`tag ${skill.demonstrated ? "tag-positive" : "tag-outline"}`}>{skill.demonstrated ? "Evidence found" : "Mentioned"}</span><small>{Math.round(skill.confidence * 100)}% extraction confidence</small></div>)}</div> : <EmptyInline message="No catalog skills were found in this resume." />}
      </section>
      <div className="feedback-grid"><section className="panel review-panel"><div className="eyebrow">RESUME REVIEW</div><h2>Strengths and opportunities</h2><div className="review-columns"><div><strong className="review-heading positive"><Check size={14} /> Strengths</strong>{analysis.resume_strengths.map((item, index) => <p className="review-item" key={`${index}-${item}`}>{item}</p>)}</div><div><strong className="review-heading caution"><Target size={14} /> To strengthen</strong>{analysis.resume_weaknesses.map((item, index) => <p className="review-item" key={`${index}-${item}`}>{item}</p>)}</div></div><div className="suggestion-list">{analysis.improvement_suggestions.map((item, index) => <div className="suggestion-item" key={`${index}-${item.issue}`}><strong>{item.issue}</strong><p>{item.recommendation}</p></div>)}</div></section>
        <section className="panel rewrite-panel"><div className="eyebrow">SUGGESTED BULLET IMPROVEMENTS</div><h2>Make your contribution clear</h2>{analysis.suggested_bullet_rewrites.length ? analysis.suggested_bullet_rewrites.map((item, index) => <div className="rewrite-item" key={`${index}-${item.original}`}><div><span>ORIGINAL</span><p>{item.original}</p></div><div><span>SUGGESTION · VERIFY BEFORE USING</span><p>{item.suggestion}</p></div></div>) : <p className="no-rewrite">No short, vague bullet statements were detected. Keep project descriptions specific and support any results with evidence.</p>}</section></div>
    </div>
  );
}

function MetricCard({ title, value, suffix, icon: Icon, accent, trend }) {
  return <div className="metric-card"><div className={`metric-icon ${accent}`}><Icon size={18} /></div><span className="metric-title">{title}</span><div className="metric-value">{value}<small>{suffix}</small></div><div className="metric-trend"><ArrowDownRight size={14} />{trend}</div></div>;
}

function MatchesPage({ analysis, onAnalyze }) {
  if (!analysis) return <EmptyState onAnalyze={onAnalyze} title="Explore roles that fit your story." body="Analyze a resume first to see role-by-role skill alignment and areas to strengthen." />;
  return <div className="matches-layout"><div className="match-intro panel"><div className="match-intro-icon"><BriefcaseBusiness size={19} /></div><div><div className="eyebrow">ROLE ALIGNMENT · ESTIMATE ONLY</div><h2>Possibilities, not predictions.</h2><p>Scores compare skills mentioned in your resume with a sample entry-level role dataset. They are not hiring probabilities or live job listings.</p></div></div><div className="role-cards">{analysis.recommended_roles.map((role, index) => <article className="panel role-card" key={role.title}><div className="role-card-top"><span className="role-number">0{index + 1}</span><span className="tag">{role.domain}</span></div><div className="role-card-title"><h2>{role.title}</h2><div className="match-score">{role.match_score}<small>%</small><span>alignment</span></div></div><div className="match-progress"><i style={{ width: `${role.match_score}%` }} /></div><p>{role.why}</p><div className="tag-groups"><div><strong className="group-heading positive"><Check size={14} /> Skills found</strong><div className="tag-list">{role.matching_skills.length ? role.matching_skills.map((skill) => <span className="tag tag-positive" key={skill}>{skill}</span>) : <span className="muted-text">None documented yet</span>}</div></div><div><strong className="group-heading caution"><Target size={14} /> Not documented</strong><div className="tag-list">{role.missing_skills.map((skill) => <span className="tag tag-outline" key={skill}>{skill}</span>)}</div></div><div><strong className="group-heading">Optional skills</strong><div className="tag-list">{role.optional_skills.map((skill) => <span className="tag" key={skill}>{skill}</span>)}</div></div></div><div className="project-tip"><Lightbulb size={16} /><span>{role.project_ideas[0]}</span></div></article>)}</div></div>;
}

function LearningPage({ analysis, onAnalyze }) {
  if (!analysis) return <EmptyState onAnalyze={onAnalyze} title="Small steps add up." body="Analyze a resume first to create a learning roadmap around a role you care about." />;
  const plan = analysis.learning_plan || [];
  return <div className="learning-layout"><div className="learning-banner"><div className="learning-banner-icon"><Lightbulb size={21} /></div><div><div className="eyebrow">PERSONALIZED ROADMAP · {analysis.selected_role.toUpperCase()}</div><h2>Build skills with purpose.</h2><p>Start with the documented skill gaps that matter most for your selected role. These are suggestions—not requirements for your worth or potential.</p></div></div>{plan.length ? <div className="learning-list">{plan.map((item) => <article className="panel learning-card" key={item.skill}><div className="learning-step">{String(item.sequence).padStart(2, "0")}</div><div className="learning-content"><div className="learning-title"><h3>{item.skill}</h3><span className="tag tag-soft">{item.level}</span></div><p>{item.why}</p><div className="learning-details"><div><strong>Explore</strong><span>{item.topics.join(" · ")}</span></div><div><strong>Practice</strong><span>{item.practice_task}</span></div><div><strong>Show it</strong><span>{item.project_idea}</span></div></div><a className="resource-link" href={item.resource_url} target="_blank" rel="noreferrer">Open learning resource <ArrowUpRight size={14} /></a></div></article>)}</div> : <div className="panel all-clear"><div className="all-clear-icon"><Check size={21} /></div><h3>No core skill gaps documented for this role.</h3><p>Consider strengthening evidence in your projects, or explore another role to find new directions.</p></div>}<div className="learning-disclaimer"><CircleHelp size={15} /> Learning suggestions do not guarantee a job or placement.</div></div>;
}

function HistoryPage({ history, searchText, setSearchText, openHistory, deleteHistory }) {
  return <section className="panel history-panel">  <div className="panel-title-row history-title-row"><div><div className="eyebrow">YOUR LOCAL HISTORY</div><h2>Saved analysis results</h2><p>Up to 100 results are kept in the local SQLite database. Full resume text is not stored, but short evidence snippets may be included.</p></div><div className="search-field"><Search size={16} /><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search role or mode" aria-label="Search analysis history" /></div></div>{history.length ? <div className="history-table-wrap"><table className="history-table"><thead><tr><th>ANALYSIS</th><th>TARGET ROLE</th><th>ASSESSMENT</th><th>MODE</th><th aria-label="Actions" /></tr></thead><tbody>{history.map((item) => <tr key={item.id}><td><button className="history-open" onClick={() => openHistory(item.id)}><span className="history-file-icon"><FileText size={16} /></span><span><strong>Resume analysis</strong><small>{new Date(item.created_at).toLocaleString()}</small></span></button></td><td>{item.selected_role}</td><td><span className="history-score">{item.resume_score}<small>/100</small></span></td><td><span className={`tag ${item.mode === "AI-assisted" ? "tag-ai" : "tag-soft"}`}>{item.mode}</span></td><td><button className="icon-button delete-button" onClick={() => deleteHistory(item.id)} title="Delete this analysis" aria-label="Delete analysis"><Trash2 size={16} /></button></td></tr>)}</tbody></table></div> : <EmptyInline message="No matching history yet. Run an analysis to see it here." />}</section>;
}

function EmptyState({ onAnalyze, title, body }) {
  return <div className="panel empty-state"><div className="empty-state-icon"><BriefcaseBusiness size={24} /></div><h2>{title}</h2><p>{body}</p><button className="button button-primary" onClick={onAnalyze}><Sparkles size={16} /> Analyze your resume</button></div>;
}

function EmptyInline({ message }) {
  return <div className="empty-inline"><FileText size={18} /><span>{message}</span></div>;
}

export default App;
