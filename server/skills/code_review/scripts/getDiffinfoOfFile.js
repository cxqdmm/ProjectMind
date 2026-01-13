import { spawn } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'

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
    throw new Error('缺少必要参数：repoUrl, branch1, branch2, filename 都是必需的')
  }

  const repoPath = path.resolve(repoUrl)
  if (!existsSync(repoPath) || !existsSync(path.join(repoPath, '.git'))) {
    throw new Error(`repoUrl 不是有效的本地 Git 仓库路径: ${repoPath}`)
  }

  try {
    const remoteBranches = await getGitBranches(repoPath)

    // 检查分支是否存在
    if (!remoteBranches.includes(branch1)) {
      throw new Error(`基础分支 '${branch1}' 不存在于仓库中`)
    }
    if (!remoteBranches.includes(branch2)) {
      throw new Error(`对比分支 '${branch2}' 不存在于仓库中`)
    }

    // 检查文件是否存在变更
    const fileExists = await runCommand(
      'git',
      ['diff', '--name-only', `${branch1}...${branch2}`, '--', filename],
      { cwd: repoPath }
    )

    if (!fileExists) {
      return {
        filename,
        content: '',
        message: `文件 '${filename}' 在 ${branch1} 和 ${branch2} 之间没有变更`,
        stats: { additions: 0, deletions: 0 },
        desc: `${repoUrl} 仓库 ${branch1} 分支和 ${branch2} 分支中文件 ${filename} 的 diff 内容`,
      }
    }

    // 获取文件的详细差异内容
    const diffContent = await runCommand('git', ['diff', `${branch1}...${branch2}`, '--', filename], {
      cwd: repoPath,
    })

    if (!diffContent) {
      return {
        filename,
        content: '',
        message: `文件 '${filename}' 没有检测到差异内容`,
        stats: { additions: 0, deletions: 0 },
        desc: `${repoUrl} 仓库 ${branch1} 分支和 ${branch2} 分支中文件 ${filename} 的 diff 内容`,
      }
    }

    // 获取文件的统计信息
    const stats = await getFileStats(repoPath, branch1, branch2, filename)

    // 获取文件在两个分支中的内容（用于上下文）
    const originalContent = await getFileContentAtBranch(repoPath, branch1, filename)
    const newContent = await getFileContentAtBranch(repoPath, branch2, filename)

    // 生成描述信息
    const repo = String(repoUrl || '未知仓库')
    const desc = `${repo} 仓库 ${branch1} 分支和 ${branch2} 分支中文件 ${filename} 的 diff 内容`

    return {
      filename,
      content: diffContent,
      originalContent: originalContent,
      newContent: newContent,
      stats: stats,
      summary: {
        additions: stats.additions,
        deletions: stats.deletions,
        totalChanges: stats.additions + stats.deletions,
        status: stats.status,
      },
      desc: desc,
    }
  } catch (error) {
    if (String(error?.message || '').includes('fatal:')) {
      throw new Error(`Git 操作失败: ${String(error.message).replace('fatal:', '').trim()}`)
    }
    if (String(error?.message || '').includes('not found')) {
      throw new Error(`文件 '${filename}' 在指定分支中不存在`)
    }
    throw error
  }
}

/**
 * 获取文件统计信息
 */
async function getFileStats(cwd, branch1, branch2, filename) {
  try {
    const stats = await runCommand(
      'git',
      ['diff', '--numstat', `${branch1}...${branch2}`, '--', filename],
      { cwd }
    )

    if (!stats) {
      return { additions: 0, deletions: 0, status: 'unchanged' }
    }

    const [additions, deletions] = stats.split('\t').map((num) => parseInt(num) || 0)

    // 判断文件状态
    let status = 'modified'
    if (additions > 0 && deletions === 0) status = 'added'
    else if (additions === 0 && deletions > 0) status = 'deleted'

    return { additions, deletions, status }
  } catch (error) {
    console.warn(`获取文件统计信息失败: ${filename}`, String(error?.message || error))
    return { additions: 0, deletions: 0, status: 'unknown' }
  }
}

/**
 * 获取文件在指定分支的内容
 */
async function getFileContentAtBranch(cwd, branch, filename) {
  try {
    return await runCommand('git', ['show', `${branch}:${filename}`], { cwd })
  } catch (error) {
    const msg = String(error?.message || error)
    if (msg.includes('does not exist in') || msg.includes('Path') || msg.includes('pathspec')) {
      return ''
    }
    console.warn(`获取文件内容失败: ${filename} @ ${branch}`, msg)
    return ''
  }
}

/**
 * 执行命令并返回输出
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`))
      }
    })

    child.on('error', (error) => {
      reject(error)
    })
  })
}

/**
 * 获取 Git 分支列表
 */
async function getGitBranches(cwd) {
  try {
    const output = await runCommand('git', ['branch', '-r'], { cwd })
    return output.split('\n')
      .map((b) => b.trim().replace('origin/', ''))
      .filter((b) => b && !b.includes('HEAD'))
  } catch (error) {
    // 如果没有远程分支，尝试获取本地分支
    try {
      const output = await runCommand('git', ['branch', '-l'], { cwd })
      return output.split('\n')
        .map((b) => b.trim().replace('* ', ''))
        .filter((b) => b)
    } catch (localError) {
      throw new Error('无法获取分支列表')
    }
  }
}

// 导出函数供其他脚本使用
export { run as default }
