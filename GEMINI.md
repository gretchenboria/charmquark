# Gemini CLI specifics

`.gemini/settings.json` loads `AGENTS.md` alongside this file. Everything there
applies here, especially **Protected zones** and **Never**.

Gemini CLI doesn't run this repo's Claude Code hook, so the protected-file rule
is on you. Before editing any file listed under Protected zones, stop and ask
the user. CI and code-owner review on `main` are the backstop for every agent.
