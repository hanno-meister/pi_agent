---
name: pr-plain-summary
description: Turn a PR description (pasted text or link) into short note-style change bullets for the project team and client stakeholders. English by default; another language can be requested.
---

# PR -> short change notes

Turn the PR description into short notes that project members and client stakeholders can skim in 20 seconds. Write like a team member jotting down what changed, not like a press release.

## Process

1. Identify each distinct change readers would notice, in source order. Omit purely internal work such as tests, refactors, code reorganization, CI, research notes and planning documents.
2. Stay at the PR's level of precision. Do not add causes, mechanisms or benefits the PR does not state.
3. Keep caveats only if they affect what readers can use or rely on: open tests, paused features, known problems. Omit test counts and passed checks.
4. Write exactly one bullet per change in the style below. Never merge two changes into one bullet, even if they touch the same area. Default to English, regardless of the source language. If the user requests a language (for example `de` or "in German"), write directly in that language. When translating an existing summary, keep its bullets, facts and caveats, but rewrite in note style rather than translating sentence by sentence.

## Style

`- <Short title>: <what changed, as fragments>. (<optional context or caveat>)`

- Output only the bullet list, without a header, introduction or closing sentence.
- Note style, not prose: fragments and past participles ("descriptions shortened", "Beschreibungen gekürzt"), no full sentences needed.
- Shorthand is fine within one change: "+" joins parts of the same change ("order numbers + safety notes stay"), "→" for "leads to / replaced by". Never use "+" to join separate changes.
- Put brief context or open caveats in parentheses at the end of the affected bullet.
- Caveats in reader terms: "(not yet tested in the browser)", "(noch nicht mit echten Anfragen getestet)". Never "live model", "Live-Modell", "model", "staging" or "CI".
- Domain terms the project team uses (product names, API names, error codes) are fine. Avoid code-level detail: file names, function names, libraries.
- Prefer plain words over stiff ones: "Floskeln" over "routinemäßige Standardhinweise", "Sicherheitshinweise" over "relevante Sicherheitseinschränkungen", unless the PR's exact term matters.
- No filler: drop "now", "still", "jetzt", "weiterhin" unless the meaning depends on them.
- Paused or disabled features get their own bullet: what is off, why (in parentheses if technical), what still works.
- Mention what stays the same only when readers would otherwise worry, as a short fragment: "order numbers + safety notes stay".

## Example

From an earlier release; shows style only, never reuse its content:

- Übersichtlichere Vorschläge: Produktbeschreibungen gekürzt, Tabellen kompakter. Bestellnummern + Sicherheitshinweise bleiben.
- Einheitliche Sprache: Antworten, Tabellenüberschriften, Produkterklärungen durchgängig in Nutzersprache.
- Bessere Produktsuche: Bei keinem Treffer schrittweise vereinfachte Suchbegriffe, Anforderungen unverändert. (muss noch getestet werden)
- Kompatibilitätsprüfung pausiert: Regelprüfungen vorerst deaktiviert (500er-Fehler bei der Rules-API). Produktinfos weiterhin abrufbar.
