import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const expectedVercelProject = {
  projectId: "prj_7hJhGdgUtCmonOXuOudqm7D48dmz",
  orgId: "team_h6ZwzwfpcrqR0oglI4xFdnaM",
};

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function readVercelProjectLink(root = ".") {
  const projectPath = join(root, ".vercel", "project.json");
  if (existsSync(projectPath)) {
    const project = readJson(projectPath);
    return project ? { projectId: project.projectId, orgId: project.orgId, name: project.projectName } : null;
  }

  const repositoryPath = join(root, ".vercel", "repo.json");
  if (!existsSync(repositoryPath)) return null;
  const repository = readJson(repositoryPath);
  const project = repository?.projects?.find((candidate) => candidate.directory === ".");
  return project ? { projectId: project.id, orgId: project.orgId, name: project.name } : null;
}

export function isExpectedVercelProject(project) {
  return project?.projectId === expectedVercelProject.projectId
    && project?.orgId === expectedVercelProject.orgId;
}
