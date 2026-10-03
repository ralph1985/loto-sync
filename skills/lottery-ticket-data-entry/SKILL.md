---
name: lottery-ticket-data-entry
description: "Use when registering lottery tickets in loto-sync. Preserve every draw date covered by a validity period."
version: 1.0.0
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [loto-sync, lottery, tickets, draw-coverage, verification]
---

# Lottery ticket data entry in loto-sync

Apply these project-specific rules when registering or correcting lottery tickets.

## Rules

- Treat a receipt validity period as draw coverage, not as a single date.
- For La Primitiva, register every applicable Monday, Thursday, and Saturday draw inside the period; never register only the period's final date.
- Preserve the receipt's canonical/base date separately when the application needs it, and store the complete coverage in the ticket's draw-date collection.
- Before writing, check the exact group, game, period, combination, and existing coverage to avoid duplicate tickets or duplicate draw checks.
- Use the application's supported ticket API or UI coverage control rather than creating separate tickets for each draw.
- After writing, read the exact ticket back and verify every covered draw date and the user-visible coverage/history view.
- Keep receipt range notation and application-level individual dates conceptually separate: the image may show a range while the application must expose the individual draws.

## Verification

A ticket registration is complete only when the stored ticket, all applicable draw checks, and the application presentation agree. If the UI is cached, invalidate or refresh it before reporting success.
