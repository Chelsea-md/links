// Lightweight user-agent + referrer classification. No external deps.

export interface UAInfo {
  device: 'mobile' | 'tablet' | 'desktop';
  os: string;
  browser: string;
  bot: boolean;
  ai: string | null;
}

// AI assistants / crawlers, matched against the user agent.
const AI_AGENTS: [RegExp, string][] = [
  [/ChatGPT-User/i, 'ChatGPT'],
  [/OAI-SearchBot/i, 'ChatGPT Search'],
  [/GPTBot/i, 'OpenAI GPTBot'],
  [/Claude-User/i, 'Claude'],
  [/Claude-SearchBot/i, 'Claude Search'],
  [/ClaudeBot|anthropic-ai/i, 'Anthropic ClaudeBot'],
  [/Perplexity-User/i, 'Perplexity'],
  [/PerplexityBot/i, 'PerplexityBot'],
  [/Google-Extended|Gemini/i, 'Gemini'],
  [/MistralAI-User/i, 'Mistral'],
  [/meta-externalagent|Meta-ExternalFetcher/i, 'Meta AI'],
  [/Bytespider/i, 'ByteDance'],
  [/cohere-ai/i, 'Cohere'],
  [/YouBot/i, 'You.com'],
  [/DuckAssistBot/i, 'DuckAssist'],
  [/Amazonbot/i, 'Amazonbot'],
  [/Applebot-Extended/i, 'Apple Intelligence'],
];

// Referring hosts that mean "a human clicked this inside an AI assistant".
const AI_REFERRERS: [RegExp, string][] = [
  [/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/, 'ChatGPT'],
  [/(^|\.)claude\.ai$/, 'Claude'],
  [/(^|\.)perplexity\.ai$/, 'Perplexity'],
  [/(^|\.)gemini\.google\.com$/, 'Gemini'],
  [/(^|\.)copilot\.microsoft\.com$/, 'Copilot'],
  [/(^|\.)chat\.mistral\.ai$/, 'Mistral'],
  [/(^|\.)chat\.deepseek\.com$/, 'DeepSeek'],
  [/(^|\.)grok\.com$/, 'Grok'],
  [/(^|\.)you\.com$/, 'You.com'],
];

// Link-preview fetchers, crawlers, monitors, CLI tools — counted as bots.
const BOT_RE =
  /bot\b|bot\/|crawler|spider|crawl|slurp|facebookexternalhit|facebookcatalog|Twitterbot|Slackbot|Slack-ImgProxy|Discordbot|TelegramBot|WhatsApp|kakaotalk-scrap|Daumoa|Yeti|LinkedInBot|Embedly|Iframely|Quora Link Preview|SkypeUriPreview|redditbot|vkShare|Google-InspectionTool|Google-PageRenderer|HeadlessChrome|Lighthouse|PhantomJS|curl\/|Wget|python-requests|python-urllib|aiohttp|Go-http-client|okhttp|axios\/|node-fetch|undici|Java\/|libwww|UptimeRobot|Pingdom|StatusCake|Bitlybot|preview/i;

export function classifyUA(ua: string): UAInfo {
  ua = ua || '';
  let ai: string | null = null;
  for (const [re, name] of AI_AGENTS) {
    if (re.test(ua)) { ai = name; break; }
  }
  const bot = ai !== null || ua.length === 0 || BOT_RE.test(ua);

  // OS
  let os = 'Other';
  if (/iPhone|iPod/.test(ua)) os = 'iOS';
  else if (/iPad/.test(ua)) os = 'iPadOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  // Device
  let device: UAInfo['device'] = 'desktop';
  if (/iPad|Tablet/i.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) device = 'tablet';
  else if (/Mobi|iPhone|iPod|Android/i.test(ua)) device = 'mobile';

  // Browser (order matters — many UAs contain "Safari"/"Chrome")
  let browser = 'Other';
  if (/KAKAOTALK/i.test(ua)) browser = 'KakaoTalk';
  else if (/NAVER\(inapp|NaverMatome|\bNAVER\b/i.test(ua)) browser = 'Naver';
  else if (/Whale\//.test(ua)) browser = 'Whale';
  else if (/SamsungBrowser\//.test(ua)) browser = 'Samsung Internet';
  else if (/Instagram/.test(ua)) browser = 'Instagram';
  else if (/FBAN|FBAV/.test(ua)) browser = 'Facebook';
  else if (/Line\//.test(ua)) browser = 'LINE';
  else if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Firefox\/|FxiOS/.test(ua)) browser = 'Firefox';
  else if (/CriOS\/|Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';

  return { device, os, browser, bot, ai };
}

export function referrerHost(ref: string | null): string {
  if (!ref) return 'direct';
  try {
    return new URL(ref).hostname.replace(/^www\./, '') || 'direct';
  } catch {
    return 'direct';
  }
}

export function aiFromReferrer(host: string): string | null {
  for (const [re, name] of AI_REFERRERS) if (re.test(host)) return name;
  return null;
}
