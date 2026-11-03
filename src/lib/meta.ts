/** 应用元信息。仓库建好之后，把空的字段填上即可。 */

export const APP = {
  name: "Easy Words",
  tagline: "外研社高中英语词汇出题器",
  version: __APP_VERSION__,
  license: "MIT",
  licenseUrl: "https://opensource.org/licenses/MIT",
  /** 仓库地址。建库后填，例如 https://github.com/<user>/easy-words */
  repo: "",
  /** Issue 地址。留空时由 repo 推导。 */
  issues: "",
  author: "ywnh1",
} as const;

export function repoUrl(): string {
  return APP.repo.trim();
}

export function issuesUrl(): string {
  if (APP.issues.trim()) return APP.issues.trim();
  const repo = APP.repo.trim().replace(/\.git$/, "");
  return repo ? `${repo}/issues` : "";
}
