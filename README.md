# Graphite

Chat with your Obsidian vault. Every claim in an answer carries an exact quote, and Graphite checks that quote against the note it cites before showing it to you.

## Status

Early development. Version 0.1 is being built and is **not usable yet**.

What exists today is the plugin skeleton: it loads in Obsidian, registers a ribbon icon and a command, and opens an empty side panel. Search, AI answers and provider settings are not built yet. There is no release to install.

Progress is tracked in [tasks/todo.md](tasks/todo.md). The full specification, including user stories and acceptance criteria, is in [SPEC.md](SPEC.md).

## Why another vault chat plugin

Obsidian's search matches exact words, but people remember what a note was about long after they forget how they worded it. AI tools that read a vault solve that, and introduce a worse problem: they can name notes, paths or content that do not exist. One invented note is enough to stop trusting the answer.

Existing plugins answer with citations, but a citation only tells you which note an answer came from. It does not tell you whether that note actually says what the answer claims.

Graphite's answer to this is a quote check. Every claim must end with a citation carrying an exact quote from the note it cites. Before anything is shown, Graphite looks for that quote in the note's retrieved text, after normalising whitespace, letter case and Markdown formatting. Claims whose quote cannot be found are removed, and the answer says how many were dropped. If no claim survives, no answer is shown.

This runs the same way on every provider, including local models, rather than depending on one vendor's grounding feature.

### Known limit

Graphite guarantees that every claim shown cites a real note that search returned, and carries a quote that is genuinely in that note. It cannot guarantee the claim reads the quote correctly, for example a quote taken out of context. The quote sits next to the claim so you can judge that yourself at a glance.

## How it will work

1. **Index.** Each note is split into sections at its headings and indexed locally with its title, aliases, tags, heading, folder and body. Title matches weigh more than body matches. No AI, no network.
2. **Search.** BM25 ranks sections, results are grouped by note, and notes connected through Obsidian's link graph get a small boost.
3. **Answer.** The provider receives only the numbered excerpts and must answer from them alone, ending each claim with a citation and quote.
4. **Verify.** Each citation is checked against the retrieved note text. Unverified claims are removed. Wikilinks that do not resolve become plain text. The sources list is built from the real search results, never from the model's output.

Search runs with no AI provider configured, offline, and when a provider call fails. In those cases you get ranked notes with the reason each one matched.

## Design principles

- Every claim shown carries a quote that Graphite found in the cited note.
- Search works before any provider is set up, and never fails because of one.
- You can see why each note matched and exactly what was sent to your provider.
- You bring your own provider. Graphite has no server and needs no account.
- Graphite never creates, edits or deletes notes. This is permanent, not a v0.1 limit.

## Planned provider support

| Provider | Notes |
|---|---|
| OpenAI-compatible | Presets for Groq, OpenAI, OpenRouter, LM Studio, and a custom base URL |
| Anthropic | Through the official SDK |
| Ollama | Local models, default `http://localhost:11434` |

API keys are stored in Obsidian's SecretStorage, never in plugin data or source. Nothing is sent anywhere except the provider you configure. There is no telemetry.

## Requirements

- Obsidian 1.11.4 or later, which introduced the SecretStorage API
- Desktop only. Mobile is a candidate for v0.3.

## Building from source

```
git clone https://github.com/whyCharan/Graphite.git
cd Graphite
npm install
npm run build
```

| Command | What it does |
|---|---|
| `npm run dev` | esbuild in watch mode, writes `main.js` |
| `npm run build` | Type check with `tsc --noEmit`, then a production build |
| `npm test` | Run the test suite with Vitest |

To try it in Obsidian, copy `main.js`, `manifest.json` and `styles.css` into `<your-vault>/.obsidian/plugins/graphite-vault-chat/` and reload. Use a scratch vault rather than your real one while the plugin is in development.

## Out of scope for v0.1

Writing to the vault in any form is permanently out of scope. Embedding-based search and natural-language filters by date, folder or tag are candidates for v0.2. Streaming answers and mobile support are candidates for v0.3.

## License

MIT. A `LICENSE` file is added with the first release.

## Author

Charan Sandaka
