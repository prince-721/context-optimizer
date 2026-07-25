/** Auto-redacts sensitive keys, secrets, and credentials before prompt export */
export class SecretRedactor {
  private static patterns: RegExp[] = [
    // OpenAI / Groq / Anthropic / GitHub / Slack / Stripe API Keys
    /(?:sk-[a-zA-Z0-9_-]{20,})/g,
    /(?:gsk_[a-zA-Z0-9_-]{20,})/g,
    /(?:ghp_[a-zA-Z0-9]{30,})/g,
    /(?:xox[baprs]-[a-zA-Z0-9_-]{10,})/g,
    /(?:sk_live_[a-zA-Z0-9]{20,})/g,
    // AWS Access Key ID & Secret Key
    /(?:AKIA[0-9A-Z]{16})/g,
    /(?:aws_secret_access_key\s*=\s*['"]?[a-zA-Z0-9\/+=]{40}['"]?)/gi,
    // Bearer / JWT Tokens
    /(?:Bearer\s+[a-zA-Z0-9\._\-]{20,})/gi,
    /(?:eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})/g,
    // Passwords & Private Keys in env format
    /(?:(?:password|secret|key|token|auth)\s*[:=]\s*['"]?([^'"\s]{8,})['"]?)/gi,
  ];

  public static sanitize(text: string): string {
    if (!text) return text;
    let sanitized = text;

    for (const pattern of this.patterns) {
      sanitized = sanitized.replace(pattern, (match) => {
        if (match.includes('=')) {
          const parts = match.split('=');
          return `${parts[0]}=[REDACTED_SECRET]`;
        }
        if (match.includes(':')) {
          const parts = match.split(':');
          return `${parts[0]}: [REDACTED_SECRET]`;
        }
        return '[REDACTED_SECRET]';
      });
    }

    return sanitized;
  }
}
