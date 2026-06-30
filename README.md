# ResearchGPT-Obsidian
每天晚上可以让GPT总结当天对话，保存到Obsidian作为日报
ResearchGPT-Obsidian 是一个面向 AI 辅助研究与知识管理的 Obsidian + MCP 项目。它包含一个本地 MCP Server、示例 Obsidian Vault、Prompt 模板和项目文档，方便把知识库接入支持 MCP 的 AI 客户端。

ResearchGPT-Obsidian is an Obsidian + MCP project for AI-assisted research and knowledge management. It includes a local MCP server, an example Obsidian vault, prompt templates, and documentation, making it easy to connect a knowledge base to MCP-compatible AI clients.
<img width="1920" height="1020" alt="image" src="https://github.com/user-attachments/assets/a20d7916-a579-405b-a691-83bfe08e120c" />

## 项目结构 / Project Structure

```text
ResearchGPT-Obsidian/
│
├── mcp-server/          ← 开源代码（上传 GitHub） / Open-source code for GitHub
│
├── vault-example/       ← 示例 Vault（上传 GitHub） / Example vault for GitHub
│
├── prompts/             ← Prompt（上传 GitHub） / Prompts for GitHub
│
├── docs/                ← 文档（上传 GitHub） / Documentation for GitHub
│
└── README.md
```

## 目录说明 / Directory Guide

- `mcp-server/`：MCP Server 源码，用于向 AI 客户端暴露 Obsidian Vault 的文件读写能力。  
  `mcp-server/`: MCP Server source code. It exposes safe file operations for an Obsidian vault to AI clients.
- `vault-example/`：示例 Obsidian Vault，可放入示例笔记、日记、Inbox 和知识管理规则。  
  `vault-example/`: Example Obsidian vault for sample notes, daily notes, Inbox content, and knowledge-management rules.
- `prompts/`：项目使用的 Prompt 模板，例如知识整理、论文阅读、日记总结、Inbox 清理等。  
  `prompts/`: Prompt templates used by the project, such as knowledge organization, paper reading, daily summaries, and Inbox cleanup.
- `docs/`：项目文档，例如安装说明、MCP 配置说明、工作流设计和安全注意事项。  
  `docs/`: Project documentation, such as setup guides, MCP configuration, workflow design, and security notes.
- `README.md`：项目入口文档。  
  `README.md`: Project entry document.

## MCP Server 功能 / MCP Server Features

当前 `mcp-server/` 提供以下工具：

The current `mcp-server/` provides these tools:

- `list_vault_files`：列出 Vault 中的文件。  
  `list_vault_files`: List files in the vault.
- `read_vault_file`：读取单个 UTF-8 文本文件。  
  `read_vault_file`: Read a single UTF-8 text file.
- `write_vault_file`：创建文件，或在允许覆盖时替换已有文件。  
  `write_vault_file`: Create a file, or replace an existing file when overwrite is enabled.
- `append_vault_file`：向文件追加内容，不存在时自动创建文件。  
  `append_vault_file`: Append content to a file, creating it automatically if it does not exist.

服务默认监听 `127.0.0.1`，并通过 `MCP_ACCESS_TOKEN` 做访问控制。文件访问会限制在配置的 Vault 根目录内，避免越权读取本机其他路径。

By default, the server listens on `127.0.0.1` and uses `MCP_ACCESS_TOKEN` for access control. File access is restricted to the configured vault root to prevent reading unrelated local paths.

## 快速开始 / Quick Start

进入 MCP Server：

Enter the MCP Server directory:

```powershell
cd mcp-server
```

安装依赖：

Install dependencies:

```powershell
npm install
```

复制环境变量示例：

Copy the environment example:

```powershell
Copy-Item .env.example .env
```

编辑 `.env`：

Edit `.env`:

```env
PORT=3000
VAULT_ROOT=D:\path\to\ResearchGPT-Obsidian\vault-example
MCP_ACCESS_TOKEN=replace-with-a-long-random-token
ALLOWED_ORIGINS=
```

开发模式启动：

Start in development mode:

```powershell
npm run dev
```

构建并启动：

Build and start:

```powershell
npm run build
npm start
```

健康检查：

Health check:

```text
http://127.0.0.1:3000/health
```

## MCP 连接 / MCP Connection

SSE 入口：

SSE endpoint:

```text
GET http://127.0.0.1:3000/sse
```

访问令牌可以通过请求头或查询参数传入：

The access token can be passed through either a request header or a query parameter:

```text
Authorization: Bearer <MCP_ACCESS_TOKEN>
```

```text
http://127.0.0.1:3000/sse?token=<MCP_ACCESS_TOKEN>
```

## 安全说明 / Security Notes

- 不要提交 `mcp-server/.env`。  
  Do not commit `mcp-server/.env`.
- 不要把服务直接暴露到公网。  
  Do not expose the service directly to the public internet.
- `MCP_ACCESS_TOKEN` 建议使用不少于 32 个字符的随机字符串。  
  Use a random `MCP_ACCESS_TOKEN` with at least 32 characters.
- 示例 Vault 只放可公开内容，个人笔记请放在本地私有 Vault 中。  
  Keep only public sample content in the example vault. Store personal notes in a private local vault.
