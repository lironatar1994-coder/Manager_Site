# Deployment and Operations

## Production Target

- Host: `vee-app.co.il`
- SSH user: `root`
- Repo: `https://github.com/lironatar1994-coder/Manager_Site.git`
- Remote directory: `/root/Manager_Site`
- Public base path: `/Manager_Site`
- Lowercase redirect path: `/manager_site`
- PM2 process: `manager-site`
- Node port: `3027`

Canonical URL:

`https://vee-app.co.il/Manager_Site/login`

## Windows Deploy Entry Point

```powershell
.\deploy.ps1 "Describe the change"
```

This command commits the application changes, pushes them to GitHub, and deploys
that exact commit to the server. It includes the tracking-link modules/tests and
the new interface assets. It requires Node 20+, Git, and SSH key access.

Run the local checks without publishing anything:

```powershell
.\deploy.ps1 -CheckOnly
```

The script checks the current branch and existing origin without renaming or
changing them, then runs JavaScript checks and the tracking-link integration
tests. Every native command is checked for failure. Only known application
paths are staged; runtime data, local fixtures, and agent attachments are excluded.
Unrelated changes already staged cause it to stop.

After push, the script reads `deploy_linux.sh` from the exact pushed revision
into a temporary remote file and executes it. A pre-existing remote directory
without Git is never deleted or replaced.

## Linux Deploy Script

`deploy_linux.sh` runs on the server and handles:

- lock against concurrent deployments and check for modified tracked files
- fetch the selected branch and check out the requested commit, preserving runtime data and untracked files
- save the previous revision, production configuration, and a recovery script privately under `/root/.manager-site-deployments/`
- production dependency install
- production `.env` creation on first deploy
- first admin password generation
- PM2 start/restart
- Nginx route snippet creation
- lowercase route redirect
- Nginx reload
- local app and asset checks, public login `200`, and lowercase alias `301`
- shared ServerMonitor analytics-key creation/preservation and PM2 environment wiring

Options: `--ref FULL_COMMIT_SHA`, `--branch main`, and `--dir /root/Manager_Site`.
Without `--ref`, it uses the selected origin branch. An explicit revision must
belong to that branch. Existing PM2 processes are restarted with updated
environment; `start` is used only if the process does not exist.

This is an in-place deployment with a short PM2 restart, not a zero-downtime
release system. It never runs `git clean`, deletes application directories, or
resets runtime data. Configuration snapshots include `.env` and must stay
private. They are not backups of the live data directory. If a later step fails,
the script stops and reports the previous revision; code rollback is explicit.
Invalid Nginx changes are restored before exiting without a reload.

## Production Secrets and Data

Do not commit or overwrite:

- `/root/Manager_Site/.env`
- `/root/Manager_Site/data/store.json`
- `/root/Manager_Site/data/uploads`
- `/root/Manager_Site/data/initial-admin.txt`
- `/root/Manager_Site/data/clients`
- `/root/.manager-site-analytics-key`

Runtime-created client workspaces live under `data/clients` so they survive Git deploys.

The analytics key is shared only by the two backend processes. Deploy ServerMonitor before Manager Site when introducing or changing the integration so port `4010` is serving the internal endpoints before the client UI goes live. Neither deployment prints the key.

Repo-visible templates and starter examples live under `clients/`.

The first production admin password is stored once at:

`/root/Manager_Site/data/initial-admin.txt`

## Direct Deploy Command

Run from a shell on the server, after the desired code has been pushed:

```bash
cd /root/Manager_Site
git fetch origin main
revision=$(git rev-parse origin/main)
snapshot=$(mktemp /tmp/manager-site-deploy.XXXXXX)
trap 'rm -f "$snapshot"' EXIT
git show "$revision:deploy_linux.sh" > "$snapshot"
bash "$snapshot" --ref "$revision"
```

## Production Verification

Check public route:

```powershell
curl.exe -I https://vee-app.co.il/Manager_Site/login
```

Check lowercase redirect:

```powershell
curl.exe -I https://vee-app.co.il/manager_site/login
```

Check live assets:

```powershell
node -e "fetch('https://vee-app.co.il/Manager_Site/app.js').then(r=>r.text()).then(t=>console.log(t.includes('slotRatioLabel')))"
```

Check the internal analytics link from the server without printing the key:

```bash
KEY="$(cat /root/.manager-site-analytics-key)"
curl -fsS -H "x-manager-site-analytics-key: $KEY" \
  "http://127.0.0.1:4010/serve-monitor/api/visitor-analytics/manager-site/site?site_url=https%3A%2F%2Fvee-app.co.il%2FMiryam_Zelig%2F" \
  | jq '.app.name, .summary.unique_candidates'
unset KEY
```

## Expected Health

- `/Manager_Site/login` returns `200`
- `/manager_site/login` returns `301` to `/Manager_Site/login`
- PM2 process `manager-site` is online
- PM2 process `server-monitor` is online on port `4010`
- the internal URL match returns only the expected monitored app
- Nginx config test passes

## Rollback

Use the backup directory printed by the deployment. Its recovery script remains
available even if the checked-out app revision predates the new deploy script:

```bash
backup_dir=/root/.manager-site-deployments/REPLACE_WITH_DEPLOYMENT_DIRECTORY
previous=$(cat "$backup_dir/previous-ref.txt")
bash "$backup_dir/deploy-recovery.sh" --ref "$previous"
```

Do not delete production `data/` as part of rollback.
