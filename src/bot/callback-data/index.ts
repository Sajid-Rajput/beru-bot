// ── Home / Navigation callback data ──────────────────────────────────────
export const CB_MY_PROJECTS = 'cb_my_projects'
export const CB_NEW_PROJECT = 'cb_new_project'
export const CB_QUICK_SETUP = 'cb_quick_setup'
export const CB_WALLETS = 'cb_wallets'
export const CB_REFERRALS = 'cb_referrals'
export const CB_HOME = 'cb_home'
export const CB_CANCEL_TO_HOME = 'cb_cancel_to_home'
export const CB_SHADOW_SELL = 'cb_ss'
/** Decorative keyboard buttons (section headers). Handler answers silently. */
export const CB_NOOP = 'cb_noop'

// ── New Project flow ─────────────────────────────────────────────────────
/** Prefix for confirm project callback: cb_confirm_project:{tokenMint} */
export const CB_CONFIRM_PROJECT_PREFIX = 'cb_confirm_project:'
/** Prefix for key acknowledged callback: cb_key_acknowledged:{projectId} */
export const CB_KEY_ACKNOWLEDGED_PREFIX = 'cb_key_acknowledged:'
/** Wallet choice: link an existing wallet to this project (reads mint from session) */
export const CB_PROJECT_WALLET_LINK = 'cb_pwl'
/** Wallet choice: generate a fresh wallet for this project (reads mint from session) */
export const CB_PROJECT_WALLET_GENERATE = 'cb_pwg'
/** Pick a specific wallet for the pending project: cb_pwp:{walletId} */
export const CB_PROJECT_WALLET_PICK_PREFIX = 'cb_pwp:'

// ── Project Dashboard ────────────────────────────────────────────────────
/** Prefix for selecting a project: cb_select_project:{projectId} */
export const CB_SELECT_PROJECT_PREFIX = 'cb_select_project:'
/** Prefix for refresh: cb_refresh:{projectId} */
export const CB_REFRESH_PREFIX = 'cb_refresh:'

// ── Dashboard actions (append projectId) ─────────────────────────────────
/** Start Shadow Sell: cb_start:{projectId} */
export const CB_START_PREFIX = 'cb_start:'
/** Stop Shadow Sell: cb_stop:{projectId} */
export const CB_STOP_PREFIX = 'cb_stop:'

// ── Config screen navigation (append projectId) ─────────────────────────
export const CB_CFG_MIN_SELL_PREFIX = 'cb_cfg_ms:'
export const CB_CFG_MAX_SELL_PREFIX = 'cb_cfg_xs:'
export const CB_CFG_MCAP_PREFIX = 'cb_cfg_mc:'
export const CB_CFG_MIN_BUY_PREFIX = 'cb_cfg_mb:'

// ── Config preset values (format: prefix + value + ':' + projectId) ──────
export const CB_SET_MIN_SELL_PREFIX = 'cb_sms:'
export const CB_SET_MAX_SELL_PREFIX = 'cb_sxs:'
export const CB_SET_MCAP_PREFIX = 'cb_smc:'
export const CB_SET_MIN_BUY_PREFIX = 'cb_smb:'
/** Cancel config edit and return to dashboard: cb_cfg_x:{projectId} */
export const CB_CANCEL_CONFIG_PREFIX = 'cb_cfg_x:'

// ── Whitelist (append projectId or entryId) ──────────────────────────────
/** Navigate to whitelist screen: cb_wl:{projectId} */
export const CB_WHITELIST_PREFIX = 'cb_wl:'
/** Enter add-whitelist input mode: cb_wl_add:{projectId} */
export const CB_WL_ADD_PREFIX = 'cb_wl_add:'
/** Remove whitelist entry: cb_wl_rm:{entryId} */
export const CB_WL_REMOVE_PREFIX = 'cb_wl_rm:'
/** Whitelist pagination: cb_wl_pg:{page}:{projectId} */
export const CB_WL_PAGE_PREFIX = 'cb_wl_pg:'

// ── Delete project (append projectId) ────────────────────────────────────
export const CB_DELETE_PREFIX = 'cb_delete:'
export const CB_CONFIRM_DELETE_PREFIX = 'cb_del_y:'
export const CB_CANCEL_DELETE_PREFIX = 'cb_del_n:'

// ── Navigation back to dashboard (append projectId) ─────────────────────
export const CB_BACK_DASH_PREFIX = 'cb_bd:'

// ── Referrals / Payout ──────────────────────────────────────────────────
export const CB_SET_PAYOUT_WALLET = 'cb_set_pw'
