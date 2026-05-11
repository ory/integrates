# Contributing to ory/integrations

Thanks for considering a contribution. This repo is intentionally simple. The bar is: **the integration works, the README is enough to use it without reading the source, and the patterns match other integrations in the same category.**

## Quick checklist

- [ ] The integration lives in the right category folder (`crm/`, `identity-verification/`, etc.)
- [ ] `README.md` covers: what it does, prerequisites, deploy steps, Ory Console configuration, troubleshooting
- [ ] If `type: webhook`: `ory-actions.yaml`, `jsonnet/`, and a runnable `webhook/` directory
- [ ] If `type: config`: a clear `ory-console-steps.md`
- [ ] If `type: http-event`: `ory-event-stream.yaml`, runnable `webhook/`, and a `subscribedEvents` list in `registry.entry.yaml`
- [ ] `registry.entry.yaml` filled out (run `node scripts/build-registry.js` to regenerate `registry.yaml`)
- [ ] DCO sign-off (`git commit -s`) on every commit
- [ ] Apache-2.0 SPDX header in source files
- [ ] `Maintained by:` line at the top of `README.md`

## Process

1. **Open an issue first** — use the **New integration** issue template. We confirm the integration isn't already in flight and clarify scope.
2. **Pick the right template** in `_examples/`:
   - `_template-webhook/` — Ory Action webhook handler
   - `_template-config/` — Ory Console configuration only
   - `_template-http-event/` — Ory Live Event Stream consumer (Enterprise)

   Copy it into the right category:
   ```bash
   cp -R _examples/_template-webhook crm/<your-integration>
   ```
3. **Fill out the template** — README, code (if any), and `registry.entry.yaml`.
4. **Regenerate the registry**:
   ```bash
   cd scripts && npm install && cd ..
   node scripts/build-registry.js
   ```
5. **Open a PR** — explain what it does, link the issue, and confirm the checklist above.
6. **Ory engineering reviews** — expect questions about Ory Network compatibility, webhook security (signature verification, secret handling), and clarity of the README.
7. **Merge** — once approved, an Ory maintainer merges. We coordinate the corresponding [docs page](https://ory.com/docs/integrations) addition in parallel.

## Maintainership

Each integration's `README.md` declares a `Maintained by:` line. Two values are common:

- `Maintained by: Ory Engineering` — Ory commits to keeping the integration current
- `Maintained by: Community contributors` — community-maintained, Ory reviews PRs but does not actively maintain

If you contribute an integration and want to be the named maintainer, list yourself in the `Maintained by:` line. If you step away, open a PR transferring it.

## What we won't accept

- README-only PRs without working code (for webhook-style) or a real `ory-console-steps.md` (for config-only). Documentation contributions belong on **[ory.com/docs](https://ory.com/docs)**, not here.
- Hosted services that Ory would need to operate. Code samples are deploy-it-yourself.
- Vendor marketing in the README. Be factual: explain how to wire the integration up, not why the vendor's product is great.

## License and signoff

By submitting a PR you certify the [Developer Certificate of Origin](https://developercertificate.org/). Sign each commit:

```bash
git commit -s -m "Add Acme CRM integration"
```

All contributions are licensed under Apache-2.0.
