# MD Studio MCP 操作要点

以客户端实际发现的 tool schema 为准。下列工具来自本项目 bridge/mcp-server.ts；服务名前缀可随客户端变化。没有 MCP 时仍可整理计划，但不能声称已同步网页或已写碟。

## 准备与整理

1. minidisc_get_workspace 读取设备、导入列表、任务和设置。必要时 minidisc_get_status 刷新碟片。先确认没有正在执行的设备任务。
2. 根据 recording.specName / titleStorage 和 capabilities 判断当前模式。metadata.himd 表示独立艺术家/专辑字段，metadata.fullWidth 表示全角字段能力。
3. minidisc_add_imports 接受 inputs: [{path, metadata?}]。先不覆盖不确定标签，让本地解析器读取信息，再 minidisc_list_imports 检查。metadata 不接受 name 或 group；不要传这些字段。不存在本地音乐库工具。
4. minidisc_update_imports 的 updates: [{id, changes:{title, fullWidthTitle, artist, album}}] 可批量更新；使用导入列表的 expectedRevision。minidisc_move_import 使用 id、destinationIndex（从 0 开始），每次使用新 revision。
5. 双标题普通 MD 读取设置，确保 fullWidthSupport 为 true；只有字段有值但开关关闭，上传仍会忽略全角标题。需要时 minidisc_update_settings 使用 changes:{fullWidthSupport:true} 和设置自己的 revision。不要把设备 revision 混用。

内部录制参数与展示名称：SP={codec:SPS,bitrate:292}，MONO={codec:SPM,bitrate:146}，LP2={codec:AT3,bitrate:132}，LP4={codec:AT3,bitrate:66}。必须先核对当前 recording.availableFormats；Hi-MD 使用其实际支持的格式，不能假装只有四种。不要为普通 PCM/WAV 手动设置 forcedEncoding；预编码文件保留解析器判断并检查覆盖最终模式的情况。

## 预览与落盘

minidisc_preview_imports 接受 ids、format、expectedImportRevision、expectedDeviceRevision；检查每曲最终格式、时长/容量、标题预算与 issues。当前预览不提供完整“编码转换后名称对照表”，也不包含计划中新建组的完整预算，因此保留整理对照，检查组名/碟名余量，不能把返回值解释成全流程保证。

当前导入项没有待录制分组字段；在本地计划保留“哪些导入 ID 属于哪个组”，录制成功后重新读取实际曲目索引，再通过 minidisc_create_group 创建连续且未分组的范围（firstTrack、trackCount、title、fullWidthTitle）。不能把导入 ID 或盲算的旧索引当设备索引；部分写入失败时先核对已写内容，禁止重跑整批造成重复。

在用户授权范围内调用 minidisc_write_imports：expectedRevision 是导入 revision，另外传 expectedDeviceSessionId、expectedDeviceRevision，并传与预览相同的 ids/format。任何状态变化使计划失效时重新读取并预览，不机械重试写盘。返回任务 ID 只是启动成功；用 minidisc_get_task 等待实际结果。

碟名：minidisc_rename_disc（title、fullWidthTitle、expectedRevision）。
已录曲目双标题：minidisc_rename_tracks（updates:[{index,title,fullWidthTitle}]、expectedRevision）。
Hi-MD 独立标签：minidisc_rename_himd_tracks（updates:[{index,title,artist,album}]、expectedRevision）。
组名：minidisc_rename_group（index、title、fullWidthTitle、expectedRevision）。
这些是设备修改；按任务授权执行。工具批量校验并不表示物理写入可回滚，失败后读取实际结果。

结束后刷新并对照计划。取消任务是协作式请求，收到响应不等于硬件已停止；查询实际任务状态，无法确认时如实报告，不能用“取消成功”代替设备状态。

## 本地连接

网页中启用 AI 接入并保持设备连接。支持本地 STDIO MCP 的客户端启动项目 npm run mcp（工作目录为项目根目录），或使用 cmd.exe /c npm --prefix <项目绝对路径> run mcp。一个浏览器设备会话对应同一个本地桥接服务；不要为了检查 Skill 启动第二个服务争抢端口。

Skill 可以独立安装，但不自动配置或启用 MCP，也不授予写盘权限。音频分析、转换和传输均在本机；所使用 AI 客户端本身是否把提示词/文字标签发往模型服务，由客户端配置决定，不声称 AI 推理必然离线。
