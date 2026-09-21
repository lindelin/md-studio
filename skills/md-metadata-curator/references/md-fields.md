# MD 字段与字符规则

核对日期：2026-09-21。以下区分产品默认策略、设备手册证据与当前实现；不要推广为所有型号都能显示所有文字。

| 字段 | 普通 MD / NetMD | Hi-MD 模式 |
|---|---|---|
| 曲名、碟名、组名 | 当前服务提供普通标题及 fullWidthTitle | 当前服务使用单套 Unicode 名称 |
| 艺术家、专辑 | 没有当前服务可写的独立字段；源 metadata 用于编排或经选择拼入名称 | 独立曲目字段 artist、album |
| 分组 | 连续曲目范围，非文件系统文件夹；不能嵌套或交叉分组 | 通过组 API 管理；不要当成本地目录 |

Sony MZ-RH1 手册第 57 页将 Artist、Album 标为仅 Hi-MD 模式。第 58 页说明部分名称的本机重写限制，因此“软件可以写”与“本机可编辑”不同。[Sony 手册（原厂文档镜像）](https://www.minidisc.org/manuals/sony/Sony_MZ-RH1_user_manual.pdf)

Sony MZ-N920 日文手册第 49–50 页列出半角片假名、英数及符号，并说明可用 SonicStage 输入汉字，线控能显示；第 67 页涉及汉字标题显示设置。设备侧是否显示还取决于播放器/线控与设置。[Sony 日文手册（原厂文档镜像）](https://www.minidisc.wiki/_media/equipment/sony/portable/mz_n920_manual_j.pdf)

## 普通 MD 双标题策略

用于曲名、碟名、组名，不存在另外的“半角艺术家/全角艺术家”协议字段。

| 来源 | 普通 title | fullWidthTitle |
|---|---|---|
| 英文 Blue Sky | Blue Sky | Ｂｌｕｅ　Ｓｋｙ |
| 日文 ありがとう | ｱﾘｶﾞﾄｳ | ありがとう |
| 日文 桜，已确认读音 さくら | ｻｸﾗ | 桜 |
| 日文与英语混合 | 日文部分转已确认读音的半角片假名，英文部分保留半角英文 | 保留日文原文，英文部分转全角 |

不要把英文标题翻译成日语。不要把日文汉字换成中文简体。清理不可见控制字符、异常空白与乱码时保留原值；无法可靠恢复就标疑点。不要对最终全角字段做 NFKC，它会折回半角。浊音半角片假名可能占两个码位（如 ｶﾞ），不能按视觉字数估算预算。

当前 netmd-js 的 sanitizeHalfWidthTitle / sanitizeFullWidthTitle 实现字符转换及过滤，日文汉字读音不由它提供。全角通道也不是任意 Unicode 通道：对生僻字、emoji、特殊符号检查编码可表示性，展示丢失或替换，不能说“支持汉字所以都支持”。

## 艺术家、专辑与组名

普通 MD：保留来源 artist/album 供 AI 使用；单专辑可把专辑名用作碟名，多专辑可按专辑分组。需要在播放器看到艺术家时，可提出 Artist - Title 或 Artist - Album 组名等方案，让用户知道它们占用标题空间，而非独立标签。不要默认每首都重复专辑名。

Hi-MD：title、artist、album 保留正确原文，组名独立选择。不要强制把 Hi-MD 的日文 title 变为半角读音，也不要把 fullWidthTitle 作为第二套实际保存的标签。当前 Hi-MD 实现忽略独立 fullWidthTitle。

Sony 官方说明 SonicStage 以专辑传输时可生成同名分组；这支持“按专辑分组”作为一种编排方式，而非强制规则。[Sony 传输说明](https://www.sony.com.au/electronics/support/articles/S500028242)

## 预算与分组边界

Sony 手册中的约 200 字/名称、约 1700 字/普通 MD 等是机型文档的近似说明，不是所有标题通道的通用精确预算。使用当前应用预览和编码后的实际预算。组名及碟名也耗费空间，预览不能只算待录制曲名。

避免在普通 MD 碟名/组名中原样使用 //；N920 手册第 50 页提示这可能影响分组。通过组 API 生成结构，绝不手拼 0;...// 等 TOC 控制串。发现名称冲突时提出替换分隔符并在计划中显示。

## 本地实现依据

相对于 MD Studio 仓库：
- src/services/interfaces/netmd.ts：普通标题/全角标题、分组及设备能力。
- src/services/interfaces/himd.ts：Unicode 名称、artist/album，忽略独立全角字段。
- node_modules/netmd-js/dist/utils.js：安装版本的字符映射与过滤；不要自行重写协议字符表。
- src/domain/recording-title-budget.ts、src/application/import-preview.ts：预算分配与预览。
- src/application/import-upload-session.ts：实际上传字段与 fullWidthSupport 开关。

版本变化时重新核对。以上实现说明不构成所有硬件显示效果的验证。
