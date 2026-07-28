// Markdown rendering for message content. Rendered HTML is sanitized with
// DOMPurify so LLM output can't inject scripts/markup into the page.
//
// We render markdown only for *finalized* messages; the streaming message is
// shown as plain preformatted text while tokens arrive (rendering markdown per
// token would thrash the DOM). See MessageBubble.svelte.

import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({
    gfm: true,
    breaks: true,
});

export function renderMarkdown(src: string): string {
    const html = marked.parse(src ?? "", { async: false }) as string;
    return DOMPurify.sanitize(html, {
        // allow target/rel on links so we can add rel="noopener" via post-processing if needed
        ADD_ATTR: ["target", "rel"],
    });
}
