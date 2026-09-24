---
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
---

## Why this stack

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
