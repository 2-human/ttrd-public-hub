/* TenTrade review hub: the thin config (hub-chassis 1.2.0). Identity, tokens, labels, file lists, storage prefix.
 * Navigation, text and figures are in data/ (built by tools/journey-prototype/build.py); layout is in views.js; the
 * rest of the look is in skin.css. Brand colours are set here under the governed names (accent = primary-deep …). */
window.HUB_CONFIG = {
  id: 'ttrd-review',
  title: 'TenTrade Journey Review',
  lang: 'en',
  locale: 'en-GB',
  currency: 'EUR',
  home: '/home',
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
  data: ['review.config.js?v=db22e3dc0a', 'data/ui.js?v=0ec9afe354', 'data/ui-platforms.js?v=8ddcef00ad', 'data/ui-search.js?v=f60f22b753', 'data/core.js?v=347113fc36', 'data/journeys.js?v=aa9e4287c6', 'data/people.js?v=f15fa30e60', 'data/calendar.js?v=2d74fed362', 'data/comms.js?v=b66ea0660c', 'data/comms-text.js?v=f605e71bef', 'data/questions.js?v=5f7b79c599', 'data/qa-fields.js?v=f2528a85d9', 'data/platforms.js?v=f7b6ec228c', 'data/panui-css.js?v=0e1a71e749', 'data/vault-hw26.js?v=005ebc3e74', 'data/vault-bf26.js?v=af61c32291', 'data/vault-bf26h.js?v=80214106d5', 'data/vault-ip26.js?v=6056e54c49', 'data/vault-tx26.js?v=78d950aeaa', 'data/vault-tx26x.js?v=7edaf775b2', 'data/inbox-ip26.js?v=6b968bb4a0', 'data/cjmap.js?v=d73ea14546', 'data/build.js?v=173b65ce78'],
  views: ['search.js?v=cd4f47efe8', 'panui-journey.js?v=854f838c0a', 'platforms.js?v=b22d6fdf8c', 'views.js?v=c89ab75cc8', 'vault-view.js?v=5d256a6207', 'gmail-demo.js?v=1fd1cb0bf0', 'inbox-view.js?v=55380f09b1', 'brand-view.js?v=7cdbe753b6', 'client-journey-view.js?v=ddeba7824e', 'journey-map.js?v=3be46024b6', 'feedback.js?v=658f835e26', 'share-rules.js?v=21d5b15693', 'public-view.js?v=61ce4eb8e0'],
  skin: 'skin.css?v=e195833b1e',   /* chassis 1.3.0: loaded after the chassis styles by Hub.look(), inlined by the bundler */
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
    /* the public page (view.html, view.js): the only words a visitor without an account sees besides the copy itself */
    pubLoading: 'Loading…', pubNotShared: 'This page is not shared.', pubNotSharedBody: 'The link may be old, or the page was taken down. Ask the person who sent it for a new one.',
    pubFailed: 'This page could not be loaded. Reload to try again.', pubPdf: 'Save as PDF', pubClose: 'Close',
    pubFoot: 'A read-only copy, as of {date}.',
    pubMenu: 'Pages in this link', pubCopyLink: 'Copy link to this screen', pubCopyLinkHint: 'The address of this page, with the drawer that is open', pubCopied: 'Copied',
    /* chassis module words that differ from its defaults (config labels win over module defaults) */
    apprBy: 'Recorded by', apprNote: 'Note (optional)', apprNew: 'No decision yet', cmCount: 'Comments: {n}',
    /* a notice at the top of a section's pages (notice:<section id>, noticeLabel:<section id>); the general speculative notice was removed on 10 Nov (Miloš) */
    'noticeLabel:platforms': 'Snapshot · read-only',
    'notice:platforms': 'Each platform as it was on the day it was read, shown on its pages. Nothing in the hub changes a platform; the snapshot is refreshed by reading the platform again.'
  }
};
