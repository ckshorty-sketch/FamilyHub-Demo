# FamilyHub-Demo

- This is the standalone public demonstration of FamilyHub, without Nextcloud or any account/service integration. Keep the real Nextcloud project separate.
- The user requested a public demo link and the public GitHub repository `ckshorty-sketch/FamilyHub-Demo`. Preserve that audience. Use fictional data exclusively.
- Persist demo changes only in the visitor's browser. Role switching simulates user perspectives; it is not real authentication. Weather and calendar-service imports must be clearly labelled simulations.
- Keep all functions usable: calendar, recurring tasks, parent approval, points journal, rewards, fairness, multi-list shopping, family settings, kitchen, export/import/reset.
- Test relevant changes, commit and push to the requested GitHub repository and the registered Sites source remote, then publish the matching static artifact. Preserve `.openai/hosting.json` project_id.
- Never commit access credentials, real family data, node_modules or session files. New Sites credentials remain in memory and are passed only via stdin.
- This static app uses plain ES modules and no frontend build. Deployable files are in `dist/`. Hosting requires `.openai/hosting.json` plus those static files in the archive.
