import { execSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

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

  // 创建临时目录用于克隆仓库
  const tempDir = mkdtempSync(join(tmpdir(), 'git-diff-'));
  
  try {
    console.log(`正在克隆仓库: ${repoUrl}`);
    
    // 克隆仓库到临时目录（只获取最新提交）
    execSync(`git clone --depth 100 --single-branch ${repoUrl} ${tempDir}`, {
      stdio: 'pipe',
      encoding: 'utf8'
    });

    // 进入仓库目录
    process.chdir(tempDir);

    // 获取所有远程分支
    const remoteBranches = execSync('git branch -r', {
      encoding: 'utf8'
    }).trim().split('\n').map(b => b.trim().replace('origin/', ''));

    // 检查分支是否存在
    if (!remoteBranches.includes(branch1)) {
      throw new Error(`基础分支 '${branch1}' 不存在于远程仓库中`);
    }
    if (!remoteBranches.includes(branch2)) {
      throw new Error(`对比分支 '${branch2}' 不存在于远程仓库中`);
    }

    // 检查文件是否存在变更
    const fileExists = execSync(`git diff --name-only origin/${branch1}...origin/${branch2} -- "${filename}"`, {
      encoding: 'utf8'
    }).trim();

    if (!fileExists) {
      return {
        filename: filename,
        content: '',
        message: `文件 '${filename}' 在 ${branch1} 和 ${branch2} 之间没有变更',
        stats: { additions: 0, deletions: 0 }
      };
    }

    // 获取文件的详细差异内容
    console.log(`正在获取文件差异: ${filename}`);
    
    const diffContent = execSync(`git diff origin/${branch1}...origin/${branch2} -- "${filename}"`, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024 // 10MB 缓冲区限制
    });

    if (!diffContent) {
      return {
        filename: filename,
        content: '',
        message: `文件 '${filename}' 没有检测到差异内容',
        stats: { additions: 0, deletions: 0 }
      };
    }

    // 获取文件的统计信息
    const stats = getFileStats(branch1, branch2, filename);

    // 获取文件在两个分支中的内容（用于上下文）
    const originalContent = getFileContentAtBranch(branch1, filename);
    const newContent = getFileContentAtBranch(branch2, filename);

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
      }
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
    // 清理临时目录
    try {
      process.chdir('/');
      rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn(`清理临时目录失败: ${cleanupError.message}`);
    }
  }
}

/**
 * 获取文件统计信息
 */
function getFileStats(branch1, branch2, filename) {
  try {
    const stats = execSync(`git diff --numstat origin/${branch1}...origin/${branch2} -- "${filename}"`, {
      encoding: 'utf8'
    }).trim();
    
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
function getFileContentAtBranch(branch, filename) {
  try {
    return execSync(`git show origin/${branch}:"${filename}"`, {
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024 // 5MB 限制
    });
  } catch (error) {
    console.warn(`获取文件内容失败: ${filename} @ ${branch}`, error.message);
    return '';
  }
}

/**
 * 解析差异内容，提取变更的行信息
 */
export function parseDiffLines(diffContent) {
  const lines = diffContent.split('\n');
  const changes = [];
  let currentLine = 0;
  let oldLineNum = 0;
  let newLineNum = 0;
  
  for (const line of lines) {
    currentLine++;
    
    // 解析文件头信息
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        oldLineNum = parseInt(match[1]);
        newLineNum = parseInt(match[3]);
      }
      continue;
    }
    
    // 跳过文件头信息
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff')) {
      continue;
    }
    
    // 记录变更行
    if (line.startsWith('-')) {
      changes.push({
        type: 'deletion',
        line: line.substring(1),
        lineNumber: oldLineNum,
        diffLineNumber: currentLine
      });
      oldLineNum++;
    } else if (line.startsWith('+')) {
      changes.push({
        type: 'addition',
        line: line.substring(1),
        lineNumber: newLineNum,
        diffLineNumber: currentLine
      });
      newLineNum++;
    } else {
      oldLineNum++;
      newLineNum++;
    }
  }
  
  return changes;
}

// 导出函数供其他脚本使用
export { run as default };