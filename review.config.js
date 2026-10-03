/* TenTrade journey review hub — review widget config.
 *
 * Comments persist to a Firebase Realtime Database so everyone reviewing sees
 * each other's feedback. Until FIREBASE_CONFIG below is filled in, comments are
 * stored in THIS browser only (localStorage) and the banner says so.
 *
 * To enable shared comments: Firebase console → create a project → Realtime
 * Database → Project settings → Your apps (Web) → SDK config → paste below.
 */
window.TTRD_REVIEW_CONFIG = {
  FIREBASE_CONFIG: {
    apiKey: "PASTE_API_KEY",
    authDomain: "PASTE_PROJECT.firebaseapp.com",
    databaseURL: "PASTE_DATABASE_URL",
    projectId: "PASTE_PROJECT_ID",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },
  REVIEW_LABELS: {
    toggleButton: "Comments",
    toggleButtonTitle: "Open comment review mode",
    bannerTitle: "Review · TenTrade client journeys",
    localOnly: "Local-only — comments are saved in this browser until shared storage is set up",
    exit: "Exit review",
    sidebarTitle: "Comments",
    empty: "No comments yet. Hover a step, an email or a line of text and click the + to add one.",
    add: "+ Comment",
    save: "Post comment",
    cancel: "Cancel",
    edit: "Edit",
    del: "Delete",
    resolve: "Resolve",
    reopen: "Reopen",
    tabOpen: "Open",
    tabResolved: "Resolved",
    resolvePrompt: "Resolution note (what was done):",
    placeholder: "Your feedback…",
    replacementPlaceholder: "Suggested change (optional)…",
    namePrompt: "Your name:"
  }
};
