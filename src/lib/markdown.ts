import MarkdownIt from "markdown-it"

/**
 * Shared safe renderer for untrusted tool-parse result markdown. Raw HTML is
 * disabled, URLs are never linkified, and link targets are never activated:
 * links become inert spans, images are dropped and their alt text is kept as
 * escaped text. See docs/API-CONTRACT.md on the result contract.
 */
const md = new MarkdownIt({ html: false, linkify: false, breaks: false })
md.renderer.rules.link_open = () => "<span>"
md.renderer.rules.link_close = () => "</span>"
md.renderer.rules.image = (tokens, index) => {
  const alt = `alt ${JSON.stringify(tokens[index]?.content ?? "")}`
  return md.utils.escapeHtml(alt)
}

export function renderMarkdown(source: string): string {
  return md.render(source)
}
