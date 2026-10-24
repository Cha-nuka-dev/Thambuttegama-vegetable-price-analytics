# GitHub publication checklist

## Before creating a public repository

- [ ] Confirm the folder being uploaded is **this cleaned release**, not the original ZIP archive or the deployed private Site repository.
- [ ] Confirm the only prices bundled for the main charts are labeled **synthetic demo**.
- [ ] Do not add source images, downloaded archives, OCR review workbooks, personal Facebook cookies, `.env` files, credentials, or local research outputs.
- [ ] Inspect `git status` and `git diff --cached --stat` before pushing.
- [ ] Check whether any extra files contain personal data, source photo IDs, signed URLs, or tokens.
- [ ] Keep the copyright/source attribution and demo-data warnings.
- [ ] Choose a license if you intend to allow code reuse; do not assume a public repo automatically becomes open source.
- [ ] Add at least one legitimate dashboard screenshot **from the synthetic demo** only, if desired.
- [ ] Test `npm run typecheck` and `npm run build` inside `dashboard/`.

## Publish with GitHub Desktop

1. Extract the provided GitHub-ready ZIP.
2. Open GitHub Desktop → **File → Add local repository**, select its extracted folder. If prompted, create a repository in that folder.
3. Inspect all changed files in Desktop's Changes tab. Check particularly for unusually large files.
4. Commit your clean release, then **Publish repository**. Choose **Public** only if you are comfortable with the contents being public.
5. Add the repository URL to your CV/LinkedIn, and link the separate live research Site in the README.

## Publish from the command line (optional)

```bash
git init
git add README.md .gitignore requirements.txt dashboard/ scripts/ docs/ data/ tests/
git diff --cached --stat
git commit -m "Initial portfolio demo of Thambuttegama price analytics"
# Add an empty GitHub repository as the remote, then push the current branch.
```

Do not commit `.local/`, original 300 MB Facebook archives, or the private dashboard database. If you accidentally commit an access token, revoke or rotate it immediately; merely deleting the file in a later commit will not erase the Git history.
