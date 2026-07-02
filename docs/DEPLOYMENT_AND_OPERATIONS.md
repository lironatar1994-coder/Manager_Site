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

The PowerShell deploy script:

- validates key files
- ensures the GitHub remote
- stages known app files
- commits if needed
- pushes to GitHub
- ensures the remote checkout exists
- runs the Linux deploy script remotely

## Linux Deploy Script

`deploy_linux.sh` runs on the server and handles:

- fetch/reset to `origin/main`
- production dependency install
- production `.env` creation on first deploy
- first admin password generation
- PM2 start/restart
- Nginx route snippet creation
- lowercase route redirect
- Nginx reload
- local app health check

## Production Secrets and Data

Do not commit or overwrite:

- `/root/Manager_Site/.env`
- `/root/Manager_Site/data/store.json`
- `/root/Manager_Site/data/uploads`
- `/root/Manager_Site/data/initial-admin.txt`

The first production admin password is stored once at:

`/root/Manager_Site/data/initial-admin.txt`

## Direct Deploy Command

This command has been used successfully:

```powershell
ssh root@vee-app.co.il "cd /root/Manager_Site && git fetch origin main && git reset --hard origin/main && chmod +x deploy_linux.sh && ./deploy_linux.sh"
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

## Expected Health

- `/Manager_Site/login` returns `200`
- `/manager_site/login` returns `301` to `/Manager_Site/login`
- PM2 process `manager-site` is online
- Nginx config test passes

## Rollback

Prefer a normal Git rollback:

```bash
cd /root/Manager_Site
git log --oneline
git reset --hard <known-good-commit>
./deploy_linux.sh
```

Do not delete production `data/` as part of rollback.
