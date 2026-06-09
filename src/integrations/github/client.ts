import { Octokit } from '@octokit/rest';
import type { Deployment } from '../../types/index';

export class GitHubClient {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  // Fetch deployment history — tries GitHub Deployments API first, falls back to
  // Actions workflow runs if no Deployments entries exist (most repos don't use the API).
  async getDeploymentHistory(
    repo: string,
    environment: string,
    limit = 10
  ): Promise<Deployment[]> {
    const [owner, repoName] = this.splitRepo(repo);

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
        deployedAt: new Date(d.created_at),
        environment: d.environment,
        workflowRunId: undefined,
      }));
    }

    // Fallback: pull recent successful Actions runs — works for any repo with CI
    return this.getRecentRuns(repo, environment, limit);
  }

  // All recent workflow runs for a repo, across all workflows.
  // Used as fallback when the Deployments API returns nothing.
  async getRecentRuns(
    repo: string,
    environment: string,
    limit = 10
  ): Promise<Deployment[]> {
    const [owner, repoName] = this.splitRepo(repo);

    const { data } = await this.octokit.actions.listWorkflowRunsForRepo({
      owner,
      repo: repoName,
      per_page: limit,
    });

    if (data.workflow_runs.length > 0) {
      return data.workflow_runs.slice(0, limit).map((run) => ({
        id: String(run.id),
        serviceId: repo,
        sha: run.head_sha,
        ref: run.head_branch ?? 'main',
        message: run.display_title ?? run.name ?? '',
        author: run.triggering_actor?.login ?? 'unknown',
        deployedAt: new Date(run.created_at),
        environment,
        workflowRunId: run.id,
      }));
    }

    // Last resort: use recent commits — always available for any repo
    return this.getRecentCommitsAsDeploys(repo, environment, limit);
  }

  // Maps recent commits to deployments — used when no CI data is available.
  private async getRecentCommitsAsDeploys(
    repo: string,
    environment: string,
    limit = 10
  ): Promise<Deployment[]> {
    const [owner, repoName] = this.splitRepo(repo);

    const { data } = await this.octokit.repos.listCommits({
      owner,
      repo: repoName,
      per_page: limit,
    });

    return data.map((commit) => ({
      id: commit.sha,
      serviceId: repo,
      sha: commit.sha,
      ref: 'main',
      message: commit.commit.message.split('\n')[0] ?? '',
      author: commit.commit.author?.name ?? commit.author?.login ?? 'unknown',
      deployedAt: new Date(commit.commit.author?.date ?? commit.commit.committer?.date ?? Date.now()),
      environment,
      workflowRunId: undefined,
    }));
  }

  // Fetch workflow run history for a specific workflow file
  async getWorkflowRunHistory(
    repo: string,
    workflowFileName: string,
    branch = 'main',
    limit = 10
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
      deployedAt: new Date(run.created_at),
      environment: 'production',
      workflowRunId: run.id,
    }));
  }

  // Get the diff between two SHAs
  async getCommitDiff(
    repo: string,
    baseSha: string,
    headSha: string
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

  // Get a single commit to read its message
  async getCommit(repo: string, sha: string): Promise<{ message: string; author: string }> {
    const [owner, repoName] = this.splitRepo(repo);
    const { data } = await this.octokit.repos.getCommit({ owner, repo: repoName, ref: sha });
    return {
      message: data.commit.message.split('\n')[0] ?? '',
      author: data.commit.author?.name ?? data.author?.login ?? 'unknown',
    };
  }

  private splitRepo(repo: string): [string, string] {
    const parts = repo.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`Invalid repo format "${repo}". Expected "owner/repo".`);
    }
    return [parts[0], parts[1]];
  }
}
