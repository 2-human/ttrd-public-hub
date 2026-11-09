/* TenTrade review hub: the thin config (hub-chassis 1.2.0). Identity, tokens, labels, file lists, storage prefix.
 * Navigation, text and figures are in data/ (built by tools/journey-prototype/build.py); layout is in views.js; the
 * rest of the look is in skin.css. Brand colours are set here under the governed names (accent = primary-deep …). */
window.HUB_CONFIG = {
  id: 'ttrd-review',
  title: 'TenTrade Journey Review',
  lang: 'en',
  locale: 'en-GB',
  currency: 'EUR',
  home: '/scope',
  brand: { name: 'TenTrade', sub: 'CRM & email · review hub' },
  fonts: { body: 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif' },
  tokens: {
    accent: '#c2187a',      /* primary-deep: brand magenta */
    bg: '#f5f4f8',          /* surface-base */
    soft: '#faf9fc',        /* surface-tint: table heads, hover rows */
    line: '#e3e1ea',        /* rule */
    ink: '#16141d',         /* text-default */
    mute: '#5e5b6a',        /* text-soft */
    head: '#16141d',        /* neutral-deep */
    accentSoft: '#fbe9f3'
  },
  storage: { prefix: 'ttrd-hub' },
  modules: ['approval', 'previews', 'charts', 'comments'],
  /* the one ordered file list: locally these load as files; on the mirror gate.js runs them from data/bundle.enc */
  data: ['review.config.js?v=0bccd56512', 'data/ui.js?v=4d80e78f5d', 'data/ui-platforms.js?v=65b92d39da', 'data/ui-search.js?v=f60f22b753', 'data/core.js?v=d1d7d61f17', 'data/journeys.js?v=996b4bb041', 'data/people.js?v=d241f5b6bf', 'data/calendar.js?v=01a03d4894', 'data/comms.js?v=19e8b36f66', 'data/comms-text.js?v=81cf1c929c', 'data/questions.js?v=ff093f2c39', 'data/qa-fields.js?v=f2528a85d9', 'data/platforms.js?v=55f429cbdf', 'data/panui-css.js?v=26d28c122a'],
  views: ['search.js?v=cd4f47efe8', 'panui-journey.js?v=afae622e1d', 'platforms.js?v=808f2e407b', 'views.js?v=b0514ac462', 'feedback.js?v=0e0c663a1a'],
  labels: {
    /* the sign-in gate (gate.js): the only words a signed-out visitor sees, so they live here, not in the bundle */
    gateTitle: 'TenTrade review hub',
    gatePrompt: 'Sign in with your work email. We send you a one-time link; open it in this browser and the hub opens.',
    gateEmail: 'Your work email', gateSend: 'Email me a sign-in link', gateSending: 'Sending…',
    gateSent: 'Check your inbox for a sign-in link (from Firebase; look in spam if it does not arrive) and open it in this browser.',
    gateNotListed: 'That address is not on the account list.', gateSendFailed: 'The link could not be sent. Try again.',
    gateLinkFailed: 'That sign-in link did not work. It may have expired or been used already. Ask for a new one below.',
    gateNoAccess: 'Signed in as {email}, but this account has no access to the hub. Sign out and use your work account, or ask Miloš for access.',
    gateOpenFailed: 'The hub could not be opened. Reload the page to try again.', gateUnavailable: 'The hub is not available right now.',
    gateSignOut: 'Sign out', signInConfirmEmail: 'Confirm your email address to finish signing in',
    /* chassis module words that differ from its defaults (config labels win over module defaults) */
    apprBy: 'Recorded by', apprNote: 'Note (optional)', apprNew: 'No decision yet', cmCount: 'Comments: {n}',
    /* the notice at the top of every page; a section can have its own text (notice:<section id>) */
    noticeLabel: 'Speculative · for demonstration',
    notice: 'The information and recommendations in this hub are speculative, based on what we know so far, and are shown for demonstration purposes. The final review hub will be ready once all stakeholders have provided their input and reviewed the information.',
    'noticeLabel:platforms': 'Snapshot · read-only',
    'notice:platforms': 'Each platform as it was on the day it was read, shown on its pages. Nothing in the hub changes a platform; the snapshot is refreshed by reading the platform again.',
    'notice:timeline': 'This strategy and plan are speculative, based on what we know so far, and will be adjusted as we take in more information during onboarding. The final review hub will be ready once all stakeholders have provided their input and reviewed the information.'
  }
};
