# Beru Bot — Community & Growth Strategy

## Document Metadata

| Field | Value |
|-------|-------|
| Bot | `@BeruMonarchBot` |
| Website | [berubot.com](https://berubot.com) |
| Founder X | [@SajydRajput](https://x.com/SajydRajput) |
| Version | 1.0 |
| Date | 2026-03-01 |
| Status | Pre-Launch |
| Companion Docs | `ARCHITECTURE.md` · `beru_bot_interface_and_flow.md` |

---

## Table of Contents

1. [Competitor Channel Landscape](#1-competitor-channel-landscape)
2. [Telegram Channel Architecture for Beru Bot](#2-telegram-channel-architecture-for-beru-bot)
3. [Moderation & Restrictions](#3-moderation--restrictions)
4. [Community Growth Funnels](#4-community-growth-funnels)
5. [Community Engagement Playbook](#5-community-engagement-playbook)
6. [Build-in-Public on X Strategy](#6-build-in-public-on-x-strategy)
7. [Pre-Launch Waitlist Feature](#7-pre-launch-waitlist-feature)
8. [Launch Day Playbook](#8-launch-day-playbook)
9. [Metrics & KPIs](#9-metrics--kpis)

---

## 1. Competitor Channel Landscape

Before designing Beru Bot's community, it's essential to understand how every major Solana trading bot structures their public-facing channels. The table below summarizes the current landscape as of March 2026.

### 1.1 Competitor Comparison Table

| Bot | X Followers | Telegram Channels | Discord | Key Observation |
|-----|------------|-------------------|---------|-----------------|
| **Trojan** (`@TrojanOnSolana`) | 156.7K | Support group (`t.me/trojantrading`) | Yes (`discord.gg/trojan`) | Largest X presence; uses Telegram for support and Discord for deeper community |
| **BullX** (`@bullx_io`) | 141.6K | Community group, announcements | — | Strong X brand; advanced DEX trading terminal approach |
| **BONKbot** (`@bonkbot_io`) | 78.5K | Community group | Yes (`discord.gg/qy5ukGRs5M`) | Rebranded to "TELEMETRY by BONKbot"; 387K users, 54.5M trades; uses Discord for support |
| **Maestro** (`@MaestroBots`) | 55.7K | **4 channels**: Updates (`@MaestroSniperUpdates`), Hub (`@MaestroBotsHub`), Testimonials (`@MaestroTestimonials`), Hall of Fame (`@MaestroGains`) | — | Most elaborate channel architecture; 24/7 support advertised; uses Linktree for link aggregation |
| **PepeBoost** (`@PepeBoost888`) | — | Q&A group (`@Pepeboost_Portal`) | — | 230K+ registered users; focused purely on Telegram with a single Q&A portal |

### 1.2 Key Takeaways

1. **Every serious bot has at least 2 Telegram presences** — a broadcast channel (announcements/updates) and a chat group (community/support).
2. **X/Twitter is the primary discovery channel** — all major bots maintain active X accounts with 50K–160K followers.
3. **Channel count scales with team size** — Maestro's 4 channels work because they have a dedicated team. Solo founders (like Beru Bot) should start with 2.
4. **Social proof channels are powerful** — Maestro's Testimonials and Hall of Fame channels serve as trust-builders for new users evaluating the bot.
5. **Discord is optional at MVP** — only BONKbot and Trojan use Discord, and primarily for support tickets. A Telegram group handles both roles at small scale.

### 1.3 Beru Bot's Positioning

Beru Bot starts lean. Two channels at launch, expandable to four as the community grows:

| Phase | Channels |
|-------|----------|
| **MVP (Day 1)** | Announcement channel + Community group |
| **Growth (500+ users)** | Add: Support group (separate from general chat) |
| **Scale (2,000+ users)** | Add: Testimonials/Wins channel (social proof) |

---

## 2. Telegram Channel Architecture for Beru Bot

### 2.1 Channel 1 — `@BeruBotAnnouncements` (Broadcast Channel)

**Purpose:** One-way broadcast channel for official updates, feature releases, maintenance notices, and milestone announcements. Only admins can post.

#### 2.1.1 Creation Steps

1. Open Telegram → Hamburger menu → **New Channel**
2. **Channel name:** `Beru Bot Announcements`
3. **Description:**
   ```
   Official announcements from Beru Bot — your strongest soldier on Solana.

   🔔 Feature releases & updates
   ⚡ Maintenance & status notices
   📊 Milestone announcements

   🤖 Bot: @BeruMonarchBot
   💬 Community: @BeruBotCommunity
   🌐 Website: berubot.com
   ```
4. **Channel type:** Public
5. **Public link:** `t.me/BeruBotAnnouncements`
6. **Profile picture:** Use the Beru Bot logo (same as berubot.com favicon) with a subtle "📢" overlay or a distinct border color to differentiate from the community group
7. Click **Create**

#### 2.1.2 Post-Creation Setup

1. **Pinned message** — Pin a welcome message immediately:
   ```
   Welcome to Beru Bot Announcements! 🎯

   This channel is for official updates only.
   For discussion, join @BeruBotCommunity.

   Quick links:
   • Launch bot: @BeruMonarchBot
   • Website: berubot.com
   • Builder: @SajydRajput on X
   ```
2. **Enable sign messages** — Settings → Toggle "Sign Messages" ON so each post shows "Posted by [Admin Name]" (adds authenticity)
3. **Discussion group** — Link to `@BeruBotCommunity` (see Section 2.2). This adds a "Discuss" button under every announcement post.
4. **Reactions** — Enable reactions (👍❤️🔥🎉). This is the only interaction non-admins have on the channel, and it provides engagement signal.

#### 2.1.3 Content Guidelines for Announcements

| Content Type | Frequency | Example |
|-------------|-----------|---------|
| Feature release | Per release | "Shadow Sell is LIVE! Here's what you can do..." |
| Maintenance notice | As needed | "Scheduled maintenance in 2 hours. Bot will be back in ~15 min." |
| Milestone celebration | Per milestone | "1,000 users on the waitlist! Thank you! 🎉" |
| Security advisory | Rare | "⚠️ Scam alert: Beru Bot will NEVER DM you first." |
| Community highlight | Weekly | "This week's top trader saved 2.4 SOL in MEV protection..." |
| Build-in-public update | Weekly | "Week 12 update: Implemented auto-sell triggers. Thread on X: [link]" |

**Posting rules:**
- Maximum 1 post per day (avoid notification fatigue)
- Exception: urgent maintenance or security notices
- Every post ends with a CTA (join community, try the bot, follow on X)
- No price talk, no financial advice, no promises of returns

---

### 2.2 Channel 2 — `@BeruBotCommunity` (Chat Group)

**Purpose:** Open discussion group for community chat, support questions, feature requests, alpha sharing, and general Solana trading discussion. Members can post freely (within rules).

#### 2.2.1 Creation Steps

1. Open Telegram → Hamburger menu → **New Group**
2. **Group name:** `Beru Bot Community`
3. Add yourself as the only initial member
4. **Convert to Supergroup:** Group Settings → Edit → Toggle to Supergroup (required for advanced admin features, topic threads, and public link)
5. **Public link:** `t.me/BeruBotCommunity`
6. **Description:**
   ```
   Official Beru Bot community — trade smarter on Solana.

   📌 Rules: Be respectful. No spam. No shilling.
   🤖 Bot: @BeruMonarchBot
   📢 Updates: @BeruBotAnnouncements
   🌐 Website: berubot.com
   ❓ Support: @BeruSupportBot

   ⚠️ Admins will NEVER DM you first.
   ```
7. **Profile picture:** Use the Beru Bot logo (same as the bot) — keep consistent branding across bot, channel, and group
8. **Link as discussion group** to `@BeruBotAnnouncements`:
   - Go to `@BeruBotAnnouncements` → Settings → Discussion → Select `@BeruBotCommunity`
   - This makes every announcement auto-forward to the group with a "Discuss" thread

#### 2.2.2 Topic Threads (Enable Forum Mode)

Enable **Topics** (forum mode) so conversations stay organized:

Group Settings → Edit → Toggle **Topics** ON

Create these initial topics:

| Topic | Icon | Purpose |
|-------|------|---------|
| **General** | 💬 | Default topic. Casual chat, introductions, Solana discussion |
| **Support** | ❓ | Bug reports, how-to questions, bot issues. Direct complex cases to `@BeruSupportBot` |
| **Feature Requests** | 💡 | Community-sourced feature ideas. Use polls to prioritize |
| **Alpha & Calls** | 🎯 | Token alpha, trade setups, market analysis (community-sourced, not official) |
| **Announcements Discussion** | 📢 | Auto-created when linked to the announcement channel. Discussion threads for each announcement |

**Topic rules:**
- Pin the topic rules at the top of each topic thread
- Mods regularly move off-topic messages to the correct thread
- Close topics that become stale (e.g., resolved feature requests)

#### 2.2.3 Welcome Message (Auto-Greeting)

Use Telegram's built-in group welcome or a bot like `@GroupHelpBot` to auto-greet new members:

```
Welcome to Beru Bot Community, {user_mention}! 👋

Quick start:
1️⃣ Launch the bot → @BeruMonarchBot
2️⃣ Read the rules → Pinned message
3️⃣ Subscribe to updates → @BeruBotAnnouncements

⚠️ Admins will NEVER DM you first. Report any DMs claiming to be from Beru Bot.

Feel free to introduce yourself in #General!
```

**Auto-delete setting:** Delete the welcome message after 5 minutes to keep the chat clean.

---

### 2.3 Linking Strategy Between Channels

```
┌─────────────────────────┐
│  @BeruBotAnnouncements  │ ──── Broadcast (admin-only)
│  (Channel)              │
│  Posts auto-forward ─────┼──→ Discussion thread in Community
└─────────────────────────┘
            │
            │ "Join community" CTA in every post
            ▼
┌─────────────────────────┐
│  @BeruBotCommunity      │ ──── Chat (open, moderated)
│  (Supergroup + Topics)  │
│                         │
│  Topics:                │
│  ├─ General             │
│  ├─ Support             │
│  ├─ Feature Requests    │
│  ├─ Alpha & Calls       │
│  └─ Announcements Disc. │ ←── Auto-created discussion threads
└─────────────────────────┘
            │
            │ Complex support issues → "/support" command
            ▼
┌─────────────────────────┐
│  @BeruSupportBot        │ ──── 1:1 private support
│  (Bot)                  │
└─────────────────────────┘
```

**Cross-linking rules:**
- Every announcement post ends with: `💬 Discuss → @BeruBotCommunity`
- Community group description links to: `@BeruBotAnnouncements` and `@BeruMonarchBot`
- Bot's `/community` command links to both channels
- berubot.com footer links to both channels

---

## 3. Moderation & Restrictions

A well-moderated community builds trust. In crypto, where scams are rampant, strict moderation is a feature, not a limitation.

### 3.1 Anti-Spam Configuration

#### 3.1.1 Telegram Built-in Settings

Navigate to Group Settings → Permissions:

| Permission | Setting | Reason |
|-----------|---------|--------|
| Send Messages | ✅ Allowed | Members should be able to chat |
| Send Media | ❌ Restricted (first 24h) | Prevents spam-bots from posting scam images immediately after joining |
| Send Stickers/GIFs | ❌ Restricted (first 24h) | Reduces noise and spam vectors |
| Send Polls | ❌ Restricted (admins only) | Only admins should create polls |
| Add Members | ✅ Allowed | Members can invite friends |
| Pin Messages | ❌ Restricted (admins only) | Prevents message hijacking |
| Change Group Info | ❌ Restricted (admins only) | Locked down |
| Embed Links | ❌ Restricted (first 24h) | Prevents phishing links from new accounts |

#### 3.1.2 Slow Mode

| Growth Phase | Slow Mode Delay | Reason |
|-------------|----------------|--------|
| Pre-launch (< 100 members) | Off | Encourage conversation |
| Early growth (100–500) | 15 seconds | Mild throttle to prevent spam floods |
| Active growth (500–2,000) | 30 seconds | Keeps chat readable during busy periods |
| Scale (2,000+) | 60 seconds or topic-specific | High-traffic topics get stricter slow mode; General stays relaxed |

#### 3.1.3 Anti-Spam Bot Integration

Deploy **`@GroupHelpBot`** or **`@Combot`** as a group admin with the following configuration:

| Feature | Setting |
|---------|---------|
| CAPTCHA on join | ✅ Enabled — New members must tap a button or solve a simple math problem within 60 seconds, or they are kicked |
| Anti-flood | ✅ Enabled — Kick users sending > 5 messages in 10 seconds |
| Anti-link | ✅ Enabled — Auto-delete messages containing `t.me/` links (except whitelisted: `t.me/BeruMonarchBot`, `t.me/BeruBotAnnouncements`, `t.me/BeruBotCommunity`, `t.me/BeruSupportBot`) |
| Anti-forward | ✅ Enabled — Auto-delete forwarded messages from other channels/bots (common spam vector) |
| Keyword filter | ✅ Enabled — See Section 3.4 |
| Welcome message | ✅ Enabled — See Section 2.2.3 |
| Goodbye message | ❌ Disabled — No need to announce departures |

### 3.2 Verification Gate

**Require new members to verify before they can post.** This single measure eliminates 90%+ of bot spam.

**Implementation options (pick one):**

| Option | Bot | How It Works | Recommended? |
|--------|-----|-------------|-------------|
| Button tap | `@GroupHelpBot` | New member sees "Tap here to verify you're human" → must tap within 60s or get kicked | ✅ Simplest, least friction |
| Math CAPTCHA | `@Combot` | New member must solve "What is 4 + 7?" within 60s | Moderate friction |
| Custom question | `@Shieldy` / `@ShieldsBot` | Ask a custom question: "What blockchain does Beru Bot trade on?" Answer: Solana | Higher friction but filters quality |

**Recommendation:** Start with button-tap verification (`@GroupHelpBot`). It's frictionless for real users and blocks automated spam bots.

### 3.3 Admin Roles & Permissions

Define clear admin roles with the minimum permissions necessary:

| Role | Who | Permissions | Responsibility |
|------|-----|------------|----------------|
| **Owner** | @SajydRajput | All permissions | Final authority on all decisions, channel settings, adding admins |
| **Senior Admin** | Trusted contributor (future) | Delete messages, ban users, pin messages, manage topics, invite via link | Day-to-day moderation, handle escalations |
| **Moderator** | Community volunteer (future) | Delete messages, restrict users (mute, not ban) | Clean up spam, enforce rules, redirect support questions |
| **Anti-Spam Bot** | `@GroupHelpBot` / `@Combot` | Delete messages, restrict users, ban users | Automated spam filtering, CAPTCHA verification |

**Phase-based staffing:**
- **Pre-launch to 500 members:** Owner moderates solo + anti-spam bot
- **500–2,000 members:** Add 1–2 moderators from active community members
- **2,000+ members:** Add a Senior Admin; consider paid moderation if volume demands it

### 3.4 Auto-Moderation Rules

#### 3.4.1 Keyword Blocklist

Auto-delete messages containing these patterns (case-insensitive):

| Category | Blocked Keywords/Patterns |
|----------|--------------------------|
| Scam phrases | `send SOL to`, `double your`, `guaranteed profit`, `free airdrop DM`, `validate your wallet`, `connect wallet`, `sync wallet`, `claim reward` |
| Impersonation | `I am admin`, `I'm the developer`, `official support`, `Beru team here` (when from non-admin) |
| Competing bot promotion | `use [BotName]bot`, `switch to`, `better bot at` (aggressive shilling — casual mentions are fine) |
| Wallet solicitation | Messages matching `^[1-9A-HJ-NP-Za-km-z]{32,44}$` (bare Solana addresses without context — prevents "send me SOL" scams) |
| Phishing links | Domains matching common phishing patterns: `dexscreener-[a-z]+\.`, `solanа\.` (Cyrillic "а"), `berubot-[a-z]+\.` |

#### 3.4.2 Action Escalation

| Offense | Action | Duration |
|---------|--------|----------|
| First violation (keyword/spam) | Auto-delete message + warning | — |
| Second violation within 24h | Mute user | 1 hour |
| Third violation within 24h | Mute user | 24 hours |
| Scam/phishing link | Immediate ban | Permanent |
| Impersonating admin | Immediate ban | Permanent |
| NSFW content | Immediate ban | Permanent |

### 3.5 Community Rules (Pinned Message)

Pin this as the first message in the community group and in each topic thread:

```
📜 Beru Bot Community Rules

1. Be respectful. No harassment, hate speech, or personal attacks.
2. No spam or self-promotion. One warning, then mute.
3. No shilling other tokens or bots unsolicited.
4. No posting wallet addresses asking for funds.
5. No DM solicitation. Never DM someone offering "help" or "support."
6. No financial advice. Nothing here is investment advice.
7. No NSFW content.
8. Use the right topic thread for your message.
9. English only. (Or specify your supported languages.)
10. Report scams immediately using the "Report" button.

⚠️ SCAM ALERT: Beru Bot admins will NEVER:
   • DM you first
   • Ask for your private keys or seed phrase
   • Ask you to "validate" or "sync" your wallet
   • Send you to any website other than berubot.com

Violations = mute → ban. Zero tolerance for scams.
```

### 3.6 Invite Link Management

Create **separate invite links** for each traffic source to track where members come from:

| Source | Invite Link | Tracking Purpose |
|--------|------------|-----------------|
| X/Twitter bio | `t.me/BeruBotCommunity?start=x` (or create named link) | Track X → Community conversion |
| berubot.com | Custom invite link labeled "website" | Track website → Community conversion |
| Bot `/community` command | Custom invite link labeled "bot" | Track bot → Community conversion |
| Cross-promotion | Custom invite link labeled "collab-[partner]" | Track partnership conversions |
| General/public | Default `t.me/BeruBotCommunity` link | Organic/untracked |

**How to create trackable links:**
1. Go to Group Settings → Invite Links → Create New Link
2. Name each link (e.g., "From X Bio")
3. Optionally set member limits or expiry dates
4. Check Group Settings → Invite Links → Statistics to see join counts per link

---

## 4. Community Growth Funnels

Growing the community requires a deliberate funnel from every touchpoint where potential users encounter Beru Bot.

### 4.1 Growth Funnel Diagram

```
                    ┌──────────────────┐
                    │  Discovery Layer  │
                    └────────┬─────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────▼─────┐      ┌─────▼──────┐      ┌─────▼──────┐
    │  X/Twitter│      │  berubot.com│      │  Telegram  │
    │  @SajydRaj│      │  Website    │      │  Organic   │
    │  put      │      │             │      │  Search    │
    └────┬─────┘      └──────┬──────┘      └─────┬──────┘
         │                   │                   │
         ▼                   ▼                   ▼
    ┌─────────────────────────────────────────────────┐
    │              Capture Layer                       │
    │  ┌──────────┐  ┌──────────────┐  ┌───────────┐ │
    │  │ Follow on │  │ Visit        │  │ Start bot │ │
    │  │ X         │  │ berubot.com  │  │ /start    │ │
    │  └─────┬────┘  └──────┬───────┘  └─────┬─────┘ │
    └────────┼───────────────┼───────────────┼────────┘
             │               │               │
             ▼               ▼               ▼
    ┌─────────────────────────────────────────────────┐
    │              Conversion Layer                    │
    │  ┌──────────┐  ┌──────────────┐  ┌───────────┐ │
    │  │ CTA in   │  │ "Join        │  │ Waitlist + │ │
    │  │ bio/tweet │  │ Community"   │  │ /community│ │
    │  │ → TG link│  │ button       │  │ command   │ │
    │  └─────┬────┘  └──────┬───────┘  └─────┬─────┘ │
    └────────┼───────────────┼───────────────┼────────┘
             │               │               │
             └───────────────┼───────────────┘
                             ▼
    ┌─────────────────────────────────────────────────┐
    │           Community Layer                        │
    │                                                  │
    │  @BeruBotAnnouncements ←→ @BeruBotCommunity     │
    │                                                  │
    │  Engagement → Trust → Waitlist → Launch → User  │
    └─────────────────────────────────────────────────┘
```

### 4.2 Funnel: X/Twitter → Community

**Bio optimization for `@SajydRajput`:**
```
Building @BeruMonarchBot — your strongest soldier on Solana 🤖
Building in public 🔨 | Founder of berubot.com
👉 Join the community: t.me/BeruBotCommunity
```

**Tactics:**

| Tactic | How | Frequency |
|--------|-----|-----------|
| Bio link | Include `t.me/BeruBotCommunity` in X bio | Permanent |
| Pinned tweet | Pin a tweet that introduces Beru Bot + links to community + waitlist | Update monthly |
| Thread CTAs | End every build-in-public thread with: "Join the community for early access: t.me/BeruBotCommunity" | Every thread |
| Reply engagement | When people ask about Solana trading bots, mention Beru Bot + community link (only when relevant, never spam) | Organic |
| Milestone tweets | "We hit 500 in the community! Join us:" + link | Per milestone |
| Giveaways | "Follow + join community + RT = chance to win early access / fee-free trading period" | Monthly |

### 4.3 Funnel: berubot.com → Community

**Current state:** berubot.com has a "Launch Beru Bot →" CTA linking to `@BeruMonarchBot`. Community links are not yet present.

**Recommended additions:**

1. **Navigation bar:** Add a "Community" link that opens `t.me/BeruBotCommunity`
2. **Footer section:** Add social links:
   ```
   Community
   • Telegram Channel: @BeruBotAnnouncements
   • Telegram Community: @BeruBotCommunity
   • X/Twitter: @SajydRajput
   ```
3. **Floating CTA banner** (above the fold or sticky):
   ```
   🚀 Join 1,247 others on the waitlist → [Join Community]
   ```
4. **After "How You'll Command the Shadows" section:** Add a community section:
   ```
   Join the Ranks
   Connect with fellow traders, get early access, and shape the features.
   [Join Telegram Community →]
   ```

### 4.4 Funnel: Bot → Community

Add community links directly into the bot experience at key touchpoints:

| Bot Touchpoint | Implementation | Reference |
|---------------|----------------|-----------|
| `/start` response | After the welcome message, show an inline button: `[📢 Join Community]` linking to `t.me/BeruBotCommunity` | `beru_bot_interface_and_flow.md` → `SCR_HOME` |
| `/community` command | New command that responds with links to both channels: "📢 Announcements: @BeruBotAnnouncements\n💬 Community: @BeruBotCommunity" | Add to `ARCHITECTURE.md` → Section 6.2 |
| Waitlist confirmation | After user joins waitlist: "While you wait, join our community for updates and alpha: @BeruBotCommunity" | Section 7 of this document |
| Post-trade summary | After a successful sell: "Like Beru Bot? Tell us in the community: @BeruBotCommunity" | Low-frequency, non-intrusive |
| Error messages | Complex errors: "Need help? Ask in our community or contact @BeruSupportBot" | Helpful redirect |

### 4.5 Cross-Promotion Playbook

| Strategy | Details |
|----------|---------|
| **Announcement → Community** | Every announcement post ends with: `💬 Discuss this → @BeruBotCommunity` |
| **Community → Announcements** | Pinned message + description links to `@BeruBotAnnouncements`. Moderator periodically reminds: "Subscribe to @BeruBotAnnouncements so you never miss an update!" |
| **Community → Bot** | Pinned getting-started guide includes `@BeruMonarchBot` link. Moderator helps users with `/start` flow |
| **Community → Website** | Reference berubot.com for feature overviews: "Check out the full feature roadmap at berubot.com" |
| **Referral program amplifier** | Top referrers (from bot's referral system) get announced in community: "🏆 This week's top referrer: @username with 23 referrals!" — incentivizes sharing |

### 4.6 Referral-Powered Growth

Leverage the existing referral system from `ARCHITECTURE.md` (referral link format: `https://t.me/BeruMonarchBot?start=ref_{telegramId}`):

| Referral Tier | Reward | Incentive |
|--------------|--------|-----------|
| 5 referrals | "Beru Supporter" role in community | Social recognition |
| 15 referrals | "Shadow Elite" role + early feature access | Exclusivity |
| 50 referrals | "Monarch" role + reduced fees for 30 days | Financial + status |

**How to implement community roles:**
1. Track referral counts in the bot's database (already exists in `ARCHITECTURE.md` → Section 5)
2. When a user hits a tier threshold, bot auto-posts in `@BeruBotCommunity`: "🎉 @username just reached Shadow Elite status with 15 referrals!"
3. Admin manually assigns the Telegram custom title (Group Settings → Members → Set Custom Title)
4. Future automation: build a bot command `/checkrank` that shows referral count and current tier

---

## 5. Community Engagement Playbook

A community that doesn't engage dies. This section defines a repeatable engagement cadence.

### 5.1 Content Calendar

#### 5.1.1 Weekly Schedule (Community Group)

| Day | Content Type | Example | Topic Thread |
|-----|-------------|---------|-------------|
| **Monday** | Weekly Goals | "This week: implementing auto-sell triggers. What features are you most excited about?" | General |
| **Tuesday** | Technical Deep-Dive | "Here's how Shadow Sell's MEV protection works: [screenshot/diagram]" | General |
| **Wednesday** | Community Poll | "Which feature should we build next? 🔘 Limit Orders 🔘 DCA 🔘 Portfolio Tracker" | Feature Requests |
| **Thursday** | Alpha / Market Discussion | "What tokens are you watching this week?" (community-sourced, not financial advice) | Alpha & Calls |
| **Friday** | Build-in-Public Update | "Week N recap: what we shipped, what we learned, what's next. Full thread on X: [link]" | General |
| **Weekend** | Casual / Fun | Meme contest, "Show your PnL" (voluntary), community challenges | General |

#### 5.1.2 Weekly Schedule (Announcement Channel)

| Day | Content Type |
|-----|-------------|
| **Tuesday** | Feature preview or development screenshot |
| **Friday** | Weekly progress update (mirrors X thread, formatted for Telegram) |
| **As needed** | Maintenance notices, security alerts, milestone celebrations |

### 5.2 Engagement Formats

#### 5.2.1 Polls (Announcement Channel)

Use Telegram's built-in poll feature in the announcement channel for high-visibility decisions:

**Examples:**
- "What should we prioritize next?" → Multiple choice with features
- "Preferred default slippage setting?" → 0.5% / 1% / 2% / Custom
- "When do you trade most?" → Morning / Afternoon / Evening / 24-7

**Rules:**
- Maximum 1 poll per week in the announcement channel
- Share poll results in the community group for discussion
- Actually act on the results — nothing kills engagement faster than ignored polls

#### 5.2.2 AMA Sessions (Community Group)

Host live Q&A sessions in the community group:

| Detail | Setting |
|--------|---------|
| Frequency | Biweekly (every 2 weeks), moving to weekly post-launch |
| Duration | 30–60 minutes |
| Format | Topic thread: "AMA - [Date]". Founder posts an opening message, community asks questions in replies, founder responds in real-time |
| Announcement | Announce 24h in advance on both channels + X |
| Follow-up | Summarize top Q&As in a pinned message within the AMA topic |

**First AMA topic examples:**
- "Why I'm building Beru Bot"
- "How Shadow Sell's MEV protection actually works"
- "The tech stack behind Beru Bot"
- "Roadmap preview — what's coming after MVP"

#### 5.2.3 Community Challenges

Run periodic challenges to boost engagement:

| Challenge | Duration | Reward |
|-----------|----------|--------|
| **Meme contest** | 1 week | Winner gets "Meme Lord" custom title + shared on announcement channel |
| **Bug hunter** | Ongoing | Users who report valid bugs get "Bug Hunter" role |
| **Beta tester** | Pre-launch | First 50 waitlist members get exclusive beta access + "OG Tester" role |
| **Top referrer (weekly)** | Weekly | Announcement shoutout + route to referral tier rewards |
| **Best trade screenshot** | Post-launch, weekly | Featured in announcement channel as "Trade of the Week" |

### 5.3 Feedback Loops

Structured mechanisms to turn community input into product improvements:

| Mechanism | How | Frequency |
|-----------|-----|-----------|
| **Feature request thread** | Dedicated topic in community. Users post ideas, others react with 👍. Most-upvoted ideas get reviewed monthly | Ongoing |
| **Monthly roadmap poll** | "Here are the top 5 community-requested features. Vote for which we build first." | Monthly |
| **Public changelog** | Post in announcement channel when a community-requested feature ships: "You asked for it, we built it: [Feature] is now live! Thanks to @username for the suggestion." | Per release |
| **Beta testing program** | Select active community members as beta testers. They get early access to features in a separate test bot (`@BeruBotBeta`) and provide structured feedback | Per feature |
| **Bug reporting** | Template in Support topic: "1. What happened? 2. What did you expect? 3. Steps to reproduce. 4. Screenshot/error message" | Ongoing |

### 5.4 Community Roles & Recognition

Creating status within the community drives long-term engagement:

| Role | How to Earn | Custom Title | Perks |
|------|------------|-------------|-------|
| **OG Member** | Among first 100 community members | `OG 🏴` | Early access to all features, name in credits |
| **Beta Tester** | Accepted into beta testing program | `Beta Tester 🧪` | Early feature access, direct feature request priority |
| **Bug Hunter** | Report a confirmed bug | `Bug Hunter 🐛` | Acknowledgment in changelog |
| **Top Referrer** | Highest referral count (weekly/monthly) | `Top Referrer 🏆` | Fee discount + announcement shoutout |
| **Shadow Elite** | 15+ referrals (see Section 4.6) | `Shadow Elite ⚡` | Early feature access + reduced fees |
| **Monarch** | 50+ referrals | `Monarch 👑` | Reduced fees for 30 days + direct line to founder |
| **Community Mod** | Invited by owner for consistent, helpful engagement | `Moderator 🛡️` | Moderation permissions |

### 5.5 Handling Negative Sentiment

Crypto communities face unique negativity around market conditions, delays, and bugs. Handle it proactively:

| Situation | Response Template | Escalation |
|-----------|------------------|------------|
| **Bug complaint** | "Thanks for reporting this. Can you share more details in the #Support topic? We'll look into it today." | Track in internal bug list. Follow up within 24h. |
| **"When launch?"** | "We're building carefully to get it right. Follow @SajydRajput on X for real-time build progress. Current ETA: [realistic date]." | Update pinned roadmap message when dates change. |
| **Market anger** | "We're builders, not traders — market conditions are tough but Beru Bot's tech keeps improving. Focus on what you can control: your trading strategy." | Do not engage in price/market arguments. |
| **Competitor comparison** | "Every bot has strengths. Beru Bot focuses on [specific differentiator — Shadow Sell MEV protection, transparency, etc.]. Try it and see what works best for you." | Never trash competitors. |
| **Scam accusation** | "We take this seriously. Here's our transparency report: [link to berubot.com commitment section]. If you have a specific concern, DM @BeruSupportBot." | Immediate, professional response. Never ignore. |

**Golden rules for negative sentiment:**
1. Respond within 2 hours during waking hours
2. Never argue — acknowledge, redirect, solve
3. Take detailed complaints to DM/support — don't let the group become a complaint board
4. Be transparent about issues — "Yes, we had a bug. Here's what happened and how we fixed it."
5. Ban only for rule violations, never for criticism

---

## 6. Build-in-Public on X Strategy

Building in public on X/Twitter is one of the most powerful growth strategies for indie founders. It builds trust, attracts early adopters, creates organic reach, and generates community before launch.

### 6.1 Account Strategy

| Account | Handle | Purpose | Content |
|---------|--------|---------|---------|
| **Founder (primary)** | `@SajydRajput` | Build-in-public, personal brand, thought leadership | Progress updates, decisions, challenges, metrics, behind-the-scenes |
| **Product (secondary)** | `@BeruMonarchBot` / a dedicated X handle if created | Product updates, feature announcements | Formal announcements, feature demos, launch news |

**Why founder account is primary:** People connect with people, not products. Build-in-public works because audiences follow the *journey* of a builder. `@SajydRajput` should be the voice; `@BeruMonarchBot` can amplify (retweet, quote-tweet).

### 6.2 Content Pillars

Every tweet or thread should map to one of these 6 pillars:

| # | Pillar | Description | Example Tweet |
|---|--------|-------------|---------------|
| 1 | **Progress Updates** | What was built today/this week. Screenshots, code diffs, before/after | "Week 12 of building @BeruMonarchBot: Implemented the sell pipeline. 10 steps from trigger to confirmed transaction. Here's the full flow 🧵" |
| 2 | **Architecture Decisions** | Why a technology/approach was chosen. Technical credibility | "Why I chose Grammy.js over Telegraf for Beru Bot, and why it matters for your trades 🧵" |
| 3 | **Metrics & Milestones** | Real numbers. Waitlist size, community growth, test results | "500 people on the Beru Bot waitlist. 0 lines of marketing code. 100% organic. Here's how 🧵" |
| 4 | **Behind the Scenes** | Raw, unpolished. Terminal screenshots, late-night commits, whiteboard photos | "3AM debugging a race condition in the sell queue. Found it. Here's what went wrong:" |
| 5 | **Challenges & Failures** | What went wrong. How it was fixed. Vulnerability builds trust | "I almost shipped a bug that could have cost users SOL. Here's the story and the fix:" |
| 6 | **Community & Social Proof** | Testimonials, community milestones, user feedback | "Someone in the Beru Bot community just found a bug that would have taken me days. This is why community matters:" |

### 6.3 Posting Cadence

| Content Type | Frequency | Best Time (Crypto Twitter) |
|-------------|-----------|---------------------------|
| **Weekly thread** (deep dive) | 1× per week (Friday) | 12:00–14:00 UTC |
| **Standalone tweets** | 3–5× per week | 08:00–10:00 UTC or 16:00–18:00 UTC |
| **Quote tweets / engagement** | Daily | Spread throughout the day |
| **Replies to other builders** | Daily (5–10 replies) | When you see relevant conversations |
| **Spaces participation** | 1–2× per month | Join Solana ecosystem / Web3 builder spaces |

### 6.4 Hashtag Strategy

Use these hashtags selectively (1–3 per tweet, not all at once):

| Hashtag | When to Use | Reach |
|---------|-------------|-------|
| `#BuildInPublic` | Every progress update / thread | Large indie builder audience |
| `#Solana` | Technical posts about Solana integration | Solana ecosystem audience |
| `#Web3` | Broader crypto/blockchain content | General crypto audience |
| `#TradingBot` | Feature previews, bot-specific content | Traders looking for tools |
| `#IndieHacker` | Business/growth updates | Entrepreneurial audience |
| `#Crypto` | Market-adjacent content | Broad crypto audience |

**Hashtag rules:**
- Never use more than 3 hashtags per tweet
- Place hashtags at the end of the tweet, not inline
- `#BuildInPublic` is the primary — use it on 80% of posts
- Rotate secondary hashtags based on content type

### 6.5 Threading Strategy

**Threads are the highest-engagement content type on X.** Every Friday, publish a weekly update thread.

**Thread template: Weekly Update**

```
Tweet 1 (Hook):
Week [N] of building @BeruMonarchBot — your strongest soldier on Solana

This week:
✅ [Achievement 1]
✅ [Achievement 2]
🔧 [Challenge/Learning]

🧵👇

---

Tweet 2–4 (Details):
[Expand on each achievement with screenshots, code snippets, or diagrams]

[Include a behind-the-scenes photo or terminal screenshot]

---

Tweet 5 (Metrics — if applicable):
Numbers this week:
• Waitlist: [X] → [Y] (+Z%)
• Community: [X] members
• Lines of code: [X]
• Commits: [X]

---

Tweet 6 (What's Next):
Next week:
🎯 [Goal 1]
🎯 [Goal 2]
🎯 [Goal 3]

---

Tweet 7 (CTA):
Want early access?
→ Join the waitlist: t.me/BeruMonarchBot
→ Join the community: t.me/BeruBotCommunity
→ Website: berubot.com

Follow me @SajydRajput for daily updates.

#BuildInPublic #Solana
```

### 6.6 Content Templates

**Template 1: Feature Preview**
```
Just built [feature name] for @BeruMonarchBot 🔥

What it does:
• [Benefit 1]
• [Benefit 2]
• [Benefit 3]

Here's what it looks like ↓
[Screenshot]

#BuildInPublic #Solana
```

**Template 2: Technical Decision**
```
Why I chose [Technology A] over [Technology B] for @BeruMonarchBot:

1. [Reason 1]
2. [Reason 2]
3. [Reason 3]

The trade-off: [honest downside]

Would you have made the same choice?

#BuildInPublic
```

**Template 3: Milestone**
```
🎯 Milestone: [Achievement]

[X days] building @BeruMonarchBot
[Y] people on the waitlist
[Z] community members

I didn't spend $1 on marketing.

Here's what's working ↓
[Thread or brief explanation]

#BuildInPublic #Solana
```

**Template 4: Challenge/Failure**
```
I almost broke @BeruMonarchBot today.

What happened:
[Brief description of the problem]

How I found it:
[How you discovered the issue]

The fix:
[What you did to solve it]

Lesson: [Takeaway]

#BuildInPublic
```

**Template 5: Community Shoutout**
```
This is why I build in public ↓

[Screenshot of community feedback / bug report / feature suggestion]

@[username] caught something I missed.

If you're building solo, build with a community.

Join ours: t.me/BeruBotCommunity

#BuildInPublic
```

**Template 6: Founder's Commitment Style (matches berubot.com)**
```
Your keys. Your rules. 🔑

@BeruMonarchBot is non-custodial.

Your private key is encrypted with AES-256-GCM + envelope encryption and NEVER leaves your device unencrypted.

We don't custody your funds. We don't have access. Period.

berubot.com

#Solana #BuildInPublic
```

### 6.7 Engagement Tactics

| Tactic | How | Why |
|--------|-----|-----|
| **Reply to other #BuildInPublic creators** | Spend 15 min/day engaging authentically with other builders' posts | Builds reciprocal relationships; their audience discovers you |
| **Engage with Solana ecosystem accounts** | Reply to `@solaboratory`, `@SolanaFndn`, `@heaboratory`, Solana project announcements | Positions Beru Bot within the Solana ecosystem |
| **Quote-tweet competitor news** | When a competitor launches a feature, provide thoughtful commentary (never negative) | Shows awareness of the space without being combative |
| **Participate in Twitter/X Spaces** | Join crypto trading or Web3 builder Spaces as a listener or speaker | Audio presence builds deeper connection |
| **Respond to every reply** | Reply to everyone who comments on your posts (at least in the first 1,000 followers) | Algorithm rewards reply engagement; builds loyal followers |
| **Pin a thread, not a single tweet** | Pin your best build-in-public thread that tells the full Beru Bot story | New profile visitors get the full picture |

### 6.8 X Content ↔ Community Synergy

Every piece of X content should feed the community, and vice versa:

```
X Post (Weekly Thread)
    │
    ├─→ Shared in @BeruBotCommunity (with "Full thread on X: [link]")
    │
    ├─→ Key takeaway posted in @BeruBotAnnouncements
    │
    └─→ Community discussion topics generated from thread comments

Community Discussion
    │
    ├─→ Screenshots of great community feedback → X post (Template 5)
    │
    ├─→ Community poll results → X post ("Our community voted...")
    │
    └─→ Bug reports / feature requests → X post (Template 4 / Template 1)
```

---

## 7. Pre-Launch Waitlist Feature

### 7.1 Recommendation

**YES — implement a waitlist.** Here's why:

| Benefit | Details |
|---------|---------|
| **Builds anticipation** | Limited access creates urgency and FOMO |
| **Collects user base pre-launch** | You'll have a ready audience on day 1 — no cold start problem |
| **Referral virality** | Waitlist position incentivized by referrals creates organic growth |
| **No email needed** | Telegram users are identified by `telegram_id` — zero friction signup |
| **Community funnel** | Every waitlist signup is a CTA opportunity for the community channels |
| **Metrics for build-in-public** | "500 waitlist signups" is a powerful social proof data point for X posts |

### 7.2 User Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    WAITLIST USER FLOW                         │
└──────────────────────────────────────────────────────────────┘

Step 1: Discovery
────────────────
User finds Beru Bot via:
  • berubot.com → "Launch Beru Bot →" button
  • X/Twitter → link in bio or thread
  • Community group → pinned message link
  • Referral link → t.me/BeruMonarchBot?start=wl_{referrerId}
        │
        ▼
Step 2: Bot Start
────────────────
User opens @BeruMonarchBot on Telegram
User sends /start (or arrives via deep link)
        │
        ▼
Step 3: Welcome Screen
─────────────────────
┌─────────────────────────────────────────────┐
│                                             │
│  ⚔️ Beru Bot                               │
│  Your Strongest Soldier on Solana           │
│                                             │
│  Shadow Sell, Volume Generation,            │
│  Limit Orders, and more — coming soon.      │
│                                             │
│  Be among the first to command the shadows. │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  🎯 Join the Waitlist               │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  📢 Announcements                   │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  💬 Community                       │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  🌐 Website                         │    │
│  └─────────────────────────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘
        │
        │ User taps "Join the Waitlist"
        ▼
Step 4: Waitlist Confirmation
────────────────────────────
┌─────────────────────────────────────────────┐
│                                             │
│  ✅ You're on the waitlist!                 │
│                                             │
│  Your position: #847                        │
│                                             │
│  Want to move up? Share your referral link: │
│                                             │
│  t.me/BeruMonarchBot?start=wl_123456789    │
│                                             │
│  Each friend who joins moves you up 1 spot. │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  📋 Copy Referral Link              │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  📊 Check My Position               │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  📢 Join Announcements              │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  💬 Join Community                  │    │
│  └─────────────────────────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘
        │
        │ User shares referral link
        ▼
Step 5: Referral Flow
─────────────────────
When referred user joins via wl_{referrerId}:
  1. New user enters waitlist (new position at end)
  2. Referrer's referral_count increments by 1
  3. Referrer's position moves up by 1
  4. Referrer gets notification: "🎉 Someone joined via your link!
     Your new position: #846 (was #847)"
  5. If referrer hits tier threshold (5/15/50), notify about
     community role unlock
        │
        ▼
Step 6: Status Check
────────────────────
User taps "Check My Position":
┌─────────────────────────────────────────────┐
│                                             │
│  📊 Your Waitlist Status                    │
│                                             │
│  Position: #203                             │
│  Joined: Feb 15, 2026                       │
│  Referrals: 7                               │
│  Moved up: 7 spots                          │
│                                             │
│  Your referral link:                        │
│  t.me/BeruMonarchBot?start=wl_123456789    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  📋 Copy Referral Link              │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  🔙 Back                            │    │
│  └─────────────────────────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘
        │
        ▼
Step 7: Launch Notification (MVP Release Day)
──────────────────────────────────────────────
Bot sends notification to all waitlist members (batched via BullMQ):

┌─────────────────────────────────────────────┐
│                                             │
│  ⚔️ The Monarch has awakened.              │
│                                             │
│  Beru Bot is LIVE! 🚀                      │
│                                             │
│  Shadow Sell is ready. Your strongest       │
│  soldier on Solana awaits your command.     │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  ⚡ Start Trading                   │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  📖 Getting Started Guide           │    │
│  └─────────────────────────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘
```

### 7.3 Referral Link Routing

The bot's `/start` command handler must parse the deep link parameter to distinguish between traffic sources:

| Deep Link Parameter | Source | Action |
|--------------------|--------|--------|
| `?start=website` | berubot.com "Launch Bot" button | Show waitlist welcome (no referrer) |
| `?start=wl_{telegramId}` | Referral from existing waitlist member | Show waitlist welcome + credit referrer |
| `?start=ref_{telegramId}` | Standard referral (post-launch) | Normal referral flow (`ARCHITECTURE.md` → Section 5) |
| `?start=community` | Community group link | Show waitlist welcome (no referrer) |
| (no parameter) | Organic Telegram search | Show waitlist welcome (no referrer) |

**Implementation note:** During the pre-launch period, ALL `/start` interactions route to the waitlist flow. Post-launch, the `/start` command routes to the normal onboarding flow, and waitlist-specific logic is disabled.

### 7.4 Database Schema

Add this table to the data architecture (`ARCHITECTURE.md` → Section 5):

```sql
-- Waitlist Entries Table
-- Purpose: Track pre-launch signups and referral positions
-- Lifecycle: Active during pre-launch. Archived (not deleted) after launch.

CREATE TABLE waitlist_entries (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id     BIGINT      NOT NULL UNIQUE,
    username        TEXT,                           -- Telegram username (nullable, not all users have one)
    first_name      TEXT,                           -- Telegram first name
    position        INTEGER     NOT NULL,            -- Current waitlist position (1 = first in line)
    referred_by     BIGINT      REFERENCES waitlist_entries(telegram_id),  -- Who referred this user
    referral_count  INTEGER     NOT NULL DEFAULT 0,  -- How many users this person referred
    source          TEXT        NOT NULL DEFAULT 'organic',  -- 'website', 'referral', 'community', 'organic'
    status          TEXT        NOT NULL DEFAULT 'waiting'
                    CHECK (status IN ('waiting', 'notified', 'activated')),
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notified_at     TIMESTAMPTZ,                    -- When launch notification was sent
    activated_at    TIMESTAMPTZ,                    -- When user completed post-launch onboarding
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_waitlist_position ON waitlist_entries(position);
CREATE INDEX idx_waitlist_referred_by ON waitlist_entries(referred_by);
CREATE INDEX idx_waitlist_status ON waitlist_entries(status);
CREATE INDEX idx_waitlist_source ON waitlist_entries(source);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_waitlist_updated_at
    BEFORE UPDATE ON waitlist_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

**Drizzle ORM schema (TypeScript):**

```typescript
import { bigint, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const waitlistEntries = pgTable('waitlist_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull().unique(),
  username: text('username'),
  firstName: text('first_name'),
  position: integer('position').notNull(),
  referredBy: bigint('referred_by', { mode: 'number' }).references(() => waitlistEntries.telegramId),
  referralCount: integer('referral_count').notNull().default(0),
  source: text('source').notNull().default('organic'),
  status: text('status').notNull().default('waiting'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

### 7.5 Position Calculation Logic

```typescript
/**
 * Join the waitlist and calculate position.
 *
 * New users always start at the END of the queue.
 * Position improves by 1 for each successful referral.
 * Position can never go below 1.
 */
async function joinWaitlist(
  telegramId: number,
  username: string | null,
  firstName: string | null,
  source: string,
  referredByTelegramId?: number
): Promise<{ position: number, referralLink: string }> {
  return await db.transaction(async (tx) => {
    // Check if already on waitlist
    const existing = await tx.query.waitlistEntries.findFirst({
      where: eq(waitlistEntries.telegramId, telegramId),
    })

    if (existing) {
      return {
        position: existing.position,
        referralLink: `https://t.me/BeruMonarchBot?start=wl_${telegramId}`,
      }
    }

    // Get current max position
    const maxResult = await tx
      .select({ max: sql<number>`COALESCE(MAX(position), 0)` })
      .from(waitlistEntries)
    const newPosition = maxResult[0].max + 1

    // Insert new entry
    await tx.insert(waitlistEntries).values({
      telegramId,
      username,
      firstName,
      position: newPosition,
      referredBy: referredByTelegramId ?? null,
      source,
    })

    // Credit referrer
    if (referredByTelegramId) {
      await tx
        .update(waitlistEntries)
        .set({
          referralCount: sql`referral_count + 1`,
          position: sql`GREATEST(position - 1, 1)`,
          updatedAt: new Date(),
        })
        .where(eq(waitlistEntries.telegramId, referredByTelegramId))
    }

    return {
      position: newPosition,
      referralLink: `https://t.me/BeruMonarchBot?start=wl_${telegramId}`,
    }
  })
}
```

### 7.6 Launch Notification System

When MVP is ready to launch, notify all waitlist members using BullMQ (already in the architecture → `notification-queue`):

```typescript
/**
 * Batch-notify all waitlist members.
 *
 * Uses BullMQ notification-queue to avoid Telegram rate limits.
 * Telegram allows ~30 messages/second to different users.
 * Batch size: 25 per second with 1-second delay between batches.
 */
async function notifyWaitlistMembers(): Promise<void> {
  const waitingMembers = await db.query.waitlistEntries.findMany({
    where: eq(waitlistEntries.status, 'waiting'),
    orderBy: asc(waitlistEntries.position),
  })

  const BATCH_SIZE = 25

  for (let i = 0; i < waitingMembers.length; i += BATCH_SIZE) {
    const batch = waitingMembers.slice(i, i + BATCH_SIZE)

    // Add each notification as a job in the notification queue
    const jobs = batch.map(member => ({
      name: 'waitlist-launch-notify',
      data: {
        telegramId: member.telegramId,
        type: 'launch_notification',
      },
      opts: {
        delay: Math.floor(i / BATCH_SIZE) * 1000, // 1 second between batches
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    }))

    await notificationQueue.addBulk(jobs)
  }

  // Mark all as notified
  await db
    .update(waitlistEntries)
    .set({ status: 'notified', notifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(waitlistEntries.status, 'waiting'))
}
```

### 7.7 Milestone Auto-Posting

Automatically post waitlist milestones to the announcement channel:

| Milestone | Message |
|-----------|---------|
| 100 signups | "🎯 100 soldiers have enlisted! The shadows grow stronger. Join the waitlist: @BeruMonarchBot" |
| 250 signups | "⚡ 250 soldiers and counting! Beru Bot's army grows. Are you in? @BeruMonarchBot" |
| 500 signups | "🔥 500 waitlist signups — halfway to our launch target! @BeruMonarchBot" |
| 1,000 signups | "👑 1,000 soldiers ready for battle. The Monarch rises soon. @BeruMonarchBot" |
| 2,500 signups | "⚔️ 2,500 and the shadows deepen. Launch is imminent. @BeruMonarchBot" |
| 5,000 signups | "🏰 5,000 soldiers. The legion is assembled. Prepare for launch. @BeruMonarchBot" |

### 7.8 Website Integration

Add a waitlist counter widget to berubot.com:

**Placement:** Above the fold, near the hero section, or as a floating banner.

**Design:**
```
┌──────────────────────────────────────────────────┐
│  🎯 1,247 soldiers have enlisted.                │
│  Join the waitlist → [Launch Bot]                │
└──────────────────────────────────────────────────┘
```

**Implementation:**
1. Create an API endpoint that returns the current waitlist count: `GET /api/waitlist/count → { count: 1247 }`
2. Fetch this from the berubot.com frontend (Next.js) and display it dynamically
3. Cache the count in Redis with 5-minute TTL to avoid database hits on every page load
4. The endpoint should be rate-limited to prevent abuse

**API endpoint spec:**

```typescript
// GET /api/waitlist/count
// Response: { count: number, lastUpdated: string }

export async function GET(req: Request) {
  // Check Redis cache first
  const cached = await redis.get('waitlist:count')
  if (cached) {
    return Response.json(JSON.parse(cached))
  }

  // Query database
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(waitlistEntries)
    .where(eq(waitlistEntries.status, 'waiting'))

  const response = {
    count: result[0].count,
    lastUpdated: new Date().toISOString(),
  }

  // Cache for 5 minutes
  await redis.set('waitlist:count', JSON.stringify(response), 'EX', 300)

  return Response.json(response)
}
```

---

## 8. Launch Day Playbook

A coordinated launch across all channels maximizes impact. Timing matters — execute these steps in order.

### 8.1 Pre-Launch (T-7 Days)

| Day | Action | Channel |
|-----|--------|---------|
| T-7 | Post "1 week to launch" teaser. Build anticipation | X + Announcement channel |
| T-5 | Share a feature preview screenshot. "This is what's coming..." | X + Community group |
| T-3 | AMA in community: "Ask me anything before launch" | Community group |
| T-2 | Post "2 days left" countdown with feature summary | X + Announcement channel |
| T-1 | "Tomorrow. 🚀" — single-word anticipation post | X + Announcement channel |
| T-1 | Final infrastructure checks, load testing, backup verification | Internal |

### 8.2 Launch Day (T-0)

Execute in this order:

| Step | Time | Action | Channel | Details |
|------|------|--------|---------|---------|
| 1 | 12:00 UTC | Deploy to production | Infrastructure | Verify bot responds, all features functional |
| 2 | 12:15 UTC | Switch bot from waitlist mode to live mode | Bot codebase | `/start` now shows onboarding, not waitlist |
| 3 | 12:30 UTC | Post launch announcement | `@BeruBotAnnouncements` | Feature overview, "Start trading now: @BeruMonarchBot" |
| 4 | 12:30 UTC | Pin getting-started guide | `@BeruBotCommunity` | Step-by-step: how to /start, import wallet, set up first sell |
| 5 | 12:35 UTC | Trigger waitlist notifications | BullMQ | `notifyWaitlistMembers()` — batched over ~5 minutes |
| 6 | 12:45 UTC | Post launch thread on X | `@SajydRajput` | Full story: "I've been building @BeruMonarchBot in public for [N] weeks. Today it's LIVE. Here's the story 🧵" |
| 7 | 13:00 UTC | Update berubot.com | Website | Replace "Coming Soon" with live bot CTA. Remove waitlist counter. Add "Try it now" |
| 8 | 13:00 UTC | Engage in community | `@BeruBotCommunity` | Be present for 2–3 hours answering questions, helping with onboarding |
| 9 | 18:00 UTC | Post follow-up | X + Announcement | "6 hours since launch: [X] users, [Y] trades executed. Thank you!" |

### 8.3 Post-Launch (T+7 Days)

| Day | Action | Channel |
|-----|--------|---------|
| T+1 | Share first day metrics | X + Announcement |
| T+2 | Address any bugs or issues transparently | Community + Announcement |
| T+3 | Feature spotlight: deep dive into Shadow Sell | X thread + Community |
| T+5 | Community feedback roundup: "Here's what you've told us so far" | Community |
| T+7 | Week 1 recap thread | X + Announcement |

### 8.4 Things That Can Go Wrong (And How to Handle Them)

| Risk | Mitigation | Communication |
|------|-----------|---------------|
| Bot crashes under load | Auto-restart via Docker. Horizontal scaling plan in `ARCHITECTURE.md` → Section 3 | "We're experiencing high demand! The bot may be slow. No funds are at risk. Fixed in [X] minutes." |
| RPC rate limits | QuickNode elastic plan. Fallback RPC in env vars | Transparent in community, switch RPCs, no user action needed |
| Scam bots DM users on launch day | Pre-announce: "Admins will NEVER DM you." Pin warning in community. Quick-ban impersonators | Urgent pinned message in community. Warning post in announcements |
| Low initial engagement | Personal outreach to waitlist power users. X engagement push. Feature walkthrough content | Focus on quality, not quantity. Engage deeply with early users |
| Critical bug discovered | Immediate hotfix or feature flag to disable affected feature. Roll back if needed | "We found an issue and disabled [feature] while we fix it. Your funds are safe. ETA: [X] hours." |

---

## 9. Metrics & KPIs

Track these numbers weekly. Use them in build-in-public content and to guide product decisions.

### 9.1 Pre-Launch KPIs

| Metric | How to Track | Target (MVP Launch) |
|--------|-------------|-------------------|
| Waitlist signups | `SELECT COUNT(*) FROM waitlist_entries` | 1,000+ |
| Waitlist daily growth rate | `signups_today / total_signups × 100` | 3–5% daily |
| Referral conversion rate | `referred_signups / total_signups × 100` | 30%+ |
| Avg referrals per user | `SUM(referral_count) / COUNT(*)` | 0.8+ |
| Community members | Telegram group member count | 500+ |
| Announcement subscribers | Telegram channel subscriber count | 300+ |
| X followers | `@SajydRajput` follower count | 1,000+ |
| X engagement rate | `(likes + replies + retweets) / impressions × 100` | 3–5% |
| Website → Bot conversion | Unique clicks on "Launch Bot" / unique visitors | 15%+ |

### 9.2 Post-Launch KPIs

| Metric | How to Track | Good Benchmark |
|--------|-------------|---------------|
| Daily active users (DAU) | Unique telegram_ids interacting with bot per day | Growing week-over-week |
| Waitlist → Active user rate | `activated / notified × 100` | 40%+ |
| Trades executed (daily) | `SELECT COUNT(*) FROM sell_transactions WHERE date = today` | Growing |
| Revenue (daily fees) | `SUM(fee_amount) FROM sell_transactions WHERE date = today` | Positive and growing |
| User retention (D7) | Users active on day 7 / users who started on day 0 | 30%+ |
| Support ticket volume | Messages in Support topic / total active users | Decreasing over time |
| Community sentiment | Manual assessment: ratio of positive to negative messages | > 3:1 positive to negative |
| NPS (Net Promoter Score) | Monthly poll: "How likely are you to recommend Beru Bot?" (1–10) | 50+ |
| Churn rate | Users who haven't used the bot in 14 days / total users | < 20% monthly |
| Referral growth loop | New users from referrals / total new users | 25%+ |

### 9.3 Tracking Dashboard

Build a simple internal dashboard (or use a spreadsheet) to track these weekly:

```
Week | Waitlist | Community | X Followers | Engagement Rate | Notes
──────┼──────────┼───────────┼─────────────┼─────────────────┼──────────
W1   | 0        | 0         | [current]   | -               | Channels created
W2   | 45       | 12        | +20         | 4.2%            | First thread viral
W3   | 120      | 38        | +55         | 3.8%            | Feature preview posted
W4   | 280      | 87        | +110        | 5.1%            | Meme contest
...
```

**Share sanitized metrics publicly** — this is build-in-public content. Post weekly numbers in X threads and community updates. Transparency builds trust.

---

## Appendix A: Quick Reference — Channel & Link Summary

| Asset | URL / Handle | Type |
|-------|-------------|------|
| Bot | `@BeruMonarchBot` | Telegram Bot |
| Support Bot | `@BeruSupportBot` | Telegram Bot |
| Announcements | `@BeruBotAnnouncements` | Telegram Channel (broadcast) |
| Community | `@BeruBotCommunity` | Telegram Supergroup (chat) |
| Website | [berubot.com](https://berubot.com) | Next.js website |
| Founder X | [@SajydRajput](https://x.com/SajydRajput) | X/Twitter |
| Waitlist Link | `t.me/BeruMonarchBot?start=wl_{telegramId}` | Deep link |
| Referral Link | `t.me/BeruMonarchBot?start=ref_{telegramId}` | Deep link |
| Website Start | `t.me/BeruMonarchBot?start=website` | Deep link |

## Appendix B: First-Week Checklist

- [ ] Create `@BeruBotAnnouncements` channel on Telegram
- [ ] Create `@BeruBotCommunity` group on Telegram
- [ ] Convert community group to Supergroup
- [ ] Set public link for both channels
- [ ] Link community as discussion group for announcements
- [ ] Enable Topics (forum mode) in community group
- [ ] Create topic threads (General, Support, Feature Requests, Alpha & Calls)
- [ ] Set up anti-spam bot (`@GroupHelpBot` or `@Combot`)
- [ ] Enable CAPTCHA verification for new members
- [ ] Configure permissions (restrict media/links for first 24h)
- [ ] Pin community rules in the group and each topic
- [ ] Pin welcome/getting-started message
- [ ] Set group description with all links and scam warning
- [ ] Set channel description with all links
- [ ] Upload Beru Bot logo as profile picture for both channels
- [ ] Create trackable invite links (from X, from website, from bot)
- [ ] Update berubot.com footer with community links
- [ ] Update `@SajydRajput` X bio with community link
- [ ] Implement waitlist flow in bot
- [ ] Create `waitlist_entries` database table
- [ ] Post first announcement: "Beru Bot community is live!"
- [ ] Post first build-in-public thread on X
- [ ] Schedule first AMA session (announce date in community)

## Appendix C: Telegram Bot API — Relevant Methods

For implementing waitlist and community features programmatically:

| Method | Use Case |
|--------|----------|
| `getChat` | Retrieve community group member count for metrics |
| `getChatMemberCount` | Display "X members in community" on website or in bot |
| `sendMessage` | Send waitlist confirmation, launch notification |
| `createChatInviteLink` | Programmatically create trackable invite links |
| `exportChatInviteLink` | Get the primary invite link for the community |
| `banChatMember` | Programmatic banning from anti-spam logic |
| `restrictChatMember` | Mute users programmatically |
| `promoteChatMember` | Grant moderator permissions programmatically |

All methods are available via Grammy.js: `bot.api.methodName(...)` (→ `ARCHITECTURE.md` → Section 6).

---

*This document is a living playbook. Update it as the community grows and strategies evolve.*
