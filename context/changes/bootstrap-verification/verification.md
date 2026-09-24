---
bootstrapped_at: 2026-09-22T12:38:23Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: noc-priority
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

Verbatim copy of `context/foundation/tech-stack.md`.

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: noc-priority
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

### Why this stack

Solo projekt po godzinach z sześciotygodniowym budżetem i twardym terminem
2026-11-04 potrzebuje startera, który oddaje logowanie, trwałą bazę i wdrożenie
bez składania ich z kawałków. Trwałość w NOC Priority dotyczy tylko wag,
historii ich zmian i dwóch wspólnych kont — Supabase pokrywa to jednym
PostgreSQL-em i wbudowanym uwierzytelnianiem, a rozdział uprawnień
operator/administrator wchodzi w RLS. Wgrane zgłoszenia nie są trwałe, więc
parsowanie CSV i liczenie priorytetu zostają w jednym żądaniu, bez kolejki ani
zadań w tle. 10x Astro Starter jest rekomendowanym domyślnym wyborem dla
komórki (web, js) i przechodzi wszystkie cztery kryteria przyjazności dla
agenta: TypeScript z Zod na granicach, routing plikowy, duży korpus treningowy
i wersjonowana dokumentacja. Gładkość scaffoldingu jest first-class, więc licz
się z pojedynczymi ręcznymi krokami. Deployment na Cloudflare Pages, CI na
GitHub Actions z automatycznym wdrożeniem po merge. Jedno napięcie do
pilnowania: PRD wymaga, by nazwy klientów i usług nie opuszczały kontrolowanego
środowiska, a Cloudflare i Supabase są usługami zewnętrznymi — trzeba
potwierdzić, że to środowisko jest uznane za kontrolowane, albo przenieść
przetwarzanie pliku do przeglądarki.

## Pre-scaffold verification

| Signal      | Value                                                     | Severity | Notes                                                                                                                   |
| ----------- | --------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| npm package | not run                                                   | n/a      | `cmd_template` starts with `git clone`; no npm-distributed create CLI to resolve                                        |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-09-12 | fresh    | from `card.docs_url`; 10 days before this run. `gh` CLI unavailable on PATH — queried `api.github.com` directly instead |

No stale signal. No heads-up raised.

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 22 top-level entries — 51 project files plus the installed dependency tree (30,731 files total, 648 packages)
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold`
**.gitignore handling**: moved silently (absent in cwd — no merge needed)
**.bootstrap-scaffold cleanup**: deleted
**Upstream `.git/` handling**: `.bootstrap-scaffold/.git/` deleted before move-up; no upstream history in this directory
**`context/` handling**: scaffold shipped no `context/` directory, so the drop rule was not exercised; the existing `context/` tree is untouched

Moved top-level entries: `.env.example`, `.github`, `.gitignore`, `.husky`, `.nvmrc`, `.prettierrc.json`, `.vscode`, `AGENTS.md`, `README.md`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules`, `package-lock.json`, `package.json`, `public`, `scripts`, `src`, `supabase`, `tsconfig.json`, `wrangler.jsonc`, plus `CLAUDE.md` sidelined as `CLAUDE.md.scaffold`.

`npm install` emitted a non-fatal warning: 3 packages have install scripts not yet covered by `allowScripts` (`esbuild@0.28.2`, `workerd@1.20260911.1`, `esbuild@0.28.1`). Review with `npm install-scripts ls` if the build needs them.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Exit code**: 0
**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW
**Direct vs transitive**: not applicable — no findings. Dependency totals reported by the tool: 377 prod, 269 dev, 167 optional (804 total).

#### CRITICAL findings

none

#### HIGH findings

none

#### MODERATE findings

none

#### LOW / INFO findings

none

Raw output:

```json
{
  "auditReportVersion": 2,
  "vulnerabilities": {},
  "metadata": {
    "vulnerabilities": {
      "info": 0,
      "low": 0,
      "moderate": 0,
      "high": 0,
      "critical": 0,
      "total": 0
    },
    "dependencies": {
      "prod": 377,
      "dev": 269,
      "optional": 167,
      "peer": 0,
      "peerOptional": 0,
      "total": 804
    }
  }
}
```

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | first-class          |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | null                 |
| team_size               | solo                 |
| deployment_target       | cloudflare-pages     |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                 |
| has_payments            | false                |
| has_realtime            | false                |
| has_ai                  | false                |
| has_background_jobs     | false                |

`project_name: noc-priority` is recorded as metadata only — the scaffold lives in the current working directory, so the directory name is the project's directory name.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep. Here: `CLAUDE.md.scaffold` is the starter's agent-context file; your existing `CLAUDE.md` carries the lesson's bootstrap-chain instructions.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log (clean tree on this run).
- Copy `.env.example` to `.env` and fill in the Supabase and Cloudflare values before the first `npm run dev`.
