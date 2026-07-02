---
name: agent-config-review
description: Usar al revisar o modificar AGENTS.md, .codex, agentes locales, skills locales o instrucciones operativas del repo.
---

# Revision de configuracion de agentes

1. Usa `AGENTS.md` como autoridad principal.
2. Haz inventario concreto de `AGENTS.md`, `.codex/**` y `.agents/**`.
3. Lee solo los archivos de configuracion afectados.
4. Valida que el scope del `AGENTS.md` coincide con la ruta real del repo.
5. Separa responsabilidades:
   - politica critica en `AGENTS.md`;
   - rol y limites en `.codex/agents/*.toml`;
   - procedimientos reutilizables en `.agents/skills/*`.
6. Busca contradicciones, activadores demasiado amplios, instrucciones obsoletas y duplicidad innecesaria.
7. Para cambios solo de agentes/documentacion, valida con `git diff --check`.
