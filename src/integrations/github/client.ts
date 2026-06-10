import { Octokit } from '@octokit/rest';
import type { Deployment } from '../../types/index';

// Maps environment names to the branch that gets deployed to them
const ENV_BRANCH: Record<string, string> = {
  production: 'main',
  staging: 'staging',
  development: 'develop',
};

export class GitHubClient {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async getDeploymentHistory(
    repo: string,
    environment: string,
    limit = 10,
  ): Promise<Deployment[]> {
    const [owner, repoName] = this.splitRepo(repo);

    // 1. Try GitHub Deployments API (works when repos use environment-linked workflows)
    try {
      const { data: ghDeployments } = await this.octokit.repos.listDeployments({
        owner,
        repo: repoName,
        environment,
        per_page: limit,
      });

      if (ghDeployments.length > 0) {
        return ghDeployments.slice(0, limit).map((d) => ({
          id: String(d.id),
          serviceId: repo,
          sha: d.sha,
          ref: d.ref,
          message: typeof d.payload === 'object' && d.payload !== null
            ? String((d.payload as Record<string, unknown>)['description'] ?? '')
            : '',
          author: d.creator?.login ?? 'unknown',
          avatarUrl: d.creator?.avatar_url,
          commitUrl: `https://github.com/${owner}/${repoName}/commit/${d.sha}`,
          deployedAt: new Date(d.created_at),
          environment: d.environment,
          source: 'deployment' as const,
          workflowRunId: undefined,
        }));
      }
    } catch {
      // fall through
    }

    // 2. Try Actions workflow runs
    try {
      const runs = await this.getRecentRuns(repo, environment, limit);
      if (runs.length > 0) return runs;
    } catch {
      // fall through
    }

    // 3. Fall back to commits on the environment's branch
    const branch = ENV_BRANCH[environment] ?? 'main';
    return this.getRecentCommitsAsDeploys(repo, environment, branch, limit);
  }

  async getRecentRuns(repo: string, environment: string, limit = 10): Promise<Deployment[]> {
    const [owner, repoName] = this.splitRepo(repo);

    const { data } = await this.octokit.actions.listWorkflowRunsForRepo({
      owner,
      repo: repoName,
      per_page: limit,
    });

    if (data.workflow_runs.length === 0) return [];

    return data.workflow_runs.slice(0, limit).map((run) => ({
      id: String(run.id),
      serviceId: repo,
      sha: run.head_sha,
      ref: run.head_branch ?? 'main',
      message: run.display_title ?? run.name ?? '',
      author: run.triggering_actor?.login ?? 'unknown',
      avatarUrl: run.triggering_actor?.avatar_url,
      commitUrl: `https://github.com/${owner}/${repoName}/commit/${run.head_sha}`,
      deployedAt: new Date(run.created_at),
      environment,
      source: 'run' as const,
      workflowRunId: run.id,
    }));
  }

  private async getRecentCommitsAsDeploys(
    repo: string,
    environment: string,
    branch: string,
    limit = 10,
  ): Promise<Deployment[]> {
    const [owner, repoName] = this.splitRepo(repo);

    // If the requested branch doesn't exist, fall back to the default branch
    let resolvedBranch = branch;
    try {
      await this.octokit.repos.getBranch({ owner, repo: repoName, branch });
    } catch {
      resolvedBranch = 'main';
    }

    const { data } = await this.octokit.repos.listCommits({
      owner,
      repo: repoName,
      sha: resolvedBranch,
      per_page: limit,
    });

    return data.map((commit) => ({
      id: commit.sha,
      serviceId: repo,
      sha: commit.sha,
      ref: resolvedBranch,
      message: commit.commit.message.split('\n')[0] ?? '',
      author: commit.commit.author?.name ?? commit.author?.login ?? 'unknown',
      avatarUrl: commit.author?.avatar_url,
      commitUrl: `https://github.com/${owner}/${repoName}/commit/${commit.sha}`,
      deployedAt: new Date(
        commit.commit.author?.date ?? commit.commit.committer?.date ?? Date.now(),
      ),
      environment,
      source: 'commit' as const,
      workflowRunId: undefined,
    }));
  }

  async getDetailedDiff(
    repo: string,
    baseSha: string,
    headSha: string,
  ): Promise<{
    files: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>;
    additions: number;
    deletions: number;
    commitMessages: string[];
  }> {
    const [owner, repoName] = this.splitRepo(repo);

    const compareRes = await this.octokit.repos.compareCommits({
      owner,
      repo: repoName,
      base: baseSha,
      head: headSha,
    });

    const files = (compareRes.data.files ?? []).map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions ?? 0,
      deletions: f.deletions ?? 0,
      patch: f.patch,
    }));

    const additions = files.reduce((acc, f) => acc + f.additions, 0);
    const deletions = files.reduce((acc, f) => acc + f.deletions, 0);

    // Commits that are in head but not in base (what will be reverted)
    const commitMessages = compareRes.data.commits
      .map((c) => c.commit.message.split('\n')[0] ?? '')
      .filter(Boolean);

    return { files, additions, deletions, commitMessages };
  }

  async getCommitDiff(
    repo: string,
    baseSha: string,
    headSha: string,
  ): Promise<{ files: string[]; additions: number; deletions: number; summary: string }> {
    const [owner, repoName] = this.splitRepo(repo);
    const { data } = await this.octokit.repos.compareCommits({
      owner,
      repo: repoName,
      base: baseSha,
      head: headSha,
    });
    const files = (data.files ?? []).map((f) => f.filename);
    const additions = (data.files ?? []).reduce((acc, f) => acc + (f.additions ?? 0), 0);
    const deletions = (data.files ?? []).reduce((acc, f) => acc + (f.deletions ?? 0), 0);
    return {
      files,
      additions,
      deletions,
      summary: `${data.ahead_by} commits ahead, ${data.behind_by} commits behind. ${files.length} files changed (+${additions} / -${deletions})`,
    };
  }

  async getCommit(repo: string, sha: string): Promise<{ message: string; author: string }> {
    const [owner, repoName] = this.splitRepo(repo);
    const { data } = await this.octokit.repos.getCommit({ owner, repo: repoName, ref: sha });
    return {
      message: data.commit.message.split('\n')[0] ?? '',
      author: data.commit.author?.name ?? data.author?.login ?? 'unknown',
    };
  }

  async getWorkflowRunHistory(
    repo: string,
    workflowFileName: string,
    branch = 'main',
    limit = 10,
  ): Promise<Deployment[]> {
    const [owner, repoName] = this.splitRepo(repo);
    const { data } = await this.octokit.actions.listWorkflowRuns({
      owner,
      repo: repoName,
      workflow_id: workflowFileName,
      branch,
      status: 'success',
      per_page: limit,
    });
    return data.workflow_runs.map((run) => ({
      id: String(run.id),
      serviceId: repo,
      sha: run.head_sha,
      ref: run.head_branch ?? branch,
      message: run.display_title ?? run.name ?? '',
      author: run.triggering_actor?.login ?? 'unknown',
      avatarUrl: run.triggering_actor?.avatar_url,
      commitUrl: `https://github.com/${owner}/${repoName}/commit/${run.head_sha}`,
      deployedAt: new Date(run.created_at),
      environment: 'production',
      source: 'run' as const,
      workflowRunId: run.id,
    }));
  }

  private splitRepo(repo: string): [string, string] {
    const parts = repo.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`Invalid repo format "${repo}". Expected "owner/repo".`);
    }
    return [parts[0], parts[1]];
  }
}
