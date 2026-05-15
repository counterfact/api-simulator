---
'counterfact': patch
---

Remove patch-package dependency and postinstall script. The patches for http-proxy and tsutils are no longer needed since those packages are no longer direct dependencies. Removing the postinstall script also eliminates a potential security concern with pnpm's strictDepBuilds setting.
