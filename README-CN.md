# Zotero → ElevenReader

[English README](README.md)

这是一个 Zotero 插件, 用 **ElevenReader** (ElevenLabs 公司的文本转语音阅读应用) 朗读论文。插件调用你自己已登录的 Google Chrome 与 ElevenReader 网页版。每个 PDF 只导入 ElevenReader **一次**; 之后插件只在 ElevenReader 中打开它, 并跳到你选中的句子。

- **在 ElevenReader 中打开 PDF**: 在文库条目列表中右击一篇论文。首次使用时插件把该论文的 PDF 导入 ElevenReader, 之后每次都在 ElevenReader 的阅读页中打开它。
- **在 ElevenReader 中从此处朗读**: 在 Zotero 的 PDF 阅读器中选中一个句子, 点击选择浮窗中的该按钮 (或在右键菜单中选择)。这篇论文必须已经在 Chrome 的 ElevenReader 中打开 (用 **在 ElevenReader 中打开 PDF**)。插件在已打开的阅读页中用 ElevenReader 自带的 **Find in text** (文中查找) 找到该句子, 并点击它的第一个单词, 于是 ElevenReader 从这里开始朗读, 直到你停止。
- 使用你平时的 Chrome 窗口和你平时的 ElevenReader 账号; 不需要另建浏览器配置目录, 也不需要安装额外的 Chrome 扩展。
- 在 Zotero 11.0-beta.4 (Linux, Ubuntu 24.04) 与 Google Chrome 157 上开发; 面向 Linux、macOS、Windows 上的 Zotero 8 – 11 编写。

## 工作原理

```
Zotero ──(PDF 文件, 选中的句子)──▶ 插件 ──经本机 WebSocket 的 Chrome 开发者工具协议──▶ 正在运行的 Chrome
                                                                                          │
   首次:  elevenreader.io/reader/library  Import → 选择 PDF → Upload → 打开新条目
   每次:  elevenreader.io/reader/library/<阅读条目 ID>  ⋯ → Find in text → 点击句子的第一个单词
```

1. Google Chrome 从 144 版起, 可以为正在运行的浏览器开启**远程调试服务** (remote-debugging server): 在 `chrome://inspect/#remote-debugging` 打开开关即可。之后 Chrome 只在 `127.0.0.1` 上监听, 通常是 9222 端口 (该页面会显示端口)。
2. 插件用 **Chrome 开发者工具协议** (Chrome DevTools Protocol, CDP; 即 Chrome 自带开发者工具所用的协议) 连接该端口。Chrome 会请你点击 **Allow** (允许); 在 macOS 上, 插件会先用 `open -a` 打开 ElevenReader 页面, 让 Chrome 有一个显示该对话框的窗口并切到前台。插件在 Zotero 运行期间保持这一条连接, 所以只有在 Zotero 或 Chrome 重启后 Chrome 才会再次询问。
3. **导入 (每个 PDF 一次)。** 插件在 ElevenReader 书库页点击 **Import**, 在对话框中选择该 PDF 文件, 点击 **Upload**, 等待 ElevenReader 提取完 PDF 的文字, 然后打开新条目。该条目的地址 (`/reader/library/<阅读条目 ID>`) 按 Zotero 附件记录在 Zotero 数据目录下的 `zotero-eleven-reads.json` 中。如果之后在 ElevenReader 中删除了该条目, 下一次请求会重新导入。
4. **从某个句子开始朗读。** 插件在 Chrome 中已打开的阅读页 (若该 PDF 记录的阅读页已打开则用它, 否则用第一个已打开的阅读页) 打开 **⋯ (Read options, 阅读选项) → Find in text**, 查找选中文本的开头 (先查前 12 个词; 找不到再查前 6 个、前 3 个), 在该开头恰好出现一次时点击匹配处的第一个单词。这些都是真实的浏览器输入事件, 因此 Chrome 把这次点击视为用户操作, 允许音频开始播放。

如果 Chrome 没有运行, 插件会启动 Chrome 并打开 ElevenReader 书库页面, 最多等待 30 秒直到远程调试服务可用。

## 环境要求

| 组件 | 要求 |
|---|---|
| Zotero | 8、9、10 或 11 |
| Google Chrome | 144 或更高版本, 且已在 `chrome://inspect/#remote-debugging` 开启远程调试 |
| ElevenReader | 一个账号, 并已在该 Chrome 中登录 <https://elevenreader.io> |
| 构建插件 | [`uv`](https://docs.astral.sh/uv/) 与 Python 3.10 或更高版本 (只用标准库) |

## 快速开始

1. 构建插件文件 `build/zotero-eleven-<版本号>.xpi` (见 [INSTALL.md](INSTALL.md)), 或从发布页 (release) 下载。
2. 在 Zotero 中: **Tools (工具) → Plugins (插件) →** 齿轮图标 **→ Install Plugin From File… (从文件安装插件)**, 选择该 `.xpi` 文件。
3. 在 Chrome 中: 打开 `chrome://inspect/#remote-debugging`, 开启 **Allow remote debugging for this browser instance** (允许远程调试此浏览器实例); 并登录 <https://elevenreader.io>。
4. 在 Zotero 中右击一篇论文, 选择 **在 ElevenReader 中打开 PDF**, 完成 (一次性的) 导入; 然后在 Zotero 的 PDF 阅读器中选中一个句子, 点击 **在 ElevenReader 中从此处朗读**。Chrome 询问是否允许连接时, 点击 **Allow**。

逐步使用说明、设置项与故障排查见 [RUN.md](RUN.md) (英文)。

## 构建 Zotero 可直接安装的发布版

Zotero 插件是扩展名为 `.xpi` 的 ZIP 压缩包, 顶层包含 `manifest.json`。

```bash
uv run --project /绝对路径/zotero-eleven python /绝对路径/zotero-eleven/scripts/build.py
```

该命令生成两个文件:

- `build/zotero-eleven-<版本号>.xpi`: 在 Zotero 中通过 **Install Plugin From File…** 安装。
- `build/update.json`: 更新清单。Zotero 从 `manifest.json` 中 `applications.zotero.update_url` 指向的地址下载它, 以发现新版本。

发布版本 `X.Y.Z` 的步骤:

1. 把 `addon/manifest.json` 中的 `"version"` 改为 `"X.Y.Z"`。
2. 运行上面的构建命令。
3. 在 `gulubao/zotero-eleven` 创建 GitHub 发布 `vX.Y.Z`, 上传 `zotero-eleven-X.Y.Z.xpi` 与 `update.json`。`update.json` 指向 `releases/download/vX.Y.Z/` 下的 `.xpi`; `manifest.json` 让 Zotero 读取 `releases/latest/download/update.json`。

## 安全提示

开启 Chrome 远程调试后, 本机程序可以请求完全控制该 Chrome, 包括其 Cookie 与网站数据。Chrome 在接受每个新连接前都会询问你。只在你刚刚让 Zotero 打开 PDF 或朗读时点击 Allow。不再需要时, 可在 `chrome://inspect/#remote-debugging` 关闭该开关。

## 已知限制

- 插件依靠 ElevenReader 页面上可见的英文标签 (**Import**、**Upload**、**Play**、**Read options**、**Find in text**) 与页面结构定位控件。ElevenReader 改版后这些步骤可能失效, 此时插件会报告是哪一步找不到。
- Find in text 按字面匹配选中的词 (只忽略大小写)。如果 ElevenReader 对该句的提取结果不同 (例如断行连字符、脚注标记、公式), 可能只有更短的开头能匹配。插件只在开头恰好出现一次时朗读; 出现多次时 (3 个词的开头和很短的选择常会如此), 插件提示你选择更长的一段, 而不是猜测位置。
- ElevenReader 按它提取的文字朗读 PDF, 对论文而言通常包括页眉、参考文献和图注。
- 只支持 PDF 附件。在本插件记录之前 (例如手动) 导入过的 PDF 会再被导入一次。用量计入你的 ElevenReader 套餐。
- 在 macOS 上, PDF 文件由 Chrome 自己读取。如果 PDF 位于 macOS 保护的文件夹 (文稿、桌面、下载、iCloud 云盘、外接或网络磁盘), macOS 会询问一次是否允许 Google Chrome 访问, 请点允许。Zotero 默认的存储文件夹 `~/Zotero` 不受保护。

## 项目结构

```
addon/                      插件本体 (原样打包进 .xpi)
  manifest.json             插件标识与支持的 Zotero 版本
  bootstrap.js              Zotero 入口: 加载下列类, 启动与停止插件
  prefs.js                  默认设置 (远程调试端口与 Chrome 程序)
  content/
    zotero-eleven.js        ZoteroEleven: 组装各部分, 请求排队, 在 Zotero 中显示进度
    read-registry.js        ReadRegistry: 记录 Zotero PDF 附件与 ElevenReader 阅读条目的对应关系
    reader-integration.js   ReaderIntegration: PDF 阅读器选择浮窗与右键菜单中的“从此处朗读”
    library-integration.js  LibraryIntegration: 文库条目右键菜单中的“在 ElevenReader 中打开 PDF”
    elevenreader-web.js     ElevenReaderWeb (打开/导入、已打开的阅读页)、ElevenReaderRead (文中查找并从某词开始朗读)、
                            ElevenReaderTab (轮询)、elevenReaderPage (在网页中运行的函数)
    chrome-browser.js       ChromeBrowser + ChromePage: 查找、启动并连接正在运行的 Chrome
    cdp-connection.js       CDPConnection: 基于 Gecko WebSocket 通道的 Chrome 开发者工具协议客户端
  locale/en-US, locale/zh-CN  界面文字 (Fluent 本地化格式)
scripts/build.py            生成 build/*.xpi 与 build/update.json
```
