/** Slug seguro para nombre de repo en GitHub (máx. 100 chars). */
export function slugifyForGithubRepo(projectName: string, githubLogin: string): string {
  const login = githubLogin.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const slug = projectName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  const base = slug || "proyecto";
  if (base.startsWith(login)) return base.slice(0, 100);
  const combined = `${login}-${base}`.replace(/--+/g, "-");
  return combined.slice(0, 100);
}
