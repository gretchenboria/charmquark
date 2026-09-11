# CharmQuark configuration

Your CharmQuark deployment's labs, robots, missions, settings and workflows, as
files you edit by hand or with a coding agent, review in pull requests, and apply.

## Set up

1. In CharmQuark, open **Settings → API tokens** and create a token with **can make changes**.
2. Set the connection (Node 20 or later, nothing to install):

   ```bash
   export CHARMQUARK_URL=https://<your deployment>
   export CHARMQUARK_TOKEN=cq_pat_…
   ```

3. `node cq.mjs pull`, then commit.

## Change something

```bash
node cq.mjs pull          # start from what is live
# edit records/labs.json, settings.json, workflows/*.bpmn …
node cq.mjs plan          # read every line
node cq.mjs apply         # applies exactly the plan, then pulls fresh ids and versions
git commit -am "…"
```

Removing a record from a file doesn't delete it. Add `--prune` to both `plan` and
`apply` when you mean to delete.

The same bundle can be downloaded, planned and applied from **Settings →
Configuration bundle** in the app.

## With an agent

`AGENTS.md` tells Claude Code, Gemini CLI and other agents how to work here safely.
`.mcp.json` and `.gemini/settings.json` connect them to the deployment's MCP
server, so they can look things up, using `CHARMQUARK_URL` and `CHARMQUARK_TOKEN`
from your environment.

## In CI

`.github/workflows/charmquark.yml` plans on every pull request. On merge to
`main` it applies, then commits the fresh ids and versions back. Set the
repository variable `CHARMQUARK_URL` and the secret `CHARMQUARK_TOKEN`.
