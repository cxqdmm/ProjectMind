import { spawn, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

/**
 * 获取指定文件在两个 Git 分支之间的详细差异内容
 * @param {Object} params - 参数对象
 * @param {string} params.repoUrl - Git 仓库地址
 * @param {string} params.branch1 - 基础分支
 * @param {string} params.branch2 - 对比分支
 * @param {string} params.filename - 要查看的文件路径
 * @returns {Object} 返回文件的详细差异内容和统计信息
 */
export async function run({ repoUrl, branch1, branch2, filename }) {
  if (!repoUrl || !branch1 || !branch2 || !filename) {
    throw new Error('缺少必要参数：repoUrl, branch1, branch2, filename 都是必需的');
  }

  // 判断是否为本地仓库
  const repoPath =  path.resolve(repoUrl) ;

  let originalCwd = null;
  let tempDir = null;

  try {
    console.log(`使用本地仓库: ${repoPath}`);
    originalCwd = process.cwd();
    process.chdir(repoPath);
    // 获取所有远程分支
    const remoteBranches = await getGitBranches();

    // 检查分支是否存在
    if (!remoteBranches.includes(branch1)) {
      throw new Error(`基础分支 '${branch1}' 不存在于仓库中`);
    }
    if (!remoteBranches.includes(branch2)) {
      throw new Error(`对比分支 '${branch2}' 不存在于仓库中`);
    }

    // 检查文件是否存在变更
    const fileExists = await runCommand('git', ['diff', '--name-only', `${branch1}...${branch2}`, '--', filename]);

    if (!fileExists) {
      return {
        filename: filename,
        content: '',
        message: `文件 '${filename}' 在 ${branch1} 和 ${branch2} 之间没有变更`,
        stats: { additions: 0, deletions: 0 }
      };
    }

    // 获取文件的详细差异内容
    console.log(`正在获取文件差异: ${filename}`);

    const diffContent = await runCommand('git', ['diff', `${branch1}...${branch2}`, '--', filename]);

    if (!diffContent) {
      return {
        filename: filename,
        content: '',
        message: `文件 '${filename}' 没有检测到差异内容`,
        stats: { additions: 0, deletions: 0 }
      };
    }

    // 获取文件的统计信息
    const stats = await getFileStats(branch1, branch2, filename);

    // 获取文件在两个分支中的内容（用于上下文）
    const originalContent = await getFileContentAtBranch(branch1, filename);
    const newContent = await getFileContentAtBranch(branch2, filename);

    // 生成描述信息
    const repoName = repoUrl.split('/').pop()?.replace('.git', '') || '未知项目';
    const desc = `${repoName} 项目 ${branch1} 分支和 ${branch2} 分支中文件 ${filename} 的 diff 内容`;

    return {
      filename: filename,
      content: diffContent,
      originalContent: originalContent,
      newContent: newContent,
      stats: stats,
      summary: {
        additions: stats.additions,
        deletions: stats.deletions,
        totalChanges: stats.additions + stats.deletions,
        status: stats.status
      },
      desc: desc
    };

  } catch (error) {
    if (error.message.includes('fatal:')) {
      throw new Error(`Git 操作失败: ${error.message.replace('fatal:', '').trim()}`);
    }
    if (error.message.includes('not found')) {
      throw new Error(`文件 '${filename}' 在指定分支中不存在`);
    }
    throw error;
  } finally {
    // 清理临时目录或恢复工作目录
    if (originalCwd) {
      process.chdir(originalCwd);
    }
    if (tempDir) {
      try {
        const { rmSync } = await import('fs');
        rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn(`清理临时目录失败: ${cleanupError.message}`);
      }
    }
  }
}

/**
 * 获取文件统计信息
 */
async function getFileStats(branch1, branch2, filename) {
  try {
    const stats = await runCommand('git', ['diff', '--numstat', `${branch1}...${branch2}`, '--', filename]);

    if (!stats) {
      return { additions: 0, deletions: 0, status: 'unchanged' };
    }

    const [additions, deletions] = stats.split('\t').map(num => parseInt(num) || 0);

    // 判断文件状态
    let status = 'modified';
    if (additions > 0 && deletions === 0) status = 'added';
    else if (additions === 0 && deletions > 0) status = 'deleted';

    return { additions, deletions, status };
  } catch (error) {
    console.warn(`获取文件统计信息失败: ${filename}`, error.message);
    return { additions: 0, deletions: 0, status: 'unknown' };
  }
}

/**
 * 获取文件在指定分支的内容
 */
async function getFileContentAtBranch(branch, filename) {
  try {
    return await runCommand('git', ['show', `${branch}:"${filename}"`]);
  } catch (error) {
    console.warn(`获取文件内容失败: ${filename} @ ${branch}`, error.message);
    return '';
  }
}

/**
 * 执行命令并返回输出
 */
function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { encoding: 'utf8' });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * 获取 Git 分支列表
 */
async function getGitBranches() {
  try {
    const output = await runCommand('git', ['branch', '-r']);
    return output.split('\n')
      .map(b => b.trim().replace('origin/', ''))
      .filter(b => b && !b.includes('HEAD'));
  } catch (error) {
    // 如果没有远程分支，尝试获取本地分支
    try {
      const output = await runCommand('git', ['branch', '-l']);
      return output.split('\n')
        .map(b => b.trim().replace('* ', ''))
        .filter(b => b);
    } catch (localError) {
      throw new Error('无法获取分支列表');
    }
  }
}

// 导出函数供其他脚本使用
export { run as default };