import type { SentRecord } from "../chat/pipeline";
import { removedClaimsMessage, type Claim, type VerifiedAnswer } from "../chat/quotes";
import type { NoteHit } from "../search/types";

export interface AnswerCallbacks {
  openNote: (notePath: string, newTab: boolean) => void;
}

/**
 * Renders a verified answer.
 *
 * The quote is the one accent in the panel (spec Q6): every claim carries a
 * citation that opens the exact quote Graphite found in the cited note, so the
 * proof is one keystroke away from the claim.
 */
export function renderAnswer(
  container: HTMLElement,
  verified: VerifiedAnswer,
  notes: readonly NoteHit[],
  sent: SentRecord,
  callbacks: AnswerCallbacks,
): void {
  const answer = container.createDiv({ cls: "graphite-answer" });

  for (const claim of verified.claims) {
    renderClaim(answer.createDiv({ cls: "graphite-claim" }), claim, notes, callbacks);
  }

  const removed = removedClaimsMessage(verified.removedCount);
  if (removed) {
    // Stated as text, never signalled by colour alone.
    container.createDiv({ cls: "graphite-removed", text: removed });
  }

  renderSources(container, verified.citedNotes, callbacks);
  renderSent(container, sent);
}

function renderClaim(
  target: HTMLElement,
  claim: Claim,
  notes: readonly NoteHit[],
  callbacks: AnswerCallbacks,
): void {
  target.createSpan({ cls: "graphite-claim-text", text: claim.text });

  for (const citation of claim.citations) {
    if (!citation.verified) continue;
    const note = notes[citation.number - 1];
    if (!note) continue;

    const button = target.createEl("button", { cls: "graphite-citation" });
    button.type = "button";
    button.setText(String(citation.number));
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", `Show the quote from ${note.noteTitle}`);

    const quote = target.createDiv({ cls: "graphite-quote" });
    quote.hide();
    quote.createDiv({ cls: "graphite-quote-text", text: `"${citation.quote}"` });

    const source = quote.createEl("button", { cls: "graphite-quote-source" });
    source.type = "button";
    source.setText(note.noteTitle);
    source.addEventListener("click", (event) => {
      callbacks.openNote(note.notePath, event.ctrlKey || event.metaKey);
    });

    // A button toggles on Enter and Space already; only Escape needs handling.
    button.addEventListener("click", () => toggleQuote(button, quote));
    quote.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        toggleQuote(button, quote, false);
        button.focus();
      }
    });
  }
}

function toggleQuote(button: HTMLElement, quote: HTMLElement, force?: boolean): void {
  const open = force ?? !quote.isShown();
  if (open) quote.show();
  else quote.hide();
  button.setAttribute("aria-expanded", String(open));
}

/**
 * The sources list, built from the real search results rather than anything
 * the model wrote, so it can never name a note that was not retrieved.
 */
function renderSources(
  container: HTMLElement,
  citedNotes: readonly NoteHit[],
  callbacks: AnswerCallbacks,
): void {
  if (citedNotes.length === 0) return;

  const details = container.createEl("details", { cls: "graphite-disclosure" });
  details.createEl("summary", { text: `Sources (${citedNotes.length})` });

  const list = details.createDiv({ cls: "graphite-sources" });
  for (const note of citedNotes) {
    const item = list.createEl("button", { cls: "graphite-source" });
    item.type = "button";
    item.createDiv({ cls: "graphite-source-title", text: note.noteTitle });
    if (note.folder) item.createDiv({ cls: "graphite-source-folder", text: note.folder });
    const excerpt = note.snippets[0]?.section.body.replace(/\s+/g, " ").trim() ?? "";
    if (excerpt) {
      item.createDiv({ cls: "graphite-source-excerpt", text: truncate(excerpt, 180) });
    }
    item.addEventListener("click", (event) => {
      callbacks.openNote(note.notePath, event.ctrlKey || event.metaKey);
    });
  }
}

/**
 * What was sent and what it cost (US-10).
 *
 * A native details element, so Enter and Space toggle it without extra key
 * handling. Token counts are only ever the provider's own; when it reports
 * none, that is stated rather than estimated.
 */
export function renderSent(container: HTMLElement, sent: SentRecord): void {
  const details = container.createEl("details", { cls: "graphite-disclosure" });
  details.createEl("summary", { text: "What was sent" });

  const tokens =
    sent.usage.sent === null && sent.usage.received === null
      ? "Tokens: not reported by this provider"
      : `Tokens: ${format(sent.usage.sent)} sent, ${format(sent.usage.received)} received`;

  details.createDiv({
    cls: "graphite-note",
    text: `${sent.excerptCount} ${sent.excerptCount === 1 ? "excerpt" : "excerpts"}. ${tokens}`,
  });
  details.createEl("pre", { cls: "graphite-sent-text", text: sent.text });
}

function format(value: number | null): string {
  return value === null ? "not reported" : String(value);
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}
