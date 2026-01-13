import { spawn, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

/**
 * 获取两个 Git 分支之间的变更文件列表
 * @param {Object} params - 参数对象
 * @param {string} params.repoUrl - Git 仓库地址（支持 HTTPS 和 SSH）或本地路径
 * @param {string} params.branch1 - 基础分支（如 main）
 * @param {string} params.branch2 - 对比分支（如 feature-branch）
 * @returns {Object} 返回变更文件列表和统计信息
 */
export async function run({ repoUrl, branch1, branch2 }) {
  if (!repoUrl || !branch1 || !branch2) {
    throw new Error('缺少必要参数：repoUrl, branch1, branch2 都是必需的');
  }

  // 判断是否为本地仓库
  const isLocalRepo = !repoUrl.startsWith('http') && !repoUrl.startsWith('git@') && existsSync(repoUrl);
  const repoPath = isLocalRepo ? path.resolve(repoUrl) : repoUrl;
  
  let originalCwd = null;
  let tempDir = null;

  try {
    if (isLocalRepo) {
      console.log(`使用本地仓库: ${repoPath}`);
      originalCwd = process.cwd();
      process.chdir(repoPath);
    } else {
      console.log(`正在克隆仓库: ${repoUrl}`);
      // 创建临时目录用于克隆远程仓库
      const { mkdtempSync } = await import('fs');
      const { tmpdir } = await import('os');
      const { join } = await import('path');
      tempDir = mkdtempSync(join(tmpdir(), 'git-review-'));
      
      // 克隆仓库到临时目录（只获取最新提交，减少网络传输）
      await runCommand('git', ['clone', '--depth', '100', '--single-branch', repoUrl, tempDir]);
      process.chdir(tempDir);
    }

    // 获取所有远程分支
    const remoteBranches = await getGitBranches();

    // 检查分支是否存在
    if (!remoteBranches.includes(branch1)) {
      throw new Error(`基础分支 '${branch1}' 不存在于仓库中`);
    }
    if (!remoteBranches.includes(branch2)) {
      throw new Error(`对比分支 '${branch2}' 不存在于仓库中`);
    }

    // 获取两个分支之间的差异文件列表
    console.log(`正在比较分支: ${branch1}...${branch2}`);
    
    const diffOutput = await runCommand('git', ['diff', '--name-status', `${branch1}...${branch2}`]);

    if (!diffOutput) {
      return {
        files: [],
        totalChanges: 0,
        message: '两个分支之间没有差异'
      };
    }

    // 解析差异文件列表
    const files = [];
    const lines = diffOutput.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const [status, ...filenameParts] = line.split('\t');
      const filename = filenameParts.join('\t');
      
      // 获取文件统计信息
      const stats = await getFileStats(branch1, branch2, filename);
      
      files.push({
        filename: filename,
        status: getStatusText(status),
        statusCode: status,
        additions: stats.additions,
        deletions: stats.deletions,
        changes: stats.additions + stats.deletions
      });
    }

    // 统计总数
    const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
    const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);

    // 生成描述信息
    const repoName = repoUrl.split('/').pop()?.replace('.git', '') || '未知项目';
    const desc = `${repoName} 项目 ${branch1} 分支和 ${branch2} 分支 diff 后的差异文件列表`;

    return {
      files: files,
      totalChanges: files.length,
      totalAdditions: totalAdditions,
      totalDeletions: totalDeletions,
      summary: {
        modified: files.filter(f => f.statusCode === 'M').length,
        added: files.filter(f => f.statusCode === 'A').length,
        deleted: files.filter(f => f.statusCode === 'D').length,
        renamed: files.filter(f => f.statusCode === 'R').length
      },
      desc: desc
    };

  } catch (error) {
    if (error.message.includes('fatal:')) {
      throw new Error(`Git 操作失败: ${error.message.replace('fatal:', '').trim()}`);
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

/**
 * 获取文件统计信息
 */
async function getFileStats(branch1, branch2, filename) {
  try {
    const stats = await runCommand('git', ['diff', '--numstat', `${branch1}...${branch2}`, '--', filename]);
    
    if (!stats) {
      return { additions: 0, deletions: 0 };
    }
    
    const [additions, deletions] = stats.split('\t').map(num => parseInt(num) || 0);
    return { additions, deletions };
  } catch (error) {
    console.warn(`获取文件统计信息失败: ${filename}`, error.message);
    return { additions: 0, deletions: 0 };
  }
}

/**
 * 获取文件状态文本
 */
function getStatusText(statusCode) {
  const statusMap = {
    'M': 'modified',
    'A': 'added',
    'D': 'deleted',
    'R': 'renamed',
    'C': 'copied',
    'U': 'updated'
  };
  return statusMap[statusCode] || 'unknown';
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

// 导出函数供其他脚本使用
export { run as default };